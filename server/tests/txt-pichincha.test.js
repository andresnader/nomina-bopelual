import { describe, it, expect } from 'vitest';
import { lineaPago, generarTxtPichincha } from '../src/lib/txt-pichincha.js';

// Línea real del archivo cash_management_pich_min_20260615(1).TXT usado con el banco
const LINEA_REAL =
  'PA\t1\tUSD\t19000\tCTA\tAHO\t20005993553\tROL DE PAGOS PRIMERA QUINCENA JUNIO 2026\tC\t0920333317\tAVILES ALARCON JENNIFFER MARIA\t36';

const AVILES = {
  neto: 190.0,
  tipo_cuenta: 'AHORRO',
  cuenta_bancaria: '20005993553',
  cedula: '0920333317',
  nombre: 'AVILES ALARCON JENNIFFER MARIA',
  codigo_banco: '36',
};

describe('txt-pichincha', () => {
  it('reproduce exactamente una línea real enviada al banco', () => {
    expect(lineaPago(1, AVILES, 'ROL DE PAGOS PRIMERA QUINCENA JUNIO 2026')).toBe(LINEA_REAL);
  });

  it('convierte el neto a centavos sin errores de flotante', () => {
    // 230.51 * 100 = 23050.999… en flotante; debe redondear a 23051
    expect(lineaPago(1, { ...AVILES, neto: 230.51 }, 'X').split('\t')[3]).toBe('23051');
  });

  it('mapea cuenta corriente a CTE y normaliza el código de banco', () => {
    const linea = lineaPago(2, { ...AVILES, tipo_cuenta: 'CORRIENTE', codigo_banco: '0010' }, 'X');
    const campos = linea.split('\t');
    expect(campos[1]).toBe('2');
    expect(campos[5]).toBe('CTE');
    expect(campos[11]).toBe('10');
  });

  it('genera archivo CRLF terminado en CRLF', () => {
    const txt = generarTxtPichincha([AVILES, { ...AVILES, neto: 10 }], 'X');
    const lineas = txt.split('\r\n');
    expect(lineas).toHaveLength(3); // 2 pagos + string vacío tras el CRLF final
    expect(lineas[2]).toBe('');
    expect(txt.includes('\n') && !txt.includes('\r\n')).toBe(false);
  });

  it('translitera nombres a ASCII como exige el banco', () => {
    const linea = lineaPago(1, { ...AVILES, nombre: 'Boloña Baux Andrés' }, 'X');
    expect(linea.split('\t')[10]).toBe('BOLONA BAUX ANDRES');
  });

  it('rechaza pagos sin datos bancarios', () => {
    expect(() => lineaPago(1, { ...AVILES, cuenta_bancaria: null }, 'X')).toThrow(/sin cuenta_bancaria/);
  });
});
