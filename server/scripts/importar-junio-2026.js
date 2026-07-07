// Importación histórica de la nómina de Junio 2026 desde los archivos Excel/TXT
// del proceso manual (carpeta informacindelprocesodenminacarrosyayautoclub/).
//
// Uso (desde server/):
//   node scripts/importar-junio-2026.js            # dry-run: parsea y valida, no escribe
//   node scripts/importar-junio-2026.js --commit   # escribe todo en una transacción
//
// Qué importa: colaboradores (con datos bancarios), contratos, 2 períodos
// (cerrados), roles_pago (pagados) con sus lineas_rol, y provisiones de la
// segunda quincena. Cada fila se valida contra el "Total a recibir"/"A PAGAR"
// del Excel; si hay diferencias > $0.02 el commit se aborta.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import XLSX from 'xlsx';
import { round2 } from '../src/lib/round.js';
import { calcularTotales } from '../src/lib/calculo.js';

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'informacindelprocesodenminacarrosyayautoclub'
);

const ARCHIVOS = [
  { archivo: 'PERIODO JUNIO PRIMERA QUINCENA.xls', empresa: 'BOPELUAL S.A.', quincena: 1 },
  { archivo: 'PERIODO JUNIO PRIMERA QUINCENA_1.xls', empresa: 'CARROS-YA S.A.', quincena: 1 },
  { archivo: 'PERIODO JUNIO SEGUNDA QUINCENA 2026.xls', empresa: 'BOPELUAL S.A.', quincena: 2 },
  { archivo: 'PERIODO JUNIO SEGUNDA QUINCENA.xls', empresa: 'CARROS-YA S.A.', quincena: 2 },
];

// TXT Cash Management Pichincha con datos bancarios de servicios profesionales
// (los Excel de externos no traen cédula ni cuenta; los TXT sí).
const TXT_SERV_PROF = ['SERV PROF 2DA DE JUNIO.txt', 'TXT SERV PROF CARROS YA.txt', 'TXT SERV PROF CARROS YA_1.txt'];

const PERIODOS = {
  1: { nombre: 'Junio 2026 - Primera Quincena', fecha_inicio: '2026-06-01', fecha_fin: '2026-06-15' },
  2: { nombre: 'Junio 2026 - Segunda Quincena', fecha_inicio: '2026-06-16', fecha_fin: '2026-06-30' },
};

const CODIGO_BANCO = {
  'BANCO PICHINCHA': '10',
  'BANCO GUAYAQUIL': '17',
  'BANCO DEL PACIFICO': '30',
  'BANCO PRODUBANCO': '36',
  'BANCO BOLIVARIANO': '37',
};

// Concepto del Excel (normalizado) → tipo_linea canónico de la plataforma.
const TIPOS = {
  'TRANSPORTE': 'TRANSPORTE',
  'OTROS': 'OTROS_INGRESOS',
  'DECIMO TERCERO': 'DECIMO_TERCERO',
  'DECIMO CUARTO': 'DECIMO_CUARTO',
  'FONDOS RESERVA': 'FONDOS_RESERVA',
  'H. EXTRAS': 'HORAS_EXTRAS',
  '17.60% IESS': 'IESS_PATRONAL',
  '9.45% IESS': 'IESS_PERSONAL',
  'ALIMENTACION': 'ALIMENTACION',
  'ALIMENTACION2': 'ALIMENTACION',
  'ANTICIPO': 'ANTICIPO_SUELDO',
  'ANTICIPO DE SUELDO': 'ANTICIPO_SUELDO',
  'ANTICIPO 1RA. QUINCENA': 'ANTICIPO_QUINCENA',
  'COMISARIATO': 'COMISARIATO',
  'DESCUENTO': 'DESCUENTO_VARIOS',
  'HIPOTECARIO': 'PRESTAMO_HIPOTECARIO',
  'QUIROGRAFARIO': 'PRESTAMO_QUIROGRAFARIO',
  'LENTES': 'LENTES',
  'MEC': 'MEC',
  'NEC': 'NEC',
  'PRESTAMO': 'CUOTA_PRESTAMO',
  'SALUDSA': 'SALUDSA',
  'PENSION ALIMENTICIA': 'PENSION_ALIMENTICIA',
  'CUOTA PLAN': 'CUOTA_PLAN',
  'PLAN': 'CUOTA_PLAN',
  'PLAN VEH': 'PLAN_VEHICULAR',
  'UNIFORME': 'UNIFORMES',
  'UNIFORMES': 'UNIFORMES',
  'RETENCION': 'RETENCION_FUENTE',
  'SEGURO': 'SEGURO',
  'PAGO EXCESO': 'PAGO_EXCESO',
  'A FAVOR': 'A_FAVOR',
};

