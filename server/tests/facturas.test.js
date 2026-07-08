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

  it('CARROS-YA no retiene por defecto (config_empresas.aplica_retencion=false)', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Proveedor CarrosYa', cedula: `CY${Date.now()}`
      })
    ).body;
    await auth(request(app).patch(`/api/colaboradores/${prov.id}`)).send({ empresa: 'CARROS-YA S.A.' });
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, numero_factura: '001', fecha_factura: '2026-07-10', monto_bruto: 1000
    });
    expect(f.status).toBe(201);
    expect(Number(f.body.retencion_10pct)).toBe(0);
    expect(Number(f.body.neto)).toBe(1000);
    expect(f.body.empresa).toBe('CARROS-YA S.A.');
  });

  it('BOPELUAL sigue reteniendo el 10%', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Proveedor Bopelual', cedula: `BP${Date.now()}`
      })
    ).body;
    await auth(request(app).patch(`/api/colaboradores/${prov.id}`)).send({ empresa: 'BOPELUAL S.A.' });
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, numero_factura: '002', fecha_factura: '2026-07-10', monto_bruto: 1000
    });
    expect(Number(f.body.retencion_10pct)).toBe(100);
    expect(f.body.empresa).toBe('BOPELUAL S.A.');
  });

  it('sin empresa asignada, aplica retención por defecto (comportamiento seguro)', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Proveedor Sin Empresa', cedula: `SE${Date.now()}`
      })
    ).body;
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, numero_factura: '003', fecha_factura: '2026-07-10', monto_bruto: 1000
    });
    expect(Number(f.body.retencion_10pct)).toBe(100);
  });

  it('filtra por colaborador_id', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Filtro Prov', cedula: `FP${Date.now()}`
      })
    ).body;
    await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, fecha_factura: '2026-07-10', monto_bruto: 100
    });
    const res = await auth(request(app).get(`/api/facturas?colaborador_id=${prov.id}`));
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((f) => f.colaborador_id === prov.id)).toBe(true);
  });
});
