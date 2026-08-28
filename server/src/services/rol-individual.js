import * as calc from '../lib/calculo.js';
import { round2 } from '../lib/round.js';
import { TASAS } from '../lib/tasas.js';

// SUELDO_BASE/ANTICIPO_QUINCENA se recombinan en la fila "SUELDO"; BONO ya se
// agrega aparte arriba. DECIMO_TERCERO/DECIMO_CUARTO/FONDOS_RESERVA se generan
// en la 2da quincena como líneas de ingreso reales (es_provision=false, sí
// forman parte del neto que se transfiere), pero el documento histórico de
// Rol de Pagos Individual que este archivo reconstruye nunca las itemiza —
// son beneficios de ley reportados aparte, no parte del rol mensual en papel.
const LINEAS_NO_EGRESO = [
  'SUELDO_BASE', 'ANTICIPO_QUINCENA', 'BONO',
  'DECIMO_TERCERO', 'DECIMO_CUARTO', 'FONDOS_RESERVA',
];

// Encuentra la quincena 1 hermana de una quincena 2: primero por el período
// MES padre (mes_periodo_id); si el mes no tiene padre (datos anteriores a
// esa migración), busca la quincena 1 más cercana justo antes DONDE ESTE
// COLABORADOR tenga un rol_pago — sin el filtro por colaborador, en una BD
// compartida (como la de test) podría encontrar la quincena 1 de otra
// persona que por coincidencia cae en el rango de fechas.
async function buscarQuincena1(client, periodoQ2, colaboradorId) {
  if (periodoQ2.mes_periodo_id) {
    const { rows } = await client.query(
      `SELECT * FROM periodos WHERE mes_periodo_id=$1 AND quincena='1'`,
      [periodoQ2.mes_periodo_id]
    );
    return rows[0] ?? null;
  }
  const { rows } = await client.query(
    `SELECT p.* FROM periodos p
     JOIN roles_pago rp ON rp.periodo_id = p.id
     WHERE p.quincena='1' AND rp.colaborador_id=$2
       AND p.fecha_fin < $1 AND p.fecha_fin >= ($1::date - interval '20 days')
     ORDER BY p.fecha_fin DESC LIMIT 1`,
    [periodoQ2.fecha_inicio, colaboradorId]
  );
  return rows[0] ?? null;
}

async function lineasDe(client, colaboradorId, periodoId) {
  if (!periodoId) return [];
  const { rows } = await client.query(
    `SELECT l.*, rp.periodo_id
     FROM lineas_rol l JOIN roles_pago rp ON rp.id=l.rol_pago_id
     WHERE rp.colaborador_id=$1 AND rp.periodo_id=$2 AND l.es_provision=false
     ORDER BY l.creado_en`,
    [colaboradorId, periodoId]
  );
  return rows;
}

async function etiquetaPrestamo(client, linea) {
  if (!linea.prestamo_id) return linea.descripcion ?? linea.tipo_linea;
  const { rows } = await client.query('SELECT notas FROM prestamos WHERE id=$1', [linea.prestamo_id]);
  const notas = rows[0]?.notas;
  return notas && notas.trim() !== '' ? notas : (linea.descripcion ?? linea.tipo_linea);
}