const norm = (s) =>
  String(s ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim();

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? round2(n) : 0;
};

// Cédulas que Excel guardó como número pierden el cero inicial: se repone.
const cedula10 = (v) => {
  const s = String(v ?? '').trim();
  return /^\d{9,10}$/.test(s) ? s.padStart(10, '0') : null;
};

const fecha = (v) => {
  // getFullYear/getMonth locales: toISOString() correría un día en UTC-5
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v.trim())) return v.trim().slice(0, 10);
  return null;
};

// Nombres con typos entre archivos ("Palma Arevalo Mabdel Leidi" ↔ "PALMA
// AREVALO MABEL LEYDY"): misma persona si comparten ≥2 tokens y el 1er apellido.
function mismoNombre(a, b) {
  const ta = norm(a).split(' ');
  const tb = norm(b).split(' ');
  return ta[0] === tb[0] && ta.filter((x) => tb.includes(x)).length >= 2;
}

// ---------------------------------------------------------------------------
// 1. Datos bancarios de servicios profesionales desde los TXT Pichincha
// ---------------------------------------------------------------------------
function leerBancariosServProf() {
  const porNombre = new Map(); // nombre normalizado → datos bancarios
  for (const archivo of TXT_SERV_PROF) {
    const lineas = readFileSync(join(DIR, archivo), 'latin1').split(/\r?\n/).filter((l) => l.trim());
    for (const linea of lineas) {
      const c = linea.split('\t').map((x) => x.trim());
      if (c[0] !== 'PA') continue;
      porNombre.set(norm(c[10]), {
        cedula: c[9],
        cuenta_bancaria: c[6],
        tipo_cuenta: c[5] === 'CTE' ? 'CORRIENTE' : 'AHORRO',
        codigo_banco: String(Number(c[11])), // '0010' → '10'
        neto_txt: round2(Number(c[3]) / 100), // monto en centavos
        descripcion: c[7],
      });
    }
  }
  return porNombre;
}

// Busca en el mapa de TXT bancarios (clave = nombre normalizado) la mejor
// coincidencia para un nombre del Excel.
function matchNombre(nombre, mapa) {
  let mejor = null;
  for (const [clave, valor] of mapa) {
    if (!mismoNombre(nombre, clave)) continue;
    const comunes = norm(nombre).split(' ').filter((x) => clave.split(' ').includes(x)).length;
    if (comunes > (mejor?.comunes ?? 0)) mejor = { valor, comunes };
  }
  return mejor?.valor ?? null;
}

// ---------------------------------------------------------------------------
// 2. Parseo de hojas Excel
// ---------------------------------------------------------------------------
function filasDeHoja(ws) {
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: false });
}

