import { describe, it, expect } from 'vitest';
import * as calc from '../src/lib/calculo.js';
import { calcularTotales } from '../src/lib/calculo.js';

describe('cálculos IESS', () => {
  it('aporte personal 9.45%', () => expect(calc.iessPersonal(1000)).toBe(94.5));
  it('aporte patronal 12.15%', () => expect(calc.iessPatronal(1000)).toBe(121.5));
});

describe('fondos de reserva', () => {
  it('cero antes del mes 13', () => expect(calc.fondosReserva(1000, 12)).toBe(0));
  it('8.33% a partir del mes 13', () => expect(calc.fondosReserva(1000, 13)).toBe(83.3));
});

describe('décimos', () => {
  it('décimo tercero = sueldo/12', () => expect(calc.decimoTercero(1200)).toBe(100));
  it('décimo cuarto = SBU/12', () => expect(calc.decimoCuarto(460)).toBe(38.33));
});

describe('retención proveedor 10%', () => {
  it('separa retención y neto', () => {
    expect(calc.retencionProveedor(500)).toEqual({ retencion: 50, neto: 450 });
  });
});

describe('cuota de préstamo', () => {
  it('aplica la cuota completa si hay saldo', () => {
    expect(calc.cuotaPrestamo(100, 500)).toEqual({ aplicada: 100, saldoNuevo: 400, activo: true });
  });
  it('no descuenta más que el saldo y desactiva al saldar', () => {
    expect(calc.cuotaPrestamo(100, 60)).toEqual({ aplicada: 60, saldoNuevo: 0, activo: false });
  });

  // Un préstamo cuyo monto no es múltiplo exacto de la cuota dejaba una cola de
  // centavos que lo mantenía activo, y la quincena siguiente le generaba otra
  // línea de descuento por ese resto. Caso real: $800 en cuotas de $133.33
  // dejaba $0.02 vivos. La última cuota absorbe el resto y lo cierra.
  it('la última cuota absorbe el resto de redondeo y cierra el préstamo', () => {
    // Quedan 133.35 de un préstamo de 800 con cuota 133.33 (tras 5 cuotas).
    expect(calc.cuotaPrestamo(133.33, 133.35)).toEqual({ aplicada: 133.35, saldoNuevo: 0, activo: false });
  });

  it('no deja saldos de centavos vivos en un préstamo de 800 con cuota 133.33', () => {
    let saldo = 800;
    const cobros = [];
    // Con 6 cuotas tiene que quedar saldado; si quedara un resto, habría una 7ma.
    for (let i = 0; i < 10 && saldo > 0; i++) {
      const r = calc.cuotaPrestamo(133.33, saldo);
      cobros.push(r.aplicada);
      saldo = r.saldoNuevo;
    }
    expect(cobros).toHaveLength(6);
    expect(saldo).toBe(0);
    expect(cobros.reduce((a, b) => a + b, 0)).toBeCloseTo(800, 2);
  });

  it('sigue cobrando la cuota entera mientras el resto sea significativo', () => {
    expect(calc.cuotaPrestamo(100, 500)).toEqual({ aplicada: 100, saldoNuevo: 400, activo: true });
    expect(calc.cuotaPrestamo(100, 150)).toEqual({ aplicada: 100, saldoNuevo: 50, activo: true });
  });

  it('un préstamo ya saldado no genera cobro', () => {
    expect(calc.cuotaPrestamo(133.33, 0)).toEqual({ aplicada: 0, saldoNuevo: 0, activo: false });
  });
});

describe('anticipo quincena', () => {
  it('40% por defecto', () => expect(calc.anticipoQuincena(1000)).toBe(400));
  it('porcentaje configurable', () => expect(calc.anticipoQuincena(1000, 0.5)).toBe(500));
});

