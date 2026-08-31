import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const { armarRolIndividual } = await import('../src/services/rol-individual.js');
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearMesCompleto(app, { nombreCol, sueldoBase, iessTasaEspecial, mesInicio, mesFin, q1Inicio, q1Fin, q2Inicio, q2Fin, notasPrestamo }) {
  const col = (await auth(request(app).post('/api/colaboradores')).send({
    tipo: 'IESS', nombre: nombreCol, cedula: `RI${Date.now() % 1e8}`, fecha_ingreso: '2020-01-01'
  })).body;
  if (iessTasaEspecial != null) {
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ iess_tasa_personal_especial: iessTasaEspecial });
  }
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: sueldoBase, fecha_inicio: '2020-01-01'
  });
  if (notasPrestamo) {
    await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 704.18, cuota_quincena: 704.18,
      fecha_inicio: q1Inicio, aplicar_en: 1, notas: notasPrestamo
    });
  }

  const mes = await pool.query(
    `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado)
     VALUES ($1,$2,$3,'AMBAS','MES','BORRADOR') RETURNING id`,
    [`Mes RI ${Date.now()}`, mesInicio, mesFin]
  );
  const mesId = mes.rows[0].id;
  const q1 = await auth(request(app).post('/api/periodos')).send({
    nombre: `1ra RI ${Date.now()}`, fecha_inicio: q1Inicio, fecha_fin: q1Fin, quincena: 1
  });
  const q2 = await auth(request(app).post('/api/periodos')).send({
    nombre: `2da RI ${Date.now()}`, fecha_inicio: q2Inicio, fecha_fin: q2Fin, quincena: 2
  });
  await pool.query(`UPDATE periodos SET mes_periodo_id=$1 WHERE id IN ($2,$3)`, [mesId, q1.body.periodo.id, q2.body.periodo.id]);

  return { col, periodoQ1Id: q1.body.periodo.id, periodoQ2Id: q2.body.periodo.id };
}

