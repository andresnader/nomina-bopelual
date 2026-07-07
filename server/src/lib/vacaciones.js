import { round2 } from './round.js';

const MS_POR_DIA = 86400000;

// Días calendario inclusivos entre dos fechas (Ecuador cuenta los 15 días de
// vacaciones en días calendario, no laborables).
export function diasEntre(desde, hasta) {
  const d = Math.round((new Date(hasta) - new Date(desde)) / MS_POR_DIA) + 1;
  return d > 0 ? d : 0;
}

// Derecho acumulado proporcional: diasPorAnio (15 por ley) por cada año
// trabajado desde la fecha de ingreso, menos los días ya aprobados.
export function saldoVacaciones({ fechaIngreso, diasTomados = 0, diasPorAnio = 15, hoy = new Date() }) {
  if (!fechaIngreso) return { derecho: 0, tomados: round2(diasTomados), saldo: round2(-diasTomados) };
  const anios = (new Date(hoy) - new Date(fechaIngreso)) / (MS_POR_DIA * 365.25);
  const derecho = round2(Math.max(anios, 0) * diasPorAnio);
  return { derecho, tomados: round2(diasTomados), saldo: round2(derecho - diasTomados) };
}
