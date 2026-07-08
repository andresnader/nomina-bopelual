import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'admin@bopelual.com', nombre: 'Admin' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('config_empresas', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('viene sembrado: BOPELUAL retiene, CARROS-YA no', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/empresas'));
    const bop = res.body.find((e) => e.empresa === 'BOPELUAL S.A.');
    const cya = res.body.find((e) => e.empresa === 'CARROS-YA S.A.');
    expect(bop.aplica_retencion).toBe(true);
    expect(cya.aplica_retencion).toBe(false);
  });

  it('ADMIN puede activar la retención de una empresa', async () => {
    const app = createApp();
    const upd = await auth(
      request(app).patch(`/api/empresas/${encodeURIComponent('CARROS-YA S.A.')}`)
    ).send({ aplica_retencion: true });
    expect(upd.body.aplica_retencion).toBe(true);
    await auth(
      request(app).patch(`/api/empresas/${encodeURIComponent('CARROS-YA S.A.')}`)
    ).send({ aplica_retencion: false }); // restaurar
  });
});
