import { TASAS } from './tasas.js';
import { round2 } from './round.js';

function minutosDesdeMedianoche(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

// domingo=0 ... sábado=6
export function esFinDeSemana(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  const dia = d.getUTCDay();
  return dia === 0 || dia === 6;
}

// Sigue el criterio del Código de Trabajo (y el archivo de referencia del
// Ministerio de Trabajo): SUPLEMENTARIA (50%) en día laborable, EXTRAORDINARIA
// (100%) sábado/domingo. El valor de la hora normal sale de un parámetro
// global (sueldo/horasLaboralesMes), no del horario del colaborador.
export function calcularHorasExtras({ sueldoBase, horasLaboralesMes, fecha, horaEntrada, horaSalida }) {
  const minutos = minutosDesdeMedianoche(horaSalida) - minutosDesdeMedianoche(horaEntrada);
  const tipoHora = esFinDeSemana(fecha) ? 'EXTRAORDINARIA' : 'SUPLEMENTARIA';
  const recargo = tipoHora === 'EXTRAORDINARIA' ? TASAS.RECARGO_EXTRAORDINARIA : TASAS.RECARGO_SUPLEMENTARIA;
  const valorHoraNormal = Number(sueldoBase) / Number(horasLaboralesMes);
  const montoTotal = round2((minutos / 60) * valorHoraNormal * (1 + recargo));
  return { tipoHora, horas: round2(minutos / 60), montoTotal };
}
