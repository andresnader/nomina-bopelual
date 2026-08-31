import { round2 } from '../lib/round.js';
import { TASAS } from '../lib/tasas.js';
import { diasEntre } from '../lib/vacaciones.js';
import { buscarQuincena1 } from './periodos.js';

const LINEAS_NO_EGRESO = ['SUELDO_BASE', 'ANTICIPO_QUINCENA', 'BONO'];

// factorProrrateo (calculo.js) tapa el conteo en 15 días — pensado para UNA
// quincena. Acá necesitamos el rango del mes completo (hasta 30 días), así
// que se calcula directo en vez de reusar esa función fuera de su dominio.
function diasTrabajadosEnMes(fechaIngreso, fechaSalida, mesFechaInicio, mesFechaFin) {
  const inicioEfectivo = fechaIngreso && new Date(fechaIngreso) > new Date(mesFechaInicio)
    ? fechaIngreso : mesFechaInicio;
  const finEfectivo = fechaSalida && new Date(fechaSalida) < new Date(mesFechaFin)
    ? fechaSalida : mesFechaFin;
  if (new Date(inicioEfectivo) > new Date(finEfectivo)) return 0;
  return Math.min(diasEntre(inicioEfectivo, finEfectivo), 30);
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
  const diasTrabajados = diasTrabajadosEnMes(colaborador.fecha_ingreso, colaborador.fecha_salida, mesFechaInicio, periodoQ2.fecha_fin);

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
  // Q1 ya se pagó por transferencia aparte (su "neto"): hay que restar eso
  // del total a entregar ahora, NO el anticipo bruto — sus propios
  // descuentos (IESS, cuotas de préstamo aplicadas en Q1, etc.) ya están
  // listados arriba como egresos individuales, así que restar el bruto
  // los contaría dos veces.
  const anticipoQ1 = lineasQ1.find((l) => l.clase === 'INGRESO' && l.tipo_linea === 'ANTICIPO_QUINCENA');
  if (anticipoQ1) {
    const ingresosQ1 = round2(lineasQ1
      .filter((l) => l.clase === 'INGRESO')
      .reduce((s, l) => s + Number(l.monto), 0));
    const descuentosQ1 = round2(lineasQ1
      .filter((l) => l.clase === 'DESCUENTO')
      .reduce((s, l) => s + Number(l.monto), 0));
    egresos.push({ label: 'Anticipo 1ra. Quincena', monto: round2(ingresosQ1 - descuentosQ1) });
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