describe('armarRolIndividual', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('combina 1ra y 2da quincena: sueldo completo como ingreso, anticipo reclasificado como egreso', async () => {
    const app = createApp();
    const { col, periodoQ2Id } = await crearMesCompleto(app, {
      nombreCol: `RolIndividual ${Date.now()}`, sueldoBase: 2300, iessTasaEspecial: 0.176,
      mesInicio: '2027-11-01', mesFin: '2027-11-30',
      q1Inicio: '2027-11-01', q1Fin: '2027-11-15',
      q2Inicio: '2027-11-16', q2Fin: '2027-11-30',
      notasPrestamo: 'HIPOTECARIO'
    });

    const resultado = await armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id });

    const sueldo = resultado.ingresos.find((i) => i.label === 'SUELDO');
    expect(Number(sueldo.monto)).toBeCloseTo(2300, 2);
    // totalIngresos incluye SUELDO + décimo tercero/cuarto + fondos de
    // reserva: son líneas reales de la 2da quincena (es_provision=false),
    // no provisiones contables, así que sí forman parte de lo que este
    // documento reporta como ingreso del período.
    expect(Number(resultado.totalIngresos)).toBeCloseTo(2721.59, 2); // 2300 sueldo + 191.67 décimo3 + 38.33 décimo4 + 191.59 fondos
    const decimo3 = resultado.ingresos.find((i) => i.label === 'DECIMO_TERCERO');
    const decimo4 = resultado.ingresos.find((i) => i.label === 'DECIMO_CUARTO');
    const fondos = resultado.ingresos.find((i) => i.label === 'Fondos de reserva');
    expect(decimo3).toBeTruthy();
    expect(decimo4).toBeTruthy();
    expect(fondos).toBeTruthy();

    const iess = resultado.egresos.find((e) => e.label === '17.60% IESS');
    expect(iess).toBeTruthy();
    expect(Number(iess.monto)).toBeCloseTo(2300 * 0.176, 2);

    const hipotecario = resultado.egresos.find((e) => e.label === 'HIPOTECARIO');
    expect(hipotecario).toBeTruthy();
    expect(Number(hipotecario.monto)).toBeCloseTo(704.18, 2);

    const anticipo = resultado.egresos.find((e) => e.label === 'Anticipo 1ra. Quincena');
    expect(anticipo).toBeTruthy();
    // El anticipo que se resta acá debe ser el NETO de Q1 (920 de anticipo
    // bruto - 704.18 de la cuota HIPOTECARIO que ya se descontó en Q1 misma),
    // no el bruto: 215.82. Si se restara el bruto (920), la cuota HIPOTECARIO
    // quedaría contada dos veces (una como su propia fila de egreso arriba,
    // otra de nuevo escondida en el anticipo).
    expect(Number(anticipo.monto)).toBeCloseTo(215.82, 2);
    // El anticipo debe ser la ÚLTIMA fila de egresos.
    expect(resultado.egresos[resultado.egresos.length - 1].label).toBe('Anticipo 1ra. Quincena');

    expect(Number(resultado.totalEgresos)).toBeCloseTo(1324.8, 2); // 704.18 + 404.8 + 215.82
    expect(Number(resultado.totalARecibir)).toBeCloseTo(1396.79, 2); // 2721.59 - 1324.8
    expect(Number(resultado.totalARecibir)).toBeCloseTo(
      Number(resultado.totalIngresos) - Number(resultado.totalEgresos), 2
    );
    expect(resultado.diasTrabajados).toBe(30);
  });

  it('totalARecibir debe igualar el neto real de Q2 cuando Q1 tiene una cuota de préstamo propia (regresión: no restar el anticipo bruto de Q1 dos veces)', async () => {
    const app = createApp();
    const { col, periodoQ1Id, periodoQ2Id } = await crearMesCompleto(app, {
      nombreCol: `RolIndividualRegresion ${Date.now()}`, sueldoBase: 2300, iessTasaEspecial: 0.176,
      mesInicio: '2027-11-01', mesFin: '2027-11-30',
      q1Inicio: '2027-11-01', q1Fin: '2027-11-15',
      q2Inicio: '2027-11-16', q2Fin: '2027-11-30',
      notasPrestamo: 'HIPOTECARIO'
    });

    const resultado = await armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id });

    // El HIPOTECARIO (704.18) se aplicó solo en Q1 (aplicar_en=1), así que
    // Q1 ya tiene un egreso propio: su neto real pagado por transferencia
    // fue MENOR que el anticipo bruto. Antes del fix, restar el anticipo
    // bruto (en vez del neto de Q1) hacía que esa cuota se contara dos
    // veces y totalARecibir quedara subvaluado en exactamente 704.18.
    const { rows: rolesQ1 } = await pool.query(
      `SELECT neto FROM roles_pago WHERE colaborador_id=$1 AND periodo_id=$2`,
      [col.id, periodoQ1Id]
    );
    const { rows: rolesQ2 } = await pool.query(
      `SELECT neto FROM roles_pago WHERE colaborador_id=$1 AND periodo_id=$2`,
      [col.id, periodoQ2Id]
    );
    const netoRealQ1 = Number(rolesQ1[0].neto);
    const netoRealQ2 = Number(rolesQ2[0].neto);

    // El neto de Q1 debe ser el anticipo bruto (920) menos la cuota HIPOTECARIO
    // aplicada ahí mismo (704.18) — confirma que el fixture sí ejercita el
    // escenario del bug (una deducción propia de Q1).
    expect(netoRealQ1).toBeCloseTo(920 - 704.18, 2);

    const anticipo = resultado.egresos.find((e) => e.label === 'Anticipo 1ra. Quincena');
    expect(Number(anticipo.monto)).toBeCloseTo(netoRealQ1, 2);

    // La aserción central: lo que el documento dice que falta por entregar
    // ahora debe coincidir con lo que Q2 realmente le debe al colaborador.
    expect(Number(resultado.totalARecibir)).toBeCloseTo(netoRealQ2, 2);
  });

  it('usa 9.45% IESS por defecto cuando el colaborador no tiene tasa especial', async () => {
    const app = createApp();
    const { col, periodoQ2Id } = await crearMesCompleto(app, {
      nombreCol: `RolIndividualTasaEstandar ${Date.now()}`, sueldoBase: 1000, iessTasaEspecial: null,
      mesInicio: '2027-12-01', mesFin: '2027-12-31',
      q1Inicio: '2027-12-01', q1Fin: '2027-12-15',
      q2Inicio: '2027-12-16', q2Fin: '2027-12-31'
    });
    const resultado = await armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id });
    const iess = resultado.egresos.find((e) => e.label === '9.45% IESS');
    expect(iess).toBeTruthy();
    expect(Number(iess.monto)).toBeCloseTo(1000 * 0.0945, 2);
  });

  it('sin notas en el préstamo, usa la descripción genérica de la línea', async () => {
    const app = createApp();
    const { col, periodoQ2Id } = await crearMesCompleto(app, {
      nombreCol: `RolIndividualSinNotas ${Date.now()}`, sueldoBase: 900, iessTasaEspecial: null,
      mesInicio: '2028-01-01', mesFin: '2028-01-31',
      q1Inicio: '2028-01-01', q1Fin: '2028-01-15',
      q2Inicio: '2028-01-16', q2Fin: '2028-01-31',
      notasPrestamo: null
    });
    // Préstamo SIN notas (aparte del que crea crearMesCompleto solo si notasPrestamo se pasa).
    // aplicar_en=0 (Ambas, el default): se crea DESPUÉS de que Q1 y Q2 ya
    // existían, así que hace falta sincronizar Q2 para que le aplique la cuota.
    await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 50, cuota_quincena: 50, fecha_inicio: '2028-01-01'
    });
    const detQ2 = await auth(request(app).get(`/api/periodos/${periodoQ2Id}`));
    const rolQ2 = detQ2.body.roles_pago.find((r) => r.colaborador_id === col.id);
    await auth(request(app).post(`/api/roles/${rolQ2.id}/sincronizar`));

    const resultado = await armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id });
    expect(resultado.egresos.some((e) => e.label === 'Cuota de préstamo')).toBe(true);
  });

  it('sin período 1ra quincena hermana, arma el documento solo con la 2da', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `RolIndividualSoloQ2 ${Date.now()}`, cedula: `SQ${Date.now() % 1e8}`,
      fecha_ingreso: '2028-02-20'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2028-02-20'
    });
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da soloQ2 ${Date.now()}`, fecha_inicio: '2028-02-16', fecha_fin: '2028-02-28', quincena: 2
    });

    const resultado = await armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id: q2.body.periodo.id });
    expect(resultado.egresos.some((e) => e.label === 'Anticipo 1ra. Quincena')).toBe(false);
  });

  it('rechaza EXTERNO', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'EXTERNO', nombre: `RolIndividualExterno ${Date.now()}`, cedula: `EX${Date.now() % 1e8}`
    })).body;
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da externo ${Date.now()}`, fecha_inicio: '2028-03-16', fecha_fin: '2028-03-31', quincena: 2
    });
    await expect(armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id: q2.body.periodo.id }))
      .rejects.toThrow('este documento solo aplica a colaboradores IESS');
  });

  it('rechaza un período que no es 2da quincena', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `RolIndividualQ1 ${Date.now()}`, cedula: `Q1${Date.now() % 1e8}`
    })).body;
    const q1 = await auth(request(app).post('/api/periodos')).send({
      nombre: `1ra sola ${Date.now()}`, fecha_inicio: '2028-04-01', fecha_fin: '2028-04-15', quincena: 1
    });
    await expect(armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id: q1.body.periodo.id }))
      .rejects.toThrow('el período indicado no es una 2da quincena');
  });

  it('cuenta los días trabajados sobre el mes completo, no solo una quincena (ingreso a mitad de mes)', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `RolIndividualMedioMes ${Date.now()}`, cedula: `MM${Date.now() % 1e8}`,
      fecha_ingreso: '2028-06-10'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2028-06-10'
    });

    const mes = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado)
       VALUES ($1,$2,$3,'AMBAS','MES','BORRADOR') RETURNING id`,
      [`Mes RI MedioMes ${Date.now()}`, '2028-06-01', '2028-06-30']
    );
    const q1 = await auth(request(app).post('/api/periodos')).send({
      nombre: `1ra MedioMes ${Date.now()}`, fecha_inicio: '2028-06-01', fecha_fin: '2028-06-15', quincena: 1
    });
    const q2 = await auth(request(app).post('/api/periodos')).send({
      nombre: `2da MedioMes ${Date.now()}`, fecha_inicio: '2028-06-16', fecha_fin: '2028-06-30', quincena: 2
    });
    await pool.query(`UPDATE periodos SET mes_periodo_id=$1 WHERE id IN ($2,$3)`, [mes.rows[0].id, q1.body.periodo.id, q2.body.periodo.id]);

    const resultado = await armarRolIndividual(pool, { colaboradorId: col.id, periodoQ2Id: q2.body.periodo.id });
    // 2028-06-10 a 2028-06-30 inclusive = 21 días (30 - 10 + 1). Antes del
    // fix, factorProrrateo tapaba el conteo en 15 (una sola quincena) y
    // devolvía 30 (100% del mes) para este caso.
    expect(resultado.diasTrabajados).toBe(21);
  });
});
