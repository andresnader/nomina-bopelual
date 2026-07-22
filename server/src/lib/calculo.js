import { TASAS } from './tasas.js';
import { round2 } from './round.js';
import { diasEntre } from './vacaciones.js';

const DIAS_QUINCENA = 15;

// --- Aportes IESS ---
export const iessPersonal = (sueldoBase) => round2(sueldoBase * TASAS.IESS_PERSONAL);
export const iessPatronal = (sueldoBase) => round2(sueldoBase * TASAS.IESS_PATRONAL);

// Fondos de reserva: solo a partir del mes 13 de afiliación.
export const fondosReserva = (sueldoBase, mesesAfiliado) =>
  mesesAfiliado > 12 ? round2(sueldoBase * TASAS.FONDOS_RESERVA) : 0;

// --- Provisiones de beneficios de ley (mensuales) ---
export const decimoTercero = (sueldoBase) => round2(sueldoBase / 12);
export const decimoCuarto = (sbu) => round2(sbu / 12);

// --- Retención en la fuente (proveedor externo con factura) ---
export function retencionProveedor(montoBruto) {
  const retencion = round2(montoBruto * TASAS.RETENCION_FUENTE);
  return { retencion, neto: round2(montoBruto - retencion) };
}

// --- Amortización de préstamo interno ---
// La cuota nunca descuenta más que el saldo pendiente; al llegar a 0 se desactiva.
export function cuotaPrestamo(cuota, saldoPendiente) {
  const aplicada = Math.min(cuota, saldoPendiente);
  const saldoNuevo = round2(saldoPendiente - aplicada);
  return { aplicada: round2(aplicada), saldoNuevo, activo: saldoNuevo > 0 };
}

// --- Anticipo de primera quincena (porcentaje configurable vía parámetros) ---
export const anticipoQuincena = (sueldoBase, porcentaje = 0.4) => round2(sueldoBase * porcentaje);

// --- Prorrateo por días efectivamente trabajados en la quincena (solo IESS) ---
// Convención ecuatoriana: quincena completa = 15 días, sin importar el
// largo real del mes. El rango trabajado va de max(fecha_ingreso, inicio del
// período) a min(fecha_salida, fin del período); si el rango es vacío (aún no
// ingresa, o ya salió antes de este período), el factor es 0.
export function factorProrrateo(fechaIngreso, fechaSalida, periodoFechaInicio, periodoFechaFin) {
  const inicioEfectivo = fechaIngreso && new Date(fechaIngreso) > new Date(periodoFechaInicio)
    ? fechaIngreso : periodoFechaInicio;
  const finEfectivo = fechaSalida && new Date(fechaSalida) < new Date(periodoFechaFin)
    ? fechaSalida : periodoFechaFin;
  if (new Date(inicioEfectivo) > new Date(finEfectivo)) return 0;
  const diasTrabajados = Math.min(diasEntre(inicioEfectivo, finEfectivo), DIAS_QUINCENA);
  return round2(diasTrabajados / DIAS_QUINCENA);
}

// Solo ingreso (sin fecha de salida): se mantiene como atajo para los
// llamadores y tests que ya existían antes de fecha_salida.
export function factorProrrateoIngreso(fechaIngreso, periodoFechaInicio, periodoFechaFin) {
  return factorProrrateo(fechaIngreso, null, periodoFechaInicio, periodoFechaFin);
}

// Solo salida (p. ej. liquidación hasta el día trabajado).
export function factorProrrateoSalida(fechaSalida, periodoFechaInicio, periodoFechaFin) {
  return factorProrrateo(null, fechaSalida, periodoFechaInicio, periodoFechaFin);
}

// --- Totales del rol de pago ---
// El neto en efectivo EXCLUYE las provisiones (son ingresos contables, no cash).
export function calcularTotales(lineas) {
  let totalIngresos = 0;
  let totalDescuentos = 0;
  let totalProvisiones = 0;
  for (const l of lineas) {
    const monto = Number(l.monto);
    if (l.es_provision) totalProvisiones += monto;
    else if (l.clase === 'INGRESO') totalIngresos += monto;
    else if (l.clase === 'DESCUENTO') totalDescuentos += monto;
  }
  return {
    totalIngresos: round2(totalIngresos),
    totalDescuentos: round2(totalDescuentos),
    totalProvisiones: round2(totalProvisiones),
    neto: round2(totalIngresos - totalDescuentos)
  };
}
