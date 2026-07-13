import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generarContratoProductivoDocx } from '../src/lib/contrato-productivo-docx.js';

const empresa = {
  empresa: 'BOPELUAL S.A.', ruc: '0993316237001',
  representante_legal: 'Miguel Velez Pérez', cedula_representante: '0911764975',
};
const colaborador = {
  nombre: 'RODRIGUEZ SIGUENZA CHRISTIAN MICHAEL', cedula: '0927222620',
  cargo: 'Supervisor Comercial', sexo: 'M',
};
const contrato = { fecha_inicio: '2026-05-01' };
const emision = {
  funciones: 'Supervisar y coordinar al equipo de ventas\nMonitorear el cumplimiento de objetivos y estrategias comerciales',
  remuneracion_letras: 'SEISCIENTOS 00/100',
  horas_semanales: 'cuarenta', horas_diarias: 'Ocho', dias_descanso: 'Dos',
  duracion_texto: 'un año, renovable por una sola vez hasta por un año adicional',
  periodo_prueba_texto: '90 días',
};

async function extraerTexto(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

describe('generarContratoProductivoDocx', () => {
  it('incluye los datos de la empresa, el colaborador, las funciones y la fecha', async () => {
    const buffer = await generarContratoProductivoDocx({ empresa, colaborador, contrato, emision });
    const xml = await extraerTexto(buffer);

    expect(xml).toContain('BOPELUAL S.A.');
    expect(xml).toContain('0993316237001');
    expect(xml).toContain('Miguel Velez Pérez');
    expect(xml).toContain('RODRIGUEZ SIGUENZA CHRISTIAN MICHAEL');
    expect(xml).toContain('0927222620');
    expect(xml).toContain('Supervisor Comercial');
    expect(xml).toContain('Supervisar y coordinar al equipo de ventas');
    expect(xml).toContain('Monitorear el cumplimiento de objetivos y estrategias comerciales');
    expect(xml).toContain('SEISCIENTOS 00/100');
    expect(xml).toContain('cuarenta');
    expect(xml).toContain('90 días');
    expect(xml).toContain('1 de mayo de 2026');
    expect(xml).toContain('el señor');
  });

  it('usa "la señora" cuando sexo=F', async () => {
    const buffer = await generarContratoProductivoDocx({
      empresa, colaborador: { ...colaborador, sexo: 'F' }, contrato, emision
    });
    const xml = await extraerTexto(buffer);
    expect(xml).toContain('la señora');
  });
});
