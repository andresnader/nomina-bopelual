import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const identidad = { email: 'admin@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('catálogo de horarios', () => {
  beforeEach(async () => {
    identidad.email = 'admin@bopelual.com';
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('viene sembrado con ADM y COMERCIAL', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/horarios'));
    expect(res.status).toBe(200);
    const codigos = res.body.map((h) => h.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['ADM', 'COMERCIAL']));
  });

  it('ADMIN puede editar horas de un horario', async () => {
    const app = createApp();
    const upd = await auth(request(app).patch('/api/horarios/ADM')).send({
      hora_entrada_semana: '08:00'
    });
    expect(upd.status).toBe(200);
    expect(upd.body.hora_entrada_semana).toMatch(/^08:00/);
    await auth(request(app).patch('/api/horarios/ADM')).send({ hora_entrada_semana: '08:30' }); // restaurar
  });

  it('RRHH no puede editar el catálogo (solo ADMIN)', async () => {
    const app = createApp();
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh2@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
    identidad.email = 'rrhh2@bopelual.com';
    const res = await auth(request(app).patch('/api/horarios/ADM')).send({ hora_entrada_semana: '09:00' });
    expect(res.status).toBe(403);
  });

  it('PATCH /colaboradores/:id acepta horario, y GET /:id lo embebe con periodo_estado en roles_pago', async () => {
    identidad.email = 'admin@bopelual.com';
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Horario ${Date.now()}`, cedula: `HO${Date.now() % 1e8}`
      })
    ).body;
    const upd = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ horario: 'COMERCIAL' });
    expect(upd.body.horario).toBe('COMERCIAL');

    const det = await auth(request(app).get(`/api/colaboradores/${col.id}`));
    expect(det.body.horario).toBe('COMERCIAL');
    expect(Array.isArray(det.body.roles_pago)).toBe(true);
  });
});
