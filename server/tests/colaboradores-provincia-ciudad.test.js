import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('colaboradores: provincia/ciudad', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('permite editar provincia y ciudad', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `ProvCiudad ${Date.now()}`, cedula: `PC${Date.now() % 1e8}`
    })).body;
    expect(col.provincia).toBeNull();
    expect(col.ciudad).toBeNull();

    const editado = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({
      provincia: 'GUAYAS', ciudad: 'GUAYAQUIL'
    });
    expect(editado.status).toBe(200);
    expect(editado.body.provincia).toBe('GUAYAS');
    expect(editado.body.ciudad).toBe('GUAYAQUIL');
  });
});
