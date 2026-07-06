import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('préstamos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('la cuota amortiza el saldo al generar el período', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS',
        nombre: 'Prestamista',
        cedula: `P${Date.now()}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000,
      fecha_inicio: '2026-01-01'
    });
    const pr = (
      await auth(request(app).post('/api/prestamos')).send({
        colaborador_id: col.id,
        monto_total: 300,
        cuota_quincena: 100,
        fecha_inicio: '2026-07-01'
      })
    ).body;
    expect(Number(pr.saldo_pendiente)).toBe(300);

    await auth(request(app).post('/api/periodos')).send({
      nombre: '2da julio pr',
      fecha_inicio: '2026-07-16',
      fecha_fin: '2026-07-31',
      quincena: 2
    });

    const { rows } = await pool.query('SELECT saldo_pendiente FROM prestamos WHERE id=$1', [pr.id]);
    expect(Number(rows[0].saldo_pendiente)).toBe(200);
  });
});