describe('factor de prorrateo por ingreso a mitad de quincena', () => {
  it('quincena completa si ingresó antes del inicio del período', () => {
    expect(calc.factorProrrateoIngreso('2026-06-15', '2026-07-01', '2026-07-15')).toBe(1);
  });
  it('quincena completa si ingresó el mismo día del inicio del período', () => {
    expect(calc.factorProrrateoIngreso('2026-07-01', '2026-07-01', '2026-07-15')).toBe(1);
  });
  it('prorratea si ingresó a mitad del período (6 de 15 días)', () => {
    expect(calc.factorProrrateoIngreso('2026-07-10', '2026-07-01', '2026-07-15')).toBe(0.4);
  });
  it('prorratea al mínimo si ingresó el último día del período (1 de 15 días)', () => {
    expect(calc.factorProrrateoIngreso('2026-07-15', '2026-07-01', '2026-07-15')).toBe(0.07);
  });
  it('factor 0 si ingresó después de que terminó el período', () => {
    expect(calc.factorProrrateoIngreso('2026-07-20', '2026-07-01', '2026-07-15')).toBe(0);
  });
  it('sin fecha de ingreso, no prorratea (quincena completa)', () => {
    expect(calc.factorProrrateoIngreso(null, '2026-07-01', '2026-07-15')).toBe(1);
  });
});

describe('factor de prorrateo por salida a mitad de quincena', () => {
  it('quincena completa si sale después de que termina el período', () => {
    expect(calc.factorProrrateoSalida('2026-07-20', '2026-07-01', '2026-07-15')).toBe(1);
  });
  it('quincena completa si sale el último día del período', () => {
    expect(calc.factorProrrateoSalida('2026-07-15', '2026-07-01', '2026-07-15')).toBe(1);
  });
  it('prorratea si sale a mitad del período (10 de 15 días)', () => {
    expect(calc.factorProrrateoSalida('2026-07-10', '2026-07-01', '2026-07-15')).toBe(0.67);
  });
  it('prorratea al mínimo si sale el primer día del período (1 de 15 días)', () => {
    expect(calc.factorProrrateoSalida('2026-07-01', '2026-07-01', '2026-07-15')).toBe(0.07);
  });
  it('factor 0 si ya había salido antes de que empiece el período', () => {
    expect(calc.factorProrrateoSalida('2026-06-28', '2026-07-01', '2026-07-15')).toBe(0);
  });
  it('sin fecha de salida, no prorratea (quincena completa)', () => {
    expect(calc.factorProrrateoSalida(null, '2026-07-01', '2026-07-15')).toBe(1);
  });
});

describe('factor de prorrateo combinado (ingreso y salida en el mismo período)', () => {
  it('cuenta solo los días entre el ingreso y la salida (3 de 15 días)', () => {
    expect(calc.factorProrrateo('2026-07-10', '2026-07-12', '2026-07-01', '2026-07-15')).toBe(0.2);
  });
  it('ingreso antes y salida a mitad: prorratea por salida', () => {
    expect(calc.factorProrrateo('2026-06-01', '2026-07-08', '2026-07-01', '2026-07-15')).toBe(0.53);
  });
  it('salida posterior e ingreso a mitad: prorratea por ingreso', () => {
    expect(calc.factorProrrateo('2026-07-10', '2026-08-31', '2026-07-01', '2026-07-15')).toBe(0.4);
  });
});

describe('calcularTotales', () => {
  const lineas = [
    { clase: 'INGRESO', monto: 1000, es_provision: false }, // sueldo
    { clase: 'INGRESO', monto: 100, es_provision: true }, // provisión décimo (no cash)
    { clase: 'DESCUENTO', monto: 94.5, es_provision: false }, // IESS
    { clase: 'DESCUENTO', monto: 50, es_provision: false } // préstamo
  ];
  it('excluye provisiones del neto en efectivo', () => {
    expect(calcularTotales(lineas)).toEqual({
      totalIngresos: 1000,
      totalDescuentos: 144.5,
      totalProvisiones: 100,
      neto: 855.5
    });
  });
  it('maneja lista vacía', () => {
    expect(calcularTotales([])).toEqual({
      totalIngresos: 0,
      totalDescuentos: 0,
      totalProvisiones: 0,
      neto: 0
    });
  });
});
