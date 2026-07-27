import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('API empleo-periodos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email,rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('lista, agrega y borra vínculos', async () => {
    const app = createApp();
    const s = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `EP ${s}`, cedula: `E${s % 1e8}`, fecha_ingreso: '2024-11-01'
    })).body;

    let lista = await auth(request(app).get(`/api/colaboradores/${col.id}/empleo-periodos`));
    expect(lista.body).toHaveLength(1);

    // cerrar el vínculo actual y agregar un re-ingreso
    await auth(request(app).patch(`/api/colaboradores/${col.id}/empleo-periodos/${lista.body[0].id}`))
      .send({ fecha_entrada: '2024-11-01', fecha_salida: '2025-10-31' });
    const add = await auth(request(app).post(`/api/colaboradores/${col.id}/empleo-periodos`))
      .send({ fecha_entrada: '2025-11-01', fecha_salida: null });
    expect(add.status).toBe(201);

    lista = await auth(request(app).get(`/api/colaboradores/${col.id}/empleo-periodos`));
    expect(lista.body).toHaveLength(2);

    const del = await auth(request(app).delete(`/api/colaboradores/${col.id}/empleo-periodos/${add.body.id}`));
    expect(del.status).toBe(200);
    lista = await auth(request(app).get(`/api/colaboradores/${col.id}/empleo-periodos`));
    expect(lista.body).toHaveLength(1);
  });

  it('rechaza salida anterior a entrada (400)', async () => {
    const app = createApp();
    const s = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `EP2 ${s}`, cedula: `F${s % 1e8}`
    })).body;
    const bad = await auth(request(app).post(`/api/colaboradores/${col.id}/empleo-periodos`))
      .send({ fecha_entrada: '2027-05-01', fecha_salida: '2027-04-01' });
    expect(bad.status).toBe(400);
  });
});
