import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('colaboradores', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('crea y lista un colaborador', async () => {
    const app = createApp();
    const crear = await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS',
      nombre: 'Prueba QA',
      cedula: `C${Date.now()}`
    });
    expect(crear.status).toBe(201);
    const lista = await auth(request(app).get('/api/colaboradores'));
    expect(lista.status).toBe(200);
    expect(lista.body.data.some((c) => c.id === crear.body.id)).toBe(true);
    expect(lista.body.total).toBeGreaterThanOrEqual(1);
  });

  it('un nuevo contrato cierra el anterior', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS',
        nombre: 'Contratos',
        cedula: `K${Date.now()}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000,
      fecha_inicio: '2026-01-01'
    });
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1200,
      fecha_inicio: '2026-06-01'
    });
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS activos FROM contratos WHERE colaborador_id=$1 AND fecha_fin IS NULL',
      [col.id]
    );
    expect(rows[0].activos).toBe(1);
  });

  it('COLABORADOR no puede listar colaboradores', async () => {
    // Cambia el rol del usuario mock a COLABORADOR para este caso.
    await pool.query(`UPDATE usuarios SET rol='COLABORADOR' WHERE email='rrhh@bopelual.com'`);
    const res = await auth(request(createApp()).get('/api/colaboradores'));
    expect(res.status).toBe(403);
    await pool.query(`UPDATE usuarios SET rol='RRHH' WHERE email='rrhh@bopelual.com'`);
  });
});
