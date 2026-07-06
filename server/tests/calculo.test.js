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
});

describe('anticipo quincena', () => {
  it('50% del sueldo base', () => expect(calc.anticipoQuincena(1000)).toBe(500));
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
