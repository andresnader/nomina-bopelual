import { describe, it, expect } from 'vitest';
import { grupoDeColaborador, ETIQUETA_GRUPO } from '../src/lib/grupos.js';

describe('grupoDeColaborador', () => {
  it('EXTERNO siempre es SERV_PROF', () => {
    expect(grupoDeColaborador('EXTERNO', 'COMERCIAL')).toBe('SERV_PROF');
    expect(grupoDeColaborador('EXTERNO', 'ADMINISTRATIVO')).toBe('SERV_PROF');
  });
  it('IESS COMERCIAL es COMERCIAL', () => {
    expect(grupoDeColaborador('IESS', 'COMERCIAL')).toBe('COMERCIAL');
  });
  it('IESS ADMINISTRATIVO (o nulo) es ADM', () => {
    expect(grupoDeColaborador('IESS', 'ADMINISTRATIVO')).toBe('ADM');
    expect(grupoDeColaborador('IESS', null)).toBe('ADM');
  });
  it('cada grupo tiene etiqueta', () => {
    expect(ETIQUETA_GRUPO.COMERCIAL).toBe('Comercial');
    expect(ETIQUETA_GRUPO.SERV_PROF).toBe('Serv. Profesionales');
  });
});
