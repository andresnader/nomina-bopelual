import { describe, it, expect, afterEach, vi } from 'vitest';
import { fecha } from '../src/utils.js';

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
