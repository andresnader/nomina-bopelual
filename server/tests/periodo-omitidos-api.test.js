import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// El wizard necesita saber a quién dejó fuera al crear el período, y la ficha
// del período necesita poder consultarlo después: agosto ya estaba creado
// cuando aparecieron los colaboradores rotos, así que el aviso de creación no
// alcanza — hace falta poder preguntarlo sobre un período existente.
describe('API de colaboradores omitidos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST /periodos devuelve los omitidos junto con los creados', async () => {
    const app = createApp();
    const sello = Date.now();
    const roto = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Roto Post ${sello}`, cedula: `RP${sello % 1e8}`,
        fecha_ingreso: '2020-01-01'
      })
    ).body;

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `Q1 omitidos ${sello}`, fecha_inicio: '2021-03-01', fecha_fin: '2021-03-15', quincena: 1
    });

    expect(per.status).toBe(201);
    const mio = per.body.omitidos.find((o) => o.id === roto.id);
    expect(mio.motivo).toBe('SIN_CONTRATO');
  });

  it('GET /periodos/:id/omitidos lista a quien falta en un período ya creado', async () => {
    const app = createApp();
    const sello = Date.now();
    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q1 consulta ${sello}`, fecha_inicio: '2021-04-01', fecha_fin: '2021-04-15', quincena: 1
      })
    ).body;

    // Se carga DESPUÉS de crear el período y sin contrato: es exactamente el
    // caso de agosto, donde el período ya existía cuando apareció el problema.
    const roto = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Roto Get ${sello}`, cedula: `RG${sello % 1e8}`,
        fecha_ingreso: '2020-01-01'
      })
    ).body;

    const res = await auth(request(app).get(`/api/periodos/${per.periodo.id}/omitidos`));
    expect(res.status).toBe(200);
    expect(res.body.find((o) => o.id === roto.id).motivo).toBe('SIN_CONTRATO');
  });

  it('no lista al colaborador que sí tiene rol en ese período', async () => {
    const app = createApp();
    const sello = Date.now();
    const sano = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Sano Get ${sello}`, cedula: `SG${sello % 1e8}`,
        fecha_ingreso: '2020-01-01', sueldo_base: 1000
      })
    ).body;

    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: `Q1 sano ${sello}`, fecha_inicio: '2021-05-01', fecha_fin: '2021-05-15', quincena: 1
      })
    ).body;

    const res = await auth(request(app).get(`/api/periodos/${per.periodo.id}/omitidos`));
    expect(res.body.some((o) => o.id === sano.id)).toBe(false);
  });

  it('responde 404 si el período no existe', async () => {
    const app = createApp();
    const res = await auth(
      request(app).get('/api/periodos/00000000-0000-0000-0000-000000000000/omitidos')
    );
    expect(res.status).toBe(404);
  });
});
