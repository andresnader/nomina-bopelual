import { describe, it, expect } from 'vitest';
import { siguienteEstado, puedeEditarLineas } from '../src/lib/periodo-fsm.js';
import { estadoDerivadoMes } from '../src/services/periodos.js';

describe('siguienteEstado', () => {
  it('BORRADOR se aprueba', () => expect(siguienteEstado('BORRADOR', 'aprobar')).toBe('APROBADO'));
  it('APROBADO se cierra', () => expect(siguienteEstado('APROBADO', 'cerrar')).toBe('CERRADO'));
  it('no se puede cerrar un BORRADOR', () =>
    expect(() => siguienteEstado('BORRADOR', 'cerrar')).toThrow());
  it('no se puede aprobar dos veces', () =>
    expect(() => siguienteEstado('APROBADO', 'aprobar')).toThrow());
  it('CERRADO es irreversible', () => {
    expect(() => siguienteEstado('CERRADO', 'aprobar')).toThrow();
    expect(() => siguienteEstado('CERRADO', 'cerrar')).toThrow();
  });
});

describe('puedeEditarLineas', () => {
  it('solo en BORRADOR', () => {
    expect(puedeEditarLineas('BORRADOR')).toBe(true);
    expect(puedeEditarLineas('APROBADO')).toBe(false);
    expect(puedeEditarLineas('CERRADO')).toBe(false);
  });
});

describe('estadoDerivadoMes', () => {
  it('todas CERRADO -> CERRADO', () => {
    expect(estadoDerivadoMes([{ estado: 'CERRADO' }, { estado: 'CERRADO' }])).toBe('CERRADO');
  });
  it('todas APROBADO (ninguna BORRADOR) -> APROBADO', () => {
    expect(estadoDerivadoMes([{ estado: 'APROBADO' }, { estado: 'APROBADO' }])).toBe('APROBADO');
  });
  it('alguna BORRADOR -> BORRADOR', () => {
    expect(estadoDerivadoMes([{ estado: 'APROBADO' }, { estado: 'BORRADOR' }])).toBe('BORRADOR');
  });
  it('mixto CERRADO+APROBADO (sin BORRADOR) -> APROBADO', () => {
    expect(estadoDerivadoMes([{ estado: 'CERRADO' }, { estado: 'APROBADO' }])).toBe('APROBADO');
  });
  it('acepta también un array de strings (no solo objetos con .estado)', () => {
    expect(estadoDerivadoMes(['CERRADO', 'CERRADO'])).toBe('CERRADO');
    expect(estadoDerivadoMes(['BORRADOR', 'APROBADO'])).toBe('BORRADOR');
  });
  it('sin hijas, por defecto BORRADOR (no debería pasar en la práctica)', () => {
    expect(estadoDerivadoMes([])).toBe('BORRADOR');
  });
});
