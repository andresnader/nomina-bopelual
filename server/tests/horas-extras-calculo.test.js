import { describe, it, expect } from 'vitest';
import { calcularHorasExtras, esFinDeSemana } from '../src/lib/horas-extras.js';
import { round2 } from '../src/lib/round.js';

describe('esFinDeSemana', () => {
  it('lunes a viernes no es fin de semana', () => {
    expect(esFinDeSemana('2026-07-13')).toBe(false); // lunes
    expect(esFinDeSemana('2026-07-17')).toBe(false); // viernes
  });
  it('sábado y domingo sí son fin de semana', () => {
    expect(esFinDeSemana('2026-07-18')).toBe(true); // sábado
    expect(esFinDeSemana('2026-07-19')).toBe(true); // domingo
  });
});

describe('calcularHorasExtras', () => {
  // sueldo 482, 240 horas/mes -> valor hora normal = 2.008333...
  it('día laborable: SUPLEMENTARIA al 50%', () => {
    const r = calcularHorasExtras({
      sueldoBase: 482, horasLaboralesMes: 240, fecha: '2026-07-13', // lunes
      horaEntrada: '17:30', horaSalida: '19:43',
    });
    expect(r.tipoHora).toBe('SUPLEMENTARIA');
    expect(r.horas).toBeCloseTo(2.22, 2);
    // 133 min * (482/240) * 1.5 / 60
    expect(r.montoTotal).toBe(round2((133 / 60) * (482 / 240) * 1.5));
  });

  it('sábado: EXTRAORDINARIA al 100%', () => {
    const r = calcularHorasExtras({
      sueldoBase: 482, horasLaboralesMes: 240, fecha: '2026-08-08', // sábado
      horaEntrada: '07:00', horaSalida: '11:52',
    });
    expect(r.tipoHora).toBe('EXTRAORDINARIA');
    expect(r.montoTotal).toBe(round2((292 / 60) * (482 / 240) * 2));
  });

  it('domingo: EXTRAORDINARIA al 100%', () => {
    const r = calcularHorasExtras({
      sueldoBase: 482, horasLaboralesMes: 240, fecha: '2026-08-09', // domingo
      horaEntrada: '07:00', horaSalida: '10:26',
    });
    expect(r.tipoHora).toBe('EXTRAORDINARIA');
    expect(r.montoTotal).toBe(round2((206 / 60) * (482 / 240) * 2));
  });
});
