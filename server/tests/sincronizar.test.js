import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('POST /api/roles/:id/sincronizar', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('agrega préstamos y descuentos creados después de generar el período, sin duplicar', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Sync ${Date.now()}`, cedula: `SY${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sync test ${Date.now()}`, fecha_inicio: '2026-11-16', fecha_fin: '2026-11-30', quincena: 2
    });
    const det1 = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det1.body.roles_pago.find((r) => r.colaborador_id === col.id);

    // Se crean DESPUÉS de generar el período: no deberían estar en el rol todavía
    await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 200, cuota_quincena: 50, fecha_inicio: '2026-11-01'
    });
    await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
    });

    const antes = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(antes.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(false);
    expect(antes.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(false);

    const sync = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync.status).toBe(200);
    expect(sync.body.agregadas).toBe(2);

    const despues = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(despues.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(true);
    expect(despues.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(true);

    // Sincronizar de nuevo no duplica
    const sync2 = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync2.body.agregadas).toBe(0);
    const final = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(final.filter((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toHaveLength(1);
  });

  it('actualiza el monto de una línea ya generada cuando se edita el descuento origen', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `SyncEdit ${Date.now()}`, cedula: `SE${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });

    // Descuento creado ANTES del período: se aplica automáticamente al generar roles.
    const desc = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
      })
    ).body;

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sync edit ${Date.now()}`, fecha_inicio: '2026-11-16', fecha_fin: '2026-11-30', quincena: 2
    });
    const det1 = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det1.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const antes = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(antes.find((l) => l.tipo_linea === 'ALIMENTACION').monto).toBe('15.00');

    // Se edita el monto del descuento DESPUÉS de generado el rol.
    await auth(request(app).patch(`/api/descuentos/${desc.id}`)).send({ monto: 22 });

    const sync = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync.status).toBe(200);

    const despues = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    const linea = despues.find((l) => l.tipo_linea === 'ALIMENTACION');
    expect(linea.monto).toBe('22.00');
    expect(despues.filter((l) => l.tipo_linea === 'ALIMENTACION')).toHaveLength(1);
  });

  it('rechaza sincronizar un período que no está en BORRADOR', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `SyncCerrado ${Date.now()}`, cedula: `SC${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sync cerrado ${Date.now()}`, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-15', quincena: 1
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/aprobar`));
    const res = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(res.status).toBe(409);
  });
});
