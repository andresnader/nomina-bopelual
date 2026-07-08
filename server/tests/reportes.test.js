import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'admin@bopelual.com', nombre: 'Admin' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('reportes', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('exporta CSV del período', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS',
        nombre: 'CSV Col',
        cedula: `V${Date.now()}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000,
      fecha_inicio: '2026-01-01'
    });
    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: '2da csv',
        fecha_inicio: '2026-07-16',
        fecha_fin: '2026-07-31',
        quincena: 2
      })
    ).body;
    const res = await auth(request(app).get(`/api/reportes/periodo/${per.periodo.id}.csv`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('colaborador,tipo,total_ingresos');
    expect(res.text).toContain('CSV Col');
  });

  it('neutraliza fórmulas CSV en nombres maliciosos', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS',
        nombre: '=SUM(1+1)',
        cedula: `F${Date.now()}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000,
      fecha_inicio: '2026-01-01'
    });
    const per = (
      await auth(request(app).post('/api/periodos')).send({
        nombre: '2da fx', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
      })
    ).body;
    const res = await auth(request(app).get(`/api/reportes/periodo/${per.periodo.id}.csv`));
    // El nombre debe salir prefijado con apóstrofo, nunca como fórmula ejecutable.
    expect(res.text).toContain("'=SUM(1+1)");
    expect(res.text).not.toMatch(/(^|,)=SUM/);
  });

  it('permite editar el SBU (parámetro) como ADMIN', async () => {
    const app = createApp();
    const res = await auth(request(app).put('/api/parametros/SBU')).send({ valor: '470.00' });
    expect(res.status).toBe(200);
    expect(res.body.valor).toBe('470.00');
    // Restaura para no afectar otros tests.
    await auth(request(app).put('/api/parametros/SBU')).send({ valor: '460.00' });
  });

  it('documentos-faltantes lista colaboradores activos sin documentos', async () => {
    const app = createApp();
    const sinDoc = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `SinDoc ${Date.now()}`, cedula: `SD${Date.now() % 1e8}`
    })).body;
    const res = await auth(request(app).get('/api/reportes/documentos-faltantes'));
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.id === sinDoc.id)).toBe(true);
  });
});
