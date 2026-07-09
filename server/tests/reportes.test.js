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

  it('evolución mensual agrega ingresos/descuentos/neto por período', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Evol ${Date.now()}`, cedula: `EV${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    await auth(request(app).post('/api/periodos')).send({
      nombre: `evol test ${Date.now()}`, fecha_inicio: '2027-01-16', fecha_fin: '2027-01-31', quincena: 2
    });
    const res = await auth(request(app).get('/api/reportes/evolucion-mensual'));
    expect(res.status).toBe(200);
    const fila = res.body.find((r) => r.nombre.includes('evol test'));
    expect(Number(fila.neto)).toBeGreaterThan(0);
  });

  it('retenciones por proveedor agrupa por mes', async () => {
    const app = createApp();
    const prov = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'EXTERNO', nombre: `RetProv ${Date.now()}`, cedula: `RP${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, fecha_factura: '2026-07-05', monto_bruto: 1000
    });
    const res = await auth(request(app).get('/api/reportes/retenciones-proveedor'));
    const fila = res.body.find((r) => r.proveedor.includes('RetProv'));
    expect(Number(fila.total_retencion)).toBe(100);
  });

  it('provisiones filtra por año', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Provis ${Date.now()}`, cedula: `PV2${Date.now() % 1e8}`
    })).body;
    await pool.query(
      `INSERT INTO provisiones (colaborador_id, anio, decimo_tercero) VALUES ($1, 2099, 50)`,
      [col.id]
    );
    const res = await auth(request(app).get('/api/reportes/provisiones?anio=2099'));
    expect(res.body.some((r) => r.colaborador.includes('Provis') && Number(r.decimo_tercero) === 50)).toBe(true);
  });

  it('decimos-periodo devuelve el desglose de un período cerrado', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Decimos ${Date.now()}`, cedula: `DC${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1200, fecha_inicio: '2026-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `decimos test ${Date.now()}`, fecha_inicio: '2027-03-16', fecha_fin: '2027-03-31', quincena: 2
    });
    const periodoId = per.body.periodo.id;

    await pool.query(`UPDATE usuarios SET rol='RRHH' WHERE email='admin@bopelual.com'`);
    await auth(request(app).post(`/api/periodos/${periodoId}/aprobar`));
    await auth(request(app).post(`/api/periodos/${periodoId}/cerrar`));

    const res = await auth(request(app).get(`/api/reportes/decimos-periodo?periodo_id=${periodoId}`));
    expect(res.status).toBe(200);
    const fila = res.body.find((r) => r.colaborador.includes('Decimos'));
    expect(Number(fila.decimo_tercero)).toBeCloseTo(100, 2);
    expect(Number(fila.decimo_cuarto)).toBeGreaterThan(0);
    expect(Number(fila.fondos_reserva)).toBeGreaterThan(0);
  });

  it('decimos-periodo rechaza un período que no está CERRADO', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `DecimosBorrador ${Date.now()}`, cedula: `DB${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `decimos borrador ${Date.now()}`, fecha_inicio: '2027-04-16', fecha_fin: '2027-04-30', quincena: 2
    });
    const res = await auth(request(app).get(`/api/reportes/decimos-periodo?periodo_id=${per.body.periodo.id}`));
    expect(res.status).toBe(400);
  });

  it('costo por departamento con periodo_id devuelve montos reales del período', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `CostoDept ${Date.now()}`, cedula: `CD${Date.now() % 1e8}`, departamento: 'PRUEBAS'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `costo dept ${Date.now()}`, fecha_inicio: '2027-02-16', fecha_fin: '2027-02-28', quincena: 2
    });
    const res = await auth(request(app).get(`/api/reportes/costo-departamento?periodo_id=${per.body.periodo.id}`));
    const fila = res.body.find((r) => r.departamento === 'PRUEBAS');
    expect(Number(fila.neto)).toBeGreaterThan(0);
  });
});