export async function armarRolIndividual(client, { colaboradorId, periodoQ2Id }) {
  const { rows: periodoRows } = await client.query('SELECT * FROM periodos WHERE id=$1', [periodoQ2Id]);
  if (periodoRows.length === 0) throw new Error('período no encontrado');
  const periodoQ2 = periodoRows[0];
  if (periodoQ2.quincena !== '2') throw new Error('el período indicado no es una 2da quincena');

  const { rows: colRows } = await client.query('SELECT * FROM colaboradores WHERE id=$1', [colaboradorId]);
  if (colRows.length === 0) throw new Error('colaborador no encontrado');
  const colaborador = colRows[0];
  if (colaborador.tipo !== 'IESS') throw new Error('este documento solo aplica a colaboradores IESS');

  const { rows: contratoRows } = await client.query(
    `SELECT * FROM contratos WHERE colaborador_id=$1 AND fecha_inicio <= $2
     AND (fecha_fin IS NULL OR fecha_fin >= $2) ORDER BY fecha_inicio DESC LIMIT 1`,
    [colaboradorId, periodoQ2.fecha_fin]
  );
  if (contratoRows.length === 0) throw new Error('el colaborador no tiene un contrato vigente en ese período');

  const { rows: empresaRows } = await client.query('SELECT * FROM config_empresas WHERE empresa=$1', [colaborador.empresa]);
  const empresa = empresaRows[0] ?? { empresa: colaborador.empresa, ruc: null, direccion: null, telefonos: null };

  const periodoQ1 = await buscarQuincena1(client, periodoQ2, colaboradorId);
  const [lineasQ1, lineasQ2] = await Promise.all([
    lineasDe(client, colaboradorId, periodoQ1?.id),
    lineasDe(client, colaboradorId, periodoQ2Id),
  ]);
  const todasLasLineas = [...lineasQ1, ...lineasQ2];

  const mesFechaInicio = periodoQ1?.fecha_inicio ?? periodoQ2.fecha_inicio;
  const factor = calc.factorProrrateo(colaborador.fecha_ingreso, colaborador.fecha_salida, mesFechaInicio, periodoQ2.fecha_fin);
  const diasTrabajados = Math.round(factor * 30);

  // Ingresos
  const sumaTipo = (tipo) => round2(todasLasLineas
    .filter((l) => l.clase === 'INGRESO' && l.tipo_linea === tipo)
    .reduce((s, l) => s + Number(l.monto), 0));
  const sueldo = round2(sumaTipo('SUELDO_BASE') + sumaTipo('ANTICIPO_QUINCENA'));
  const bono = sumaTipo('BONO');

  const ingresos = [{ label: 'SUELDO', monto: sueldo }];
  if (bono > 0) ingresos.push({ label: 'BONO', monto: bono });
  for (const l of todasLasLineas) {
    if (l.clase === 'INGRESO' && !LINEAS_NO_EGRESO.includes(l.tipo_linea)) {
      ingresos.push({ label: l.descripcion ?? l.tipo_linea, monto: Number(l.monto) });
    }
  }
  const totalIngresos = round2(ingresos.reduce((s, i) => s + i.monto, 0));

  // Egresos: toda línea DESCUENTO de ambas quincenas, una fila por línea.
  const egresos = [];
  for (const l of todasLasLineas) {
    if (l.clase !== 'DESCUENTO') continue;
    let label;
    if (l.tipo_linea === 'IESS_PERSONAL') {
      const tasa = colaborador.iess_tasa_personal_especial ?? TASAS.IESS_PERSONAL;
      label = `${(Number(tasa) * 100).toFixed(2)}% IESS`;
    } else if (l.tipo_linea === 'CUOTA_PRESTAMO' || l.tipo_linea === 'ANTICIPO_SUELDO') {
      label = await etiquetaPrestamo(client, l);
    } else {
      label = l.descripcion ?? l.tipo_linea;
    }
    egresos.push({ label, monto: Number(l.monto) });
  }
  // El anticipo de Q1 es INGRESO ahí, pero acá se re-lista como egreso: ya
  // se pagó en efectivo, hay que restarlo del total a entregar ahora.
  const anticipoQ1 = lineasQ1.find((l) => l.clase === 'INGRESO' && l.tipo_linea === 'ANTICIPO_QUINCENA');
  if (anticipoQ1) {
    egresos.push({ label: 'Anticipo 1ra. Quincena', monto: Number(anticipoQ1.monto) });
  }
  const totalEgresos = round2(egresos.reduce((s, e) => s + e.monto, 0));

  return {
    empresa: { empresa: empresa.empresa, ruc: empresa.ruc, direccion: empresa.direccion, telefonos: empresa.telefonos },
    colaborador: {
      nombre: colaborador.nombre, cedula: colaborador.cedula, cargo: colaborador.cargo,
      provincia: colaborador.provincia, ciudad: colaborador.ciudad,
    },
    periodo: { desde: periodoQ2.fecha_inicio, hasta: periodoQ2.fecha_fin },
    diasTrabajados,
    ingresos, totalIngresos,
    egresos, totalEgresos,
    totalARecibir: round2(totalIngresos - totalEgresos),
  };
}