// Hoja de empleados IESS: secciones Ingresos/Egresos delimitadas por las
// columnas "Total Ingresos" y "Total Egresos".
function parsearHojaIess(filas, quincena) {
  const hIdx = filas.findIndex((f) => f.some((c) => norm(c) === 'CEDULA'));
  const header = filas[hIdx].map(norm);
  const col = (nombre) => header.findIndex((h) => h.startsWith(nombre));
  const iTotIng = col('TOTAL INGRESOS');
  const iTotEgr = col('TOTAL EGRESOS');
  const iNeto = col('TOTAL A RECIBIR');
  const registros = [];

  for (const fila of filas.slice(hIdx + 1)) {
    const ced = cedula10(fila[1]);
    if (!ced) continue; // solo filas con cédula (excluye TOTAL y firmas)
    const lineas = [];
    for (let i = 7; i < iTotIng; i++) {
      const monto = num(fila[i]);
      if (!monto) continue;
      // En 1ra quincena el "SUELDO" es el anticipo (40-50% configurado)
      const tipo = header[i] === 'SUELDO'
        ? (quincena === 1 ? 'ANTICIPO_QUINCENA' : 'SUELDO_BASE')
        : (TIPOS[header[i]] ?? header[i].replace(/\W+/g, '_'));
      lineas.push({ tipo_linea: tipo, clase: 'INGRESO', monto, es_provision: false });
    }
    for (let i = iTotIng + 1; i < iTotEgr; i++) {
      const monto = num(fila[i]);
      if (!monto) continue;
      lineas.push({
        tipo_linea: TIPOS[header[i]] ?? header[i].replace(/\W+/g, '_'),
        clase: 'DESCUENTO', monto, es_provision: false,
      });
    }
    registros.push({
      cedula: ced,
      nombre: String(fila[2]).trim(),
      departamento: fila[3] ? norm(fila[3]) : null,
      fecha_iess: fecha(fila[4]),
      cargas_personales: Number(fila[5]) || 0,
      dias: Number(fila[6]) || null,
      sueldo_col: num(fila[col('SUELDO')]),
      neto_esperado: num(fila[iNeto]),
      forma_pago: fila[col('FORMA DE PAGO')] ? norm(fila[col('FORMA DE PAGO')]) : 'TRANSFERENCIA',
      cuenta_bancaria: fila[col('CTA')] ? String(fila[col('CTA')]).trim() : null,
      tipo_cuenta: norm(fila[col('TIPO CTA')]) === 'CORRIENTE' ? 'CORRIENTE' : 'AHORRO',
      banco: fila[col('BCO')] ? norm(fila[col('BCO')]) : null,
      centro_costo: fila[col('CENTRO DE COSTO')] ? String(fila[col('CENTRO DE COSTO')]).trim() : null,
      tipo: 'IESS',
      lineas,
    });
  }
  return registros;
}

