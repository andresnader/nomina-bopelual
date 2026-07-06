import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('facturas', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('calcula retención 10% en el servidor', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO',
        nombre: 'Proveedor X',
        cedula: `R${Date.now()}`
      })
    ).body;
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id,
      numero_factura: '001-001-1',
      fecha_factura: '2026-07-10',
      monto_bruto: 1000
    });
    expect(f.status).toBe(201);
    expect(Number(f.body.retencion_10pct)).toBe(100);
    expect(Number(f.body.neto)).toBe(900);
  });

  it('marcar PAGADA fija pagada_en', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO',
        nombre: 'Proveedor Y',
        cedula: `Y${Date.now()}`
      })
    ).body;
    const f = (
      await auth(request(app).post('/api/facturas')).send({
        colaborador_id: prov.id,
        numero_factura: '002',
        fecha_factura: '2026-07-11',
        monto_bruto: 500
      })
    ).body;
    const upd = await auth(request(app).patch(`/api/facturas/${f.id}`)).send({ estado: 'PAGADA' });
    expect(upd.body.estado).toBe('PAGADA');
    expect(upd.body.pagada_en).not.toBeNull();
  });
});
