import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const identidad = { email: 'rrhh@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
vi.mock('../src/lib/storage.js', () => ({
  subirArchivo: vi.fn(async (key) => key),
  descargarArchivo: vi.fn(async () => Buffer.from('contenido-fake')),
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const { subirArchivo, descargarArchivo } = await import('../src/lib/storage.js');
const auth = (r) => r.set('Authorization', 'Bearer x');

const emisionBody = {
  funciones: 'Supervisar al equipo\nCapacitar al personal',
  remuneracion_letras: 'SEISCIENTOS 00/100',
  horas_semanales: 'cuarenta', horas_diarias: 'Ocho', dias_descanso: 'Dos',
  duracion_texto: 'un año, renovable por una sola vez',
  periodo_prueba_texto: '90 días',
};

async function crearContratoProductivo(app, empresa = 'BOPELUAL S.A.') {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Emision ${Date.now()}`, cedula: `EM${Date.now() % 1e8}`
    })
  ).body;
  await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ empresa });
  const contrato = (
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 600, fecha_inicio: '2026-05-01', tipo_contrato: 'PRODUCTIVO'
    })
  ).body;
  return { col, contrato };
}

describe('emisión de contratos', () => {
  beforeEach(async () => {
    identidad.email = 'rrhh@bopelual.com';
    subirArchivo.mockClear();
    descargarArchivo.mockClear();
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST /emisiones genera el docx, lo sube al bucket y guarda la fila', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)
    ).send(emisionBody);

    expect(res.status).toBe(201);
    expect(res.body.contrato_id).toBe(contrato.id);
    expect(res.body.archivo_generado_key).toMatch(new RegExp(`^contratos/${contrato.id}/generado-`));
    expect(subirArchivo).toHaveBeenCalledTimes(1);

    const detalle = await auth(request(app).get(`/api/colaboradores/${col.id}`));
    const c = detalle.body.contratos.find((x) => x.id === contrato.id);
    expect(c.emisiones).toHaveLength(1);
    expect(c.emisiones[0].id).toBe(res.body.id);
  });

  it('rechaza emitir un contrato que no es PRODUCTIVO', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `EmisionMala ${Date.now()}`, cedula: `EB${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ empresa: 'BOPELUAL S.A.' });
    const contrato = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
        sueldo_base: 600, fecha_inicio: '2026-05-01', tipo_contrato: 'INDEFINIDO'
      })
    ).body;

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)
    ).send(emisionBody);
    expect(res.status).toBe(400);
  });

  it('GET /generado descarga el binario devuelto por el bucket', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);
    const emision = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)).send(emisionBody)
    ).body;

    const res = await auth(
      request(app).get(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones/${emision.id}/generado`)
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(descargarArchivo).toHaveBeenCalledWith(emision.archivo_generado_key);
  });

  it('POST /firmado sube el escaneado y GET /firmado lo descarga con su content-type', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);
    const emision = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)).send(emisionBody)
    ).body;

    const subida = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones/${emision.id}/firmado`)
    ).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-fake'));
    expect(subida.status).toBe(200);
    expect(subida.body.archivo_firmado_key).toMatch(new RegExp(`^contratos/${contrato.id}/firmado-`));

    const descarga = await auth(
      request(app).get(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones/${emision.id}/firmado`)
    );
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-type']).toBe('application/pdf');
  });

  it('solo ADMIN/RRHH pueden emitir; COLABORADOR no', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('colaborador1@bopelual.com','COLABORADOR')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='COLABORADOR'`);
    identidad.email = 'colaborador1@bopelual.com';

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)
    ).send(emisionBody);
    expect(res.status).toBe(403);
  });
});