// Hoja de servicios profesionales: cabecera en dos filas (la 2da aporta los
// conceptos AREA/MEC/PRESTAMO/PAGO EXCESO de columnas sin título en la 1ra).
function parsearHojaServProf(filas, quincena) {
  const hIdx = filas.findIndex((f) => norm(f[0]) === 'NOMBRE');
  const sub = filas[hIdx + 1] ?? [];
  const header = filas[hIdx].map((c, i) => norm(c) || norm(sub[i]));
  const col = (nombre) => header.findIndex((h) => h.startsWith(nombre));
  const iNombre = 0, iSueldo = col('SUELDO MENSUAL'), iArea = col('AREA');
  const iDias = col('DIAS TRABAJADOS'), iTotIng = col('TOTAL INGRESOS');
  const iQuincena = col('PRIMERA QUINCENA'), iNeto = col('A PAGAR');
  const registros = [];

  for (const fila of filas.slice(hIdx + 2)) {
    const nombre = String(fila[iNombre] ?? '').trim();
    if (!nombre || /TOTAL|COLUMNA|ELABORADO|REVISADO|APROBADO/i.test(nombre)) continue;
    if (/VILLAVICENCIO|MASSON|BOLO/i.test(nombre) && !num(fila[iSueldo])) continue; // firmas
    if (!num(fila[iSueldo])) continue;

    const lineas = [];
    if (quincena === 1) {
      // 1ra quincena: se paga la mitad (columna PRIMERA QUINCENA) menos descuentos
      lineas.push({ tipo_linea: 'ANTICIPO_QUINCENA', clase: 'INGRESO', monto: num(fila[iQuincena]), es_provision: false });
    } else {
      // 2da quincena: honorarios del mes completo menos el anticipo de la 1ra y descuentos
      lineas.push({ tipo_linea: 'HONORARIOS', clase: 'INGRESO', monto: num(fila[iTotIng]), es_provision: false });
      if (num(fila[iQuincena])) {
        lineas.push({ tipo_linea: 'ANTICIPO_QUINCENA', clase: 'DESCUENTO', monto: num(fila[iQuincena]), es_provision: false });
      }
    }
    for (let i = 0; i < header.length; i++) {
      if ([iNombre, iSueldo, iArea, iDias, iTotIng, iQuincena, iNeto].includes(i)) continue;
      const monto = num(fila[i]);
      if (!monto || !header[i]) continue;
      const tipo = TIPOS[header[i]] ?? header[i].replace(/\W+/g, '_');
      const clase = ['HORAS_EXTRAS', 'A_FAVOR'].includes(tipo) ? 'INGRESO' : 'DESCUENTO';
      lineas.push({ tipo_linea: tipo, clase, monto, es_provision: false });
    }
    registros.push({
      cedula: null, // se resuelve contra los TXT bancarios
      nombre,
      departamento: /COMERCIAL/i.test(String(fila[iArea])) ? 'COMERCIAL' : 'ADMINISTRACION',
      fecha_iess: null,
      cargas_personales: 0,
      dias: Number(fila[iDias]) || null,
      sueldo_col: num(fila[iSueldo]),
      sueldo_mensual: num(fila[iSueldo]),
      neto_esperado: num(fila[iNeto]),
      forma_pago: 'TRANSFERENCIA',
      tipo: 'EXTERNO',
      lineas,
    });
  }
  return registros;
}

