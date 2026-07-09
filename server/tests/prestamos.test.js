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

  it('un préstamo tipo=ANTICIPO genera ANTICIPO_SUELDO en vez de CUOTA_PRESTAMO', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `AnticipoNomina ${Date.now()}`, cedula: `AL${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const anticipo = (
      await auth(request(app).post('/api/prestamos')).send({
        colaborador_id: col.id, monto_total: 200, cuota_quincena: 50, fecha_inicio: '2026-11-01', tipo: 'ANTICIPO'
      })
    ).body;

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `anticipo nomina test ${Date.now()}`, fecha_inicio: '2026-11-16', fecha_fin: '2026-11-30', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;

    const linea = lineas.find((l) => l.prestamo_id === anticipo.id);
    expect(linea.tipo_linea).toBe('ANTICIPO_SUELDO');
    expect(linea.descripcion).toBe('Cuota de anticipo');
    expect(lineas.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(false);
  });

  async function crearPrestamo(app, monto = 300, cuota = 100) {
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Prestamista ${Date.now()}`, cedula: `PR${Date.now() % 1e8}`
      })
    ).body;
    return (
      await auth(request(app).post('/api/prestamos')).send({
        colaborador_id: col.id, monto_total: monto, cuota_quincena: cuota, fecha_inicio: '2026-07-01'
      })
    ).body;
  }

  it('POST acepta tipo=ANTICIPO y GET filtra por tipo', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Anticipo ${Date.now()}`, cedula: `AN${Date.now() % 1e8}`
      })
    ).body;

    const anticipo = await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 200, cuota_quincena: 50, fecha_inicio: '2026-07-01', tipo: 'ANTICIPO'
    });
    expect(anticipo.status).toBe(201);
    expect(anticipo.body.tipo).toBe('ANTICIPO');

    const soloPrestamo = await crearPrestamo(app);

    const filtroAnticipos = await auth(request(app).get(`/api/prestamos?tipo=ANTICIPO&colaborador_id=${col.id}`));
    expect(filtroAnticipos.body.data.every((p) => p.tipo === 'ANTICIPO')).toBe(true);
    expect(filtroAnticipos.body.data.some((p) => p.id === anticipo.body.id)).toBe(true);

    const filtroPrestamos = await auth(request(app).get(`/api/prestamos?tipo=PRESTAMO&colaborador_id=${soloPrestamo.colaborador_id}`));
    expect(filtroPrestamos.body.data.some((p) => p.id === soloPrestamo.id)).toBe(true);
    expect(filtroPrestamos.body.data.some((p) => p.id === anticipo.body.id)).toBe(false);
  });

  it('POST sin tipo sigue creando PRESTAMO por defecto (compatibilidad)', async () => {
    const app = createApp();
    const pr = await crearPrestamo(app);
    expect(pr.tipo).toBe('PRESTAMO');
  });

  it('lista paginada con búsqueda y resumen', async () => {
    const app = createApp();
    await crearPrestamo(app);
    const res = await auth(request(app).get('/api/prestamos?per_page=5&page=1'));
    expect(res.body.data.length).toBeLessThanOrEqual(5);
    expect(res.body.total).toBeGreaterThanOrEqual(1);
    expect(res.body.resumen.activos).toBeGreaterThanOrEqual(1);
    expect(Number(res.body.resumen.saldo_activo)).toBeGreaterThan(0);
  });

  it('abono parcial reduce el saldo y la precancelación lo desactiva', async () => {
    const app = createApp();
    const pr = await crearPrestamo(app, 300, 100);

    const abono = await auth(request(app).post(`/api/prestamos/${pr.id}/abonos`)).send({ monto: 120.5 });
    expect(abono.status).toBe(201);
    expect(Number(abono.body.saldo_pendiente)).toBe(179.5);
    expect(abono.body.activo).toBe(true);

    // Sin monto = precancela el saldo restante
    const pre = await auth(request(app).post(`/api/prestamos/${pr.id}/abonos`)).send({});
    expect(Number(pre.body.saldo_pendiente)).toBe(0);
    expect(pre.body.activo).toBe(false);

    // No admite abonos sobre un préstamo saldado ni montos mayores al saldo
    const extra = await auth(request(app).post(`/api/prestamos/${pr.id}/abonos`)).send({});
    expect(extra.status).toBe(409);

    const det = await auth(request(app).get(`/api/prestamos/${pr.id}`));
    expect(det.body.abonos_detalle).toHaveLength(2);
    expect(det.body.abonos_detalle[0].notas).toBe('Precancelación');
  });

  it('rechaza abonos mayores al saldo', async () => {
    const app = createApp();
    const pr = await crearPrestamo(app, 100, 50);
    const res = await auth(request(app).post(`/api/prestamos/${pr.id}/abonos`)).send({ monto: 150 });
    expect(res.status).toBe(400);
  });

  it('solo se eliminan préstamos sin pagos aplicados', async () => {
    const app = createApp();
    const conAbono = await crearPrestamo(app);
    await auth(request(app).post(`/api/prestamos/${conAbono.id}/abonos`)).send({ monto: 50 });
    const bloqueado = await auth(request(app).del(`/api/prestamos/${conAbono.id}`));
    expect(bloqueado.status).toBe(409);

    const limpio = await crearPrestamo(app);
    const ok = await auth(request(app).del(`/api/prestamos/${limpio.id}`));
    expect(ok.status).toBe(200);
    const det = await auth(request(app).get(`/api/prestamos/${limpio.id}`));
    expect(det.status).toBe(404);
  });

  it('valida cuota mayor a 0 y no superior al monto', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: 'Validaciones', cedula: `PV${Date.now() % 1e8}`
      })
    ).body;
    const mala = await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 100, cuota_quincena: 200, fecha_inicio: '2026-07-01'
    });
    expect(mala.status).toBe(400);
  });
});
