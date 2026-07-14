import { describe, it, expect } from 'vitest';
import { calcularIncidencia } from '../src/lib/incidencias-horario.js';
import { round2 } from '../src/lib/round.js';

const horarioAdm = {
  hora_entrada_semana: '08:30', hora_salida_semana: '17:30',
  hora_entrada_sabado: '10:00', hora_salida_sabado: '14:00',
  horas_jornada_semana: 8, horas_jornada_sabado: 4,
};

describe('calcularIncidencia', () => {
  it('dentro de la gracia no genera descuento', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13', // lunes
      horaEntradaReal: '08:34', horaSalidaReal: null, minutosGracia: 5,
    });
    expect(r.minutosTardanza).toBe(0);
    expect(r.montoTotal).toBe(0);
  });

  it('tardanza simple: descuenta solo el exceso sobre la gracia', () => {
    // 600/30/8/60 = 0.4166... por minuto
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13',
      horaEntradaReal: '08:40', horaSalidaReal: null, minutosGracia: 5,
    });
    // 10 min tarde - 5 de gracia = 5 min efectivos
    expect(r.minutosTardanza).toBe(5);
    expect(r.montoTotal).toBeCloseTo(5 * (600 / 30 / 8 / 60), 2);
  });

  it('salida anticipada simple', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13',
      horaEntradaReal: null, horaSalidaReal: '17:15', minutosGracia: 5,
    });
    // 15 min antes - 5 de gracia = 10 min efectivos
    expect(r.minutosSalidaAnticipada).toBe(10);
    expect(r.montoTotal).toBeCloseTo(10 * (600 / 30 / 8 / 60), 2);
  });

  it('ambas el mismo día se suman en un solo monto', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13',
      horaEntradaReal: '08:40', horaSalidaReal: '17:15', minutosGracia: 5,
    });
    expect(r.minutosTardanza).toBe(5);
    expect(r.minutosSalidaAnticipada).toBe(10);
    expect(r.montoTotal).toBe(round2(15 * (600 / 30 / 8 / 60)));
  });

  it('sábado usa la jornada de 4 horas (tarifa distinta)', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-18', // sábado
      horaEntradaReal: '10:15', horaSalidaReal: null, minutosGracia: 5,
    });
    // 15 min tarde - 5 gracia = 10 min efectivos, tarifa con jornada=4
    expect(r.minutosTardanza).toBe(10);
    expect(r.montoTotal).toBeCloseTo(10 * (600 / 30 / 4 / 60), 2);
  });
});