// ---------------------------------------------------------------------------
// 3. Orquestación: parsear todo, consolidar colaboradores y validar
// ---------------------------------------------------------------------------
function parsearTodo() {
  const bancarios = leerBancariosServProf();
  const colaboradores = new Map(); // clave: cédula o nombre normalizado
  const roles = { 1: [], 2: [] };
  const advertencias = [];

  for (const { archivo, empresa, quincena } of ARCHIVOS) {
    const wb = XLSX.read(readFileSync(join(DIR, archivo)), { cellDates: true });
    for (const nombreHoja of wb.SheetNames) {
      const filas = filasDeHoja(wb.Sheets[nombreHoja]);
      const titulo = norm(filas.slice(0, 3).flat().filter(Boolean).join(' '));
      if (!titulo.includes('JUNIO')) continue; // salta hojas de otros meses (ej. plantilla dic 2025)

      const esIess = filas.some((f) => norm(f[1]) === 'CEDULA');
      const registros = esIess ? parsearHojaIess(filas, quincena) : parsearHojaServProf(filas, quincena);

      for (const r of registros) {
        // Externos: cédula y datos bancarios vienen del TXT del banco
        if (!r.cedula) {
          const banco = matchNombre(r.nombre, bancarios);
          if (banco) {
            r.cedula = banco.cedula;
            r.cuenta_bancaria = banco.cuenta_bancaria;
            r.tipo_cuenta = banco.tipo_cuenta;
            r.codigo_banco = banco.codigo_banco;
          }
        } else {
          r.codigo_banco = CODIGO_BANCO[r.banco] ?? null;
        }

        // Consolidar colaborador: puede aparecer en ambas quincenas e incluso
        // cambiar de lista (ej. IESS en la 1ra quincena y servicios
        // profesionales en la 2da), así que se busca por cédula Y por nombre.
        let clave = (r.cedula && colaboradores.has(r.cedula)) ? r.cedula : null;
        if (!clave) {
          for (const [k, c] of colaboradores) {
            if (mismoNombre(c.nombre, r.nombre)) { clave = k; break; }
          }
        }
        if (!clave) clave = r.cedula ?? norm(r.nombre);
        if (r.cedula && clave !== r.cedula) {
          // ahora conocemos la cédula de alguien registrado antes solo por nombre:
          // re-clavear la entrada y los roles ya emitidos que la referencian
          colaboradores.set(r.cedula, colaboradores.get(clave));
          colaboradores.delete(clave);
          for (const q of [1, 2]) {
            for (const rol of roles[q]) if (rol.clave === clave) rol.clave = r.cedula;
          }
          clave = r.cedula;
        }
        const existente = colaboradores.get(clave) ?? {};
        // Sueldo mensual: en hojas IESS el SUELDO de la 2da quincena es el mensual
        // (prorrateado por días si no trabajó los 30)
        const sueldoMensual = r.sueldo_mensual
          ?? (quincena === 2 && r.dias ? round2((r.sueldo_col / r.dias) * 30) : existente.sueldo_mensual);
        colaboradores.set(clave, {
          ...existente,
          tipo: existente.tipo === 'IESS' ? 'IESS' : r.tipo,
          cedula: r.cedula ?? existente.cedula ?? null,
          nombre: (r.nombre.length >= (existente.nombre?.length ?? 0)) ? r.nombre : existente.nombre,
          departamento: r.departamento ?? existente.departamento,
          empresa,
          centro_costo: r.centro_costo ?? existente.centro_costo ?? null,
          cargas_personales: r.cargas_personales || existente.cargas_personales || 0,
          fecha_ingreso: r.fecha_iess ?? existente.fecha_ingreso ?? null,
          forma_pago: r.forma_pago,
          banco: r.banco ?? existente.banco ?? null,
          codigo_banco: r.codigo_banco ?? existente.codigo_banco ?? null,
          tipo_cuenta: r.tipo_cuenta ?? existente.tipo_cuenta ?? null,
          cuenta_bancaria: r.cuenta_bancaria ?? existente.cuenta_bancaria ?? null,
          sueldo_mensual: sueldoMensual ?? existente.sueldo_mensual ?? null,
        });

        // Validar: las líneas deben reproducir el neto del Excel
        const tot = calcularTotales(r.lineas);
        if (Math.abs(tot.neto - r.neto_esperado) > 0.02) {
          advertencias.push(
            `${archivo} [${nombreHoja}] ${r.nombre}: neto calculado ${tot.neto} ≠ Excel ${r.neto_esperado}`
          );
        }
        roles[quincena].push({ clave, nombre: r.nombre, lineas: r.lineas, neto_esperado: r.neto_esperado, empresa });
      }
    }
  }
  return { colaboradores, roles, advertencias, bancarios };
}

