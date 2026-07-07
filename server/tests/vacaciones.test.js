import { describe, it, expect } from 'vitest';
import { saldoVacaciones, diasEntre } from '../src/lib/vacaciones.js';

describe('vacaciones', () => {
  it('acumula 15 días por año trabajado, proporcional', () => {
    const r = saldoVacaciones({
      fechaIngreso: '2025-07-07',
      hoy: new Date('2026-07-07'),
    });
    expect(r.derecho).toBeCloseTo(15, 0);
    expect(r.saldo).toBe(r.derecho);
  });

  it('resta los días tomados y admite parámetro de días por año', () => {
    const r = saldoVacaciones({
      fechaIngreso: '2024-07-07',
      diasTomados: 10,
      diasPorAnio: 15,
      hoy: new Date('2026-07-07'),
    });
    expect(r.derecho).toBeCloseTo(30, 0);
    expect(r.saldo).toBeCloseTo(20, 0);
  });

  it('sin fecha de ingreso el derecho es 0', () => {
    expect(saldoVacaciones({ fechaIngreso: null }).derecho).toBe(0);
  });

  it('cuenta días calendario inclusivos', () => {
    expect(diasEntre('2026-08-01', '2026-08-15')).toBe(15);
    expect(diasEntre('2026-08-01', '2026-08-01')).toBe(1);
    expect(diasEntre('2026-08-05', '2026-08-01')).toBe(0);
  });
});
