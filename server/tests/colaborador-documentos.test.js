import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
vi.mock('../src/lib/storage.js', () => ({
  subirArchivo: vi.fn(async (key) => key),
  descargarArchivo: vi.fn(async () => Buffer.from('contenido-fake')),
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaborador(app, empresa = 'BOPELUAL S.A.') {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `DocEmitido ${Date.now()}`, cedula: `DE${Date.now() % 1e8}`
    })
  ).body;
  await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ empresa });
  return col;
}

describe('documentos emitidos del colaborador (confidencialidad, consentimientos)', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST /documentos-emitidos/confidencialidad genera, sube, lista y descarga', async () => {
    const app = createApp();
    const col = await crearColaborador(app);

    const emitido = await auth(
      request(app).post(`/api/colaboradores/${col.id}/documentos-emitidos/confidencialidad`)
    ).send({ cargo: 'Supervisor Comercial' });
    expect(emitido.status).toBe(201);
    expect(emitido.body.archivo_generado_key).toMatch(/^confidencialidad\//);

    const lista = await auth(request(app).get(`/api/colaboradores/${col.id}/documentos-emitidos/confidencialidad`));
    expect(lista.body).toHaveLength(1);

    const descarga = await auth(
      request(app).get(`/api/colaboradores/${col.id}/documentos-emitidos/confidencialidad/${emitido.body.id}/generado`)
    );
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-disposition']).toContain('attachment');
  });

  it('no colisiona con el endpoint existente de documentos (bytea)', async () => {
    const app = createApp();
    const col = await crearColaborador(app);

    // Documento real subido por el flujo viejo (documentos.js, bytea).
    const subido = await auth(request(app).post(`/api/colaboradores/${col.id}/documentos?nombre=cedula.pdf&tipo=CEDULA`))
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-fake'));
    expect(subido.status).toBe(201);

    const descarga = await auth(request(app).get(`/api/colaboradores/${col.id}/documentos/${subido.body.id}`));
    expect(descarga.status).toBe(200);
  });

  it('POST /firmado y GET /firmado del documento emitido', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const emitido = await auth(
      request(app).post(`/api/colaboradores/${col.id}/documentos-emitidos/consentimiento_biometrico`)
    ).send({});

    const subida = await auth(
      request(app).post(`/api/colaboradores/${col.id}/documentos-emitidos/consentimiento_biometrico/${emitido.body.id}/firmado`)
    ).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-fake'));
    expect(subida.status).toBe(200);
    expect(subida.body.archivo_firmado_key).toBeTruthy();

    const descarga = await auth(
      request(app).get(`/api/colaboradores/${col.id}/documentos-emitidos/consentimiento_biometrico/${emitido.body.id}/firmado`)
    );
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-type']).toBe('application/pdf');
  });
});