// ---------------------------------------------------------------------------
// 4. Escritura en base de datos (transacción única)
// ---------------------------------------------------------------------------
async function escribir({ colaboradores, roles }) {
  const { default: pool } = await import('../src/db/pool.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: ya } = await client.query(
      `SELECT count(*)::int AS n FROM periodos WHERE nombre LIKE 'Junio 2026%'`
    );
    if (ya[0].n > 0) throw new Error('los períodos de Junio 2026 ya existen — importación abortada');

    const idPorClave = new Map();
    for (const [clave, c] of colaboradores) {
      const { rows } = await client.query(
        `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, fecha_ingreso, empresa,
           centro_costo, cargas_personales, forma_pago, banco, codigo_banco, tipo_cuenta, cuenta_bancaria)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [c.tipo, c.cedula, c.nombre, c.departamento, c.fecha_ingreso, c.empresa, c.centro_costo,
         c.cargas_personales, c.forma_pago, c.banco, c.codigo_banco, c.tipo_cuenta, c.cuenta_bancaria]
      );
      idPorClave.set(clave, rows[0].id);
      if (c.sueldo_mensual) {
        await client.query(
          `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, notas)
           VALUES ($1,$2,$3,'Importado de roles Junio 2026')`,
          [rows[0].id, c.sueldo_mensual, c.fecha_ingreso ?? '2026-06-01']
        );
      }
    }

    for (const quincena of [1, 2]) {
      const p = PERIODOS[quincena];
      const { rows: per } = await client.query(
        `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado, cerrado_en)
         VALUES ($1,$2,$3,$4,'CERRADO',$3::date) RETURNING id`,
        [p.nombre, p.fecha_inicio, p.fecha_fin, quincena]
      );
      for (const rol of roles[quincena]) {
        const tot = calcularTotales(rol.lineas);
        const { rows: rp } = await client.query(
          `INSERT INTO roles_pago (periodo_id, colaborador_id, total_ingresos, total_descuentos,
             neto, estado_pago, pagado_en)
           VALUES ($1,$2,$3,$4,$5,'PAGADO',$6::date) RETURNING id`,
          [per[0].id, idPorClave.get(rol.clave), tot.totalIngresos, tot.totalDescuentos, tot.neto, p.fecha_fin]
        );
        for (const l of rol.lineas) {
          await client.query(
            `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, es_provision)
             VALUES ($1,$2,$3,$4,$5)`,
            [rp[0].id, l.tipo_linea, l.clase, l.monto, l.es_provision]
          );
        }
        // Acumular décimos/fondos pagados en la tabla anual (igual que al cerrar un período)
        if (quincena === 2) {
          const mapa = { DECIMO_TERCERO: 'decimo_tercero', DECIMO_CUARTO: 'decimo_cuarto', FONDOS_RESERVA: 'fondos_reserva' };
          for (const l of rol.lineas) {
            const colProv = mapa[l.tipo_linea];
            if (!colProv) continue;
            await client.query(
              `INSERT INTO provisiones (colaborador_id, anio, ${colProv}) VALUES ($1,2026,$2)
               ON CONFLICT (colaborador_id, anio) DO UPDATE
                 SET ${colProv}=provisiones.${colProv}+$2, actualizado_en=now()`,
              [idPorClave.get(rol.clave), l.monto]
            );
          }
        }
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

// ---------------------------------------------------------------------------
const commit = process.argv.includes('--commit');
const datos = parsearTodo();

console.log(`\nColaboradores consolidados: ${datos.colaboradores.size}`);
for (const [, c] of datos.colaboradores) {
  console.log(
    `  ${(c.cedula ?? 'SIN CÉDULA').padEnd(12)} ${c.nombre.padEnd(42)} ${c.tipo.padEnd(8)}` +
    ` ${(c.empresa ?? '').padEnd(15)} $${String(c.sueldo_mensual ?? '?').padStart(8)}` +
    `  ${c.cuenta_bancaria ? `cta ${c.cuenta_bancaria} (banco ${c.codigo_banco ?? '?'})` : '— sin datos bancarios'}`
  );
}
for (const q of [1, 2]) {
  const neto = round2(datos.roles[q].reduce((s, r) => s + calcularTotales(r.lineas).neto, 0));
  console.log(`\n${PERIODOS[q].nombre}: ${datos.roles[q].length} roles, neto total $${neto}`);
}
if (datos.advertencias.length) {
  console.log(`\n⚠ Advertencias (${datos.advertencias.length}):`);
  datos.advertencias.forEach((a) => console.log(`  - ${a}`));
}

if (!commit) {
  console.log('\nDry-run: no se escribió nada. Ejecuta con --commit para importar.');
} else if (datos.advertencias.length) {
  console.error('\nHay advertencias de validación: corrige o revisa antes de --commit.');
  process.exit(1);
} else {
  await escribir(datos);
  console.log('\n✔ Importación completada.');
}
