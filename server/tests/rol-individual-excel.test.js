import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { generarRolIndividualExcel } from '../src/lib/rol-individual-excel.js';

const DATOS = {
  empresa: { empresa: 'BOPELUAL S.A.', ruc: '0992323456001', direccion: 'TARQUI / AVDA. JUAN TANCA MARENGO S/N Y AVDA. AGUSTIN FREIRE', telefonos: '0985955720 - 0959782846 - 0991014153' },
  colaborador: { nombre: 'BOLOÑA BAUX ALEJANDRO XAVIER', cedula: '0920303997', cargo: 'DIRECTOR FINANCIERO', provincia: 'GUAYAS', ciudad: 'GUAYAQUIL' },
  periodo: { desde: '2026-07-16', hasta: '2026-07-31' },
  diasTrabajados: 30,
  ingresos: [{ label: 'SUELDO', monto: 2300 }],
  totalIngresos: 2300,
  egresos: [
    { label: 'MEC', monto: 12 },
    { label: 'HIPOTECARIO', monto: 704.18 },
    { label: '17.60% IESS', monto: 404.8 },
    { label: 'Anticipo 1ra. Quincena', monto: 797.91 },
  ],
  totalEgresos: 1918.89,
  totalARecibir: 381.11,
};

describe('generarRolIndividualExcel', () => {
  it('genera un buffer .xlsx válido con los datos del colaborador', () => {
    const buffer = generarRolIndividualExcel(DATOS);
    expect(Buffer.isBuffer(buffer)).toBe(true);

    const wb = XLSX.read(buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1 });
    const plano = filas.flat().filter((v) => v !== undefined && v !== null && v !== '').map(String);

    expect(plano.some((v) => v.includes('BOPELUAL S.A.'))).toBe(true);
    expect(plano.some((v) => v.includes('BOLOÑA BAUX ALEJANDRO XAVIER'))).toBe(true);
    expect(plano.some((v) => v.includes('0920303997'))).toBe(true);
    expect(plano.some((v) => v.includes('DIRECTOR FINANCIERO'))).toBe(true);
    expect(plano.some((v) => v.includes('SUELDO'))).toBe(true);
    expect(plano.some((v) => v.includes('HIPOTECARIO'))).toBe(true);
    expect(plano.some((v) => v.includes('17.60% IESS'))).toBe(true);
    expect(plano.some((v) => v.includes('Anticipo 1ra. Quincena'))).toBe(true);
    expect(plano.some((v) => v === '2300')).toBe(true);
    expect(plano.some((v) => v === '381.11')).toBe(true);
  });

  it('no revienta si egresos está vacío', () => {
    const buffer = generarRolIndividualExcel({ ...DATOS, egresos: [], totalEgresos: 0, totalARecibir: DATOS.totalIngresos });
    expect(Buffer.isBuffer(buffer)).toBe(true);
  });
});
