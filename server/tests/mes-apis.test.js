import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

// Nota sobre las fechas usadas: se eligen años 2022/2023 (ya pasados respecto
// a "hoy") para los escenarios que esperan roles generados, y "mes actual + 1"
// (dinámico) para el escenario de mes futuro, que es el máximo permitido por
// validarMesFuturo. Cada test usa un año+mes distinto entre sí para no
// colisionar con el 409 de "el mes ya tiene período padre".
describe('API períodos mensuales (wizard + cascada + estado derivado)', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST /desde-mes crea el período padre + Q1 + Q2', async () => {
    const app = createApp();
    const sello = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Mes wizard ${sello}`, cedula: `MW${sello % 1e8}`, fecha_ingreso: '2022-01-01'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2022-01-01'
    });

    const res = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 3 });
    expect(res.status).toBe(201);
    expect(res.body.creados).toBe(2);
    expect(res.body.periodo_mes.tipo_periodo).toBe('MES');
    expect(res.body.periodo_mes.quincena).toBe('AMBAS');
    expect(res.body.quincenas).toHaveLength(2);

    const q1 = res.body.quincenas.find((q) => q.quincena === '1');
    const q2 = res.body.quincenas.find((q) => q.quincena === '2');
    expect(q1.mes_periodo_id).toBe(res.body.periodo_mes.id);
    expect(q2.mes_periodo_id).toBe(res.body.periodo_mes.id);
    expect(q1.fecha_inicio.slice(0, 10)).toBe('2022-03-01');
    expect(q1.fecha_fin.slice(0, 10)).toBe('2022-03-15');
    expect(q2.fecha_inicio.slice(0, 10)).toBe('2022-03-16');
    expect(q2.fecha_fin.slice(0, 10)).toBe('2022-03-31');

    // El mes ya pasó: ambas quincenas debieron generar el rol del colaborador vigente.
    const detQ1 = await auth(request(app).get(`/api/periodos/${q1.id}`));
    const detQ2 = await auth(request(app).get(`/api/periodos/${q2.id}`));
    expect(detQ1.body.roles_pago.find((r) => r.colaborador_id === col.id)).toBeTruthy();
    const rolQ2 = detQ2.body.roles_pago.find((r) => r.colaborador_id === col.id);
    expect(rolQ2).toBeTruthy();

    // Regresión: crearMes debe pasar sbu/pctAnticipo a generarRoles igual que
    // POST /periodos suelto. Sin eso, decimoCuarto(sbu=undefined) da NaN
    // (Postgres lo acepta como numeric) y neto/decimo_cuarto quedan NaN,
    // excluyendo en silencio a estos colaboradores del TXT de pago
    // (`rp.neto > 0` es false para NaN).
    expect(Number(rolQ2.neto)).not.toBeNaN();
    expect(Number(rolQ2.neto)).toBeGreaterThan(0);
    const rolQ2Detalle = await auth(request(app).get(`/api/roles/${rolQ2.id}`));
    const decimoCuarto = rolQ2Detalle.body.lineas.find((l) => l.tipo_linea === 'DECIMO_CUARTO');
    expect(decimoCuarto).toBeTruthy();
    // SBU=460.00 (migración 001) → 460/12 = 38.33.
    expect(Number(decimoCuarto.monto)).toBeCloseTo(38.33, 2);
  });

  it('no adopta una quincena suelta con fechas que no coinciden con el rango esperado (409, sin crear nada)', async () => {
    const app = createApp();
    // Q2 cargada con un día de diferencia (empieza el 15, debería ser el 16) —
    // el mismo patrón de dato mal cargado que causó el incidente de producción.
    const q2MalFechada = await auth(request(app).post('/api/periodos')).send({
      nombre: 'Q2 mal fechada', fecha_inicio: '2022-10-15', fecha_fin: '2022-10-31', quincena: 2
    });
    expect(q2MalFechada.status).toBe(201);

    const res = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 10 });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/no coincide con el rango esperado/);

    // No debe haber quedado ningún período padre para ese mes (rollback completo).
    const lista = await auth(request(app).get('/api/periodos/mes'));
    expect(lista.body.meses.find((m) => m.nombre.includes('Octubre'))).toBeUndefined();
  });

  it('no permite crear el mismo mes dos veces (409)', async () => {
    const app = createApp();
    const primero = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 4 });
    expect(primero.status).toBe(201);
    const segundo = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 4 });
    expect(segundo.status).toBe(409);
  });

  it('no genera roles en un mes futuro; sí genera en un mes pasado con colaboradores vigentes', async () => {
    const app = createApp();
    const sello = Date.now();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Mes fechas ${sello}`, cedula: `MD${sello % 1e8}`, fecha_ingreso: '2022-01-01'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2022-01-01'
    });

    // Futuro: el máximo permitido por validarMesFuturo es "mes actual + 1".
    const hoy = new Date();
    let anioFuturo = hoy.getFullYear();
    let mesFuturo = hoy.getMonth() + 2; // getMonth() es 0-indexado; +2 = mes siguiente en 1-indexado
    if (mesFuturo > 12) { mesFuturo -= 12; anioFuturo += 1; }
    const futuro = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: anioFuturo, mes: mesFuturo });
    expect(futuro.status).toBe(201);
    for (const q of futuro.body.quincenas) {
      const det = await auth(request(app).get(`/api/periodos/${q.id}`));
      expect(det.body.roles_pago).toEqual([]);
    }

    // Pasado: sí genera roles para el colaborador con contrato vigente.
    const pasado = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2023, mes: 1 });
    expect(pasado.status).toBe(201);
    for (const q of pasado.body.quincenas) {
      const det = await auth(request(app).get(`/api/periodos/${q.id}`));
      expect(det.body.roles_pago.find((r) => r.colaborador_id === col.id)).toBeTruthy();
    }
  });

  it('aprobar mes aprueba ambas quincenas (no falla si una ya estaba aprobada) y cerrar mes cierra ambas', async () => {
    const app = createApp();
    const wizard = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 6 });
    expect(wizard.status).toBe(201);
    const { periodo_mes: padre, quincenas } = wizard.body;
    const q1 = quincenas.find((q) => q.quincena === '1');
    const q2 = quincenas.find((q) => q.quincena === '2');

    // RRHH ya había aprobado manualmente la Q1 (individual, no cascada).
    const apQ1 = await auth(request(app).post(`/api/periodos/${q1.id}/aprobar`));
    expect(apQ1.status).toBe(200);

    // "Aprobar mes" (cascada) no debe fallar por la Q1 ya aprobada (fix del punto 5).
    const apMes = await auth(request(app).post(`/api/periodos/mes/${padre.id}/aprobar`));
    expect(apMes.status).toBe(200);

    const detQ1 = await auth(request(app).get(`/api/periodos/${q1.id}`));
    const detQ2 = await auth(request(app).get(`/api/periodos/${q2.id}`));
    expect(detQ1.body.estado).toBe('APROBADO');
    expect(detQ2.body.estado).toBe('APROBADO');

    // Cerrar mes (cascada): cierra ambas, ya que ambas están aprobadas.
    const cerrarMes = await auth(request(app).post(`/api/periodos/mes/${padre.id}/cerrar`));
    expect(cerrarMes.status).toBe(200);
    const detQ1Cerrado = await auth(request(app).get(`/api/periodos/${q1.id}`));
    const detQ2Cerrado = await auth(request(app).get(`/api/periodos/${q2.id}`));
    expect(detQ1Cerrado.body.estado).toBe('CERRADO');
    expect(detQ2Cerrado.body.estado).toBe('CERRADO');
  });

  it('GET /mes incluye el padre con sus hijas anidadas y el estado derivado correcto', async () => {
    const app = createApp();
    const wizard = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 7 });
    expect(wizard.status).toBe(201);
    const { periodo_mes: padre, quincenas } = wizard.body;
    const q1 = quincenas.find((q) => q.quincena === '1');
    const q2 = quincenas.find((q) => q.quincena === '2');

    // Solo se aprueba Q1; Q2 sigue en BORRADOR -> el padre debe reportar BORRADOR.
    const apQ1 = await auth(request(app).post(`/api/periodos/${q1.id}/aprobar`));
    expect(apQ1.status).toBe(200);

    const lista = await auth(request(app).get('/api/periodos/mes'));
    expect(lista.status).toBe(200);
    const mio = lista.body.meses.find((m) => m.id === padre.id);
    expect(mio).toBeTruthy();
    expect(mio.estado).toBe('BORRADOR');
    expect(mio.hijas).toHaveLength(2);
    const hijaQ1 = mio.hijas.find((h) => h.id === q1.id);
    const hijaQ2 = mio.hijas.find((h) => h.id === q2.id);
    expect(hijaQ1.estado).toBe('APROBADO');
    expect(hijaQ2.estado).toBe('BORRADOR');
  });

  it('aprobar mes aborta TODA la cascada (rollback completo) si una hija falla por una razón genuina', async () => {
    const app = createApp();
    const wizard = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 9 });
    expect(wizard.status).toBe(201);
    const { periodo_mes: padre, quincenas } = wizard.body;
    const q1 = quincenas.find((q) => q.quincena === '1');
    const q2 = quincenas.find((q) => q.quincena === '2');

    // Q1 pasa por su ciclo completo hasta CERRADO (irreversible en la FSM).
    // Q2 se queda en BORRADOR.
    await auth(request(app).post(`/api/periodos/${q1.id}/aprobar`));
    await auth(request(app).post(`/api/periodos/${q1.id}/cerrar`));

    // "Aprobar mes" intenta aprobar Q2 (válido, BORRADOR->APROBADO) pero
    // también intenta aprobar Q1 (inválida: CERRADO es irreversible, no es
    // "ya está en el estado destino" sino una transición realmente prohibida).
    // La cascada NO debe aprobar Q2 a medias: todo o nada.
    const apMes = await auth(request(app).post(`/api/periodos/mes/${padre.id}/aprobar`));
    expect(apMes.status).toBe(409);

    const detQ1 = await auth(request(app).get(`/api/periodos/${q1.id}`));
    const detQ2 = await auth(request(app).get(`/api/periodos/${q2.id}`));
    expect(detQ1.body.estado).toBe('CERRADO'); // sin cambios
    expect(detQ2.body.estado).toBe('BORRADOR'); // NO quedó aprobada a medias
  });

  it('sincronizar mes omite hijas no editables (ya aprobadas) sin abortar la cascada completa', async () => {
    const app = createApp();
    const wizard = await auth(request(app).post('/api/periodos/desde-mes')).send({ anio: 2022, mes: 8 });
    expect(wizard.status).toBe(201);
    const { periodo_mes: padre, quincenas } = wizard.body;
    const q1 = quincenas.find((q) => q.quincena === '1');

    // Aprobar solo Q1 (queda bloqueada para sincronizar); Q2 sigue en BORRADOR.
    const apQ1 = await auth(request(app).post(`/api/periodos/${q1.id}/aprobar`));
    expect(apQ1.status).toBe(200);

    const sync = await auth(request(app).post(`/api/periodos/mes/${padre.id}/sincronizar`));
    expect(sync.status).toBe(200);
    expect(sync.body.omitidas).toBeGreaterThanOrEqual(1);
  });
});
