import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('API períodos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('crea período con roles y bloquea edición al cerrar', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS',
        nombre: 'API test',
        cedula: `A${Date.now()}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000,
      fecha_inicio: '2026-01-01'
    });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: '2da julio',
      fecha_inicio: '2026-07-16',
      fecha_fin: '2026-07-31',
      quincena: 2
    });
    expect(per.status).toBe(201);
    expect(per.body.creados).toBeGreaterThanOrEqual(1);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    expect(rol).toBeTruthy();

    // Editable en BORRADOR
    const ok = await auth(request(app).post(`/api/roles/${rol.id}/lineas`)).send({
      tipo_linea: 'BONO_DESEMPENO',
      clase: 'INGRESO',
      monto: 50
    });
    expect(ok.status).toBe(201);

    // Cerrar (aprobar → cerrar)
    await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/aprobar`));
    await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/cerrar`));

    // Ya NO editable
    const bloqueado = await auth(request(app).post(`/api/roles/${rol.id}/lineas`)).send({
      tipo_linea: 'MULTA',
      clase: 'DESCUENTO',
      monto: 10
    });
    expect(bloqueado.status).toBe(409);
  });

  it('rechaza cerrar un período en BORRADOR (409)', async () => {
    const app = createApp();
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: 'borrador', fecha_inicio: '2026-08-01', fecha_fin: '2026-08-15', quincena: 1
    });
    const res = await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/cerrar`));
    expect(res.status).toBe(409);
  });
});
