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
        cedula: `V${Date.now()}`,
        // Igual que en periodos-api: el vínculo tiene que cubrir el período de
        // julio 2026 del test, no la fecha de hoy.
        fecha_ingreso: '2020-01-01'
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
    // El nombre se guarda en mayúsculas.
    expect(res.text).toContain('CSV COL');
  });

  it('neutraliza fórmulas CSV en nombres maliciosos', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS',
        nombre: '=SUM(1+1)',
        cedula: `F${Date.now()}`,
        fecha_ingreso: '2020-01-01'
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

  it('evolución mensual filtra por empresa (vía colaboradores.empresa, no periodos.empresa)', async () => {
    const app = createApp();
    const bop = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `EvolBop ${Date.now()}`, cedula: `EB${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${bop.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const carros = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `EvolCarros ${Date.now()}`, cedula: `EC${Date.now() % 1e8}`
    })).body;
    await auth(request(app).patch(`/api/colaboradores/${carros.id}`)).send({ empresa: 'CARROS-YA S.A.' });
    await auth(request(app).post(`/api/colaboradores/${carros.id}/contratos`)).send({
      sueldo_base: 2000, fecha_inicio: '2026-01-01'
    });
    const nombrePeriodo = `evol empresa ${Date.now()}`;
    await auth(request(app).post('/api/periodos')).send({
      nombre: nombrePeriodo, fecha_inicio: '2027-05-16', fecha_fin: '2027-05-31', quincena: 2
    });

    const soloCarros = await auth(
      request(app).get(`/api/reportes/evolucion-mensual?empresa=${encodeURIComponent('CARROS-YA S.A.')}`)
    );
    const filaCarros = soloCarros.body.find((r) => r.nombre === nombrePeriodo);
    expect(Number(filaCarros.neto)).toBeGreaterThan(0);

    const consolidado = await auth(request(app).get('/api/reportes/evolucion-mensual'));
    const filaConsolidado = consolidado.body.find((r) => r.nombre === nombrePeriodo);
    // Consolidado incluye BOPELUAL + CARROS-YA, así que su neto debe ser mayor
    // que el de CARROS-YA solo.
    expect(Number(filaConsolidado.neto)).toBeGreaterThan(Number(filaCarros.neto));
  });

  it('evolución mensual excluye los períodos MES padre (sin roles_pago propios)', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `EvolMes ${Date.now()}`, cedula: `EM${Date.now() % 1e8}`, fecha_ingreso: '2020-01-01'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2020-01-01'
    });
    const wizard = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2021, mes: 6 });
    expect(wizard.status).toBe(201);
    const mesId = wizard.body.periodo_mes.id;
    const q1Id = wizard.body.quincenas.find((q) => q.quincena === '1').id;

    const res = await auth(request(app).get('/api/reportes/evolucion-mensual'));
    expect(res.body.some((r) => r.id === mesId)).toBe(false);
    expect(res.body.some((r) => r.id === q1Id)).toBe(true);
  });

  it('evolución mensual con empresa vacío (?empresa=) cae a consolidado', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `EvolVacio ${Date.now()}`, cedula: `EVV${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const nombrePeriodo = `evol vacio ${Date.now()}`;
    await auth(request(app).post('/api/periodos')).send({
      nombre: nombrePeriodo, fecha_inicio: '2027-10-16', fecha_fin: '2027-10-31', quincena: 2
    });
    const res = await auth(request(app).get('/api/reportes/evolucion-mensual?empresa='));
    const fila = res.body.find((r) => r.nombre === nombrePeriodo);
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
    const fila = res.body.find((r) => r.proveedor.includes('RETPROV'));
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
    expect(res.body.some((r) => r.colaborador.includes('PROVIS') && Number(r.decimo_tercero) === 50)).toBe(true);
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
    const fila = res.body.find((r) => r.colaborador.includes('DECIMOS'));
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

  it('headcount evolución cuenta activos, altas y bajas por período (desde empleo_periodos)', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Headcount ${Date.now()}`, cedula: `HC${Date.now() % 1e8}`,
      fecha_ingreso: '2021-07-10'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2021-07-10'
    });

    // Período que cubre la fecha de ingreso -> cuenta como alta y como activo.
    const perAlta = await auth(request(app).post('/api/periodos')).send({
      nombre: `headcount alta ${Date.now()}`, fecha_inicio: '2021-07-01', fecha_fin: '2021-07-15', quincena: 1
    });
    // Período posterior sin ingreso/salida en su rango -> solo cuenta como activo.
    const perPosterior = await auth(request(app).post('/api/periodos')).send({
      nombre: `headcount posterior ${Date.now()}`, fecha_inicio: '2021-08-01', fecha_fin: '2021-08-15', quincena: 1
    });

    const res1 = await auth(request(app).get('/api/reportes/headcount-evolucion'));
    const filaAlta = res1.body.find((r) => r.id === perAlta.body.periodo.id);
    const filaPosterior = res1.body.find((r) => r.id === perPosterior.body.periodo.id);
    expect(Number(filaAlta.altas)).toBeGreaterThanOrEqual(1);
    expect(Number(filaAlta.activos)).toBeGreaterThanOrEqual(1);
    expect(Number(filaPosterior.activos)).toBeGreaterThanOrEqual(Number(filaAlta.activos));

    // Período que cubre una salida -> cuenta como baja.
    const perSalida = await auth(request(app).post('/api/periodos')).send({
      nombre: `headcount baja ${Date.now()}`, fecha_inicio: '2021-09-01', fecha_fin: '2021-09-15', quincena: 1
    });
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ fecha_salida: '2021-09-05' });
    const res2 = await auth(request(app).get('/api/reportes/headcount-evolucion'));
    const filaSalida = res2.body.find((r) => r.id === perSalida.body.periodo.id);
    expect(Number(filaSalida.bajas)).toBeGreaterThanOrEqual(1);
  });

  it('headcount evolución filtra por empresa', async () => {
    const app = createApp();
    const fechaIngreso = '2021-10-10';
    const bop = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `HeadBop ${Date.now()}`, cedula: `HB${Date.now() % 1e8}`, fecha_ingreso: fechaIngreso
    })).body;
    await auth(request(app).post(`/api/colaboradores/${bop.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: fechaIngreso
    });
    const carros = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `HeadCarros ${Date.now()}`, cedula: `HR${Date.now() % 1e8}`, fecha_ingreso: fechaIngreso
    })).body;
    await auth(request(app).patch(`/api/colaboradores/${carros.id}`)).send({ empresa: 'CARROS-YA S.A.' });
    await auth(request(app).post(`/api/colaboradores/${carros.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: fechaIngreso
    });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `headcount empresa ${Date.now()}`, fecha_inicio: '2021-10-01', fecha_fin: '2021-10-15', quincena: 1
    });

    const soloCarros = await auth(
      request(app).get(`/api/reportes/headcount-evolucion?empresa=${encodeURIComponent('CARROS-YA S.A.')}`)
    );
    const filaCarros = soloCarros.body.find((r) => r.id === per.body.periodo.id);
    const consolidado = await auth(request(app).get('/api/reportes/headcount-evolucion'));
    const filaConsolidado = consolidado.body.find((r) => r.id === per.body.periodo.id);

    expect(Number(filaCarros.activos)).toBeGreaterThanOrEqual(1);
    expect(Number(filaConsolidado.activos)).toBeGreaterThan(Number(filaCarros.activos));
  });
});
