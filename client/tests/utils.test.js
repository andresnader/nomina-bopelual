import { describe, it, expect, afterEach, vi } from 'vitest';
import { fecha, totalesPorEmpresa } from '../src/utils.js';

describe('fecha', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('devuelve — para valores vacíos', () => {
    expect(fecha(null)).toBe('—');
    expect(fecha(undefined)).toBe('—');
    expect(fecha('')).toBe('—');
  });

  it('muestra el mismo día calendario del string en un huso detrás de UTC (regresión)', () => {
    // new Date('2026-07-01').toLocaleDateString() interpreta el string como
    // medianoche UTC; en America/Guayaquil (UTC-5) eso corre la fecha un día
    // para atrás (30/6 en vez de 1/7) — exactamente el bug reportado en producción.
    vi.stubEnv('TZ', 'America/Guayaquil');
    expect(fecha('2026-07-01')).toBe('1/7/2026');
    expect(fecha('2026-07-16')).toBe('16/7/2026');
    expect(fecha('2026-06-30')).toBe('30/6/2026');
  });

  it('acepta timestamps ISO completos y usa solo la parte de fecha', () => {
    vi.stubEnv('TZ', 'America/Guayaquil');
    expect(fecha('2026-07-01T00:00:00.000Z')).toBe(fecha('2026-07-01'));
  });
});

describe('totalesPorEmpresa', () => {
  const rol = (colaborador_empresa, neto) => ({ colaborador_empresa, neto });

  it('agrupa por empresa sumando el neto y contando colaboradores', () => {
    expect(totalesPorEmpresa([
      rol('BOPELUAL S.A.', '450.00'),
      rol('CARROS-YA S.A.', '100.00'),
      rol('BOPELUAL S.A.', '50.50'),
    ])).toEqual([
      { empresa: 'BOPELUAL S.A.', cantidad: 2, neto: 500.5 },
      { empresa: 'CARROS-YA S.A.', cantidad: 1, neto: 100 },
    ]);
  });

  it('ordena alfabéticamente sin importar el orden de entrada', () => {
    const r = totalesPorEmpresa([rol('CARROS-YA S.A.', '1'), rol('BOPELUAL S.A.', '1')]);
    expect(r.map((x) => x.empresa)).toEqual(['BOPELUAL S.A.', 'CARROS-YA S.A.']);
  });

  it('redondea a 2 decimales en vez de arrastrar el error de coma flotante', () => {
    // 0.1 + 0.2 === 0.30000000000000004 en binario. Sumar netos de dos
    // decimales sin redondear al final ensucia el total mostrado.
    const [{ neto }] = totalesPorEmpresa([
      rol('BOPELUAL S.A.', '0.10'), rol('BOPELUAL S.A.', '0.20'),
    ]);
    expect(neto).toBe(0.3);
  });

  it('agrupa bajo "Sin empresa" a quien no la tenga, en vez de perderlo', () => {
    expect(totalesPorEmpresa([rol(null, '10.00'), rol('', '5.00')])).toEqual([
      { empresa: 'Sin empresa', cantidad: 2, neto: 15 },
    ]);
  });

  it('devuelve lista vacía sin filas', () => {
    expect(totalesPorEmpresa([])).toEqual([]);
  });
});
