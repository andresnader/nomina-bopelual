import { round2 } from './round.js';

function minutosDesdeMedianoche(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

function esSabado(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  return d.getUTCDay() === 6;
}

export function calcularIncidencia({ horario, sueldoBase, fecha, horaEntradaReal, horaSalidaReal, minutosGracia }) {
  const sabado = esSabado(fecha);
  const horasJornada = Number(sabado ? horario.horas_jornada_sabado : horario.horas_jornada_semana);
  const horaEntradaEsperada = sabado ? horario.hora_entrada_sabado : horario.hora_entrada_semana;
  const horaSalidaEsperada = sabado ? horario.hora_salida_sabado : horario.hora_salida_semana;

  const tarifaMinuto = Number(sueldoBase) / 30 / horasJornada / 60;

  let minutosTardanza = 0;
  if (horaEntradaReal) {
    const diff = minutosDesdeMedianoche(horaEntradaReal) - minutosDesdeMedianoche(horaEntradaEsperada);
    minutosTardanza = Math.max(0, diff - minutosGracia);
  }

  let minutosSalidaAnticipada = 0;
  if (horaSalidaReal) {
    const diff = minutosDesdeMedianoche(horaSalidaEsperada) - minutosDesdeMedianoche(horaSalidaReal);
    minutosSalidaAnticipada = Math.max(0, diff - minutosGracia);
  }

  const montoTotal = round2((minutosTardanza + minutosSalidaAnticipada) * tarifaMinuto);

  return { minutosTardanza, minutosSalidaAnticipada, montoTotal };
}
