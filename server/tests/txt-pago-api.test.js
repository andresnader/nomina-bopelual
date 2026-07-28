import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('GET /api/periodos/:id/txt-pago', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('genera el TXT con transferencias y reporta excluidos sin datos bancarios', async () => {
    const app = createApp();
    const sello = Date.now();

    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT test ${sello}','2026-09-01','2026-09-15',1,'CERRADO') RETURNING id`
    );
    const { rows: conCuenta } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa, cuenta_bancaria, tipo_cuenta, codigo_banco)
       VALUES ('IESS','09${sello % 1e8}','PAGABLE UNO','ADMINISTRACION','BOPELUAL S.A.','2205467800','AHORRO','10')
       RETURNING id`
    );
    const { rows: sinCuenta } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa)
       VALUES ('EXTERNO','08${sello % 1e8}','SIN CUENTA','COMERCIAL','BOPELUAL S.A.') RETURNING id`
    );
    await pool.query(
      `INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,190.00), ($1,$3,50.00)`,
      [per[0].id, conCuenta[0].id, sinCuenta[0].id]
    );

    const res = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago`));
    expect(res.status).toBe(200);
    expect(res.body.incluidos).toBe(1);
    expect(res.body.total).toBe(190);
    expect(res.body.excluidos).toEqual([
      { nombre: 'SIN CUENTA', neto: '50.00', motivo: 'sin datos bancarios' }
    ]);
    const linea = res.body.contenido.split('\r\n')[0].split('\t');
    expect(linea).toEqual([
      'PA', '1', 'USD', '19000', 'CTA', 'AHO', '2205467800',
      res.body.descripcion, 'C', `09${sello % 1e8}`, 'PAGABLE UNO', '10'
    ]);

    // filtro por grupo: ADM incluye al IESS administrativo, SERV_PROF al externo (excluido)
    const adm = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?grupo=ADM`));
    expect(adm.body.incluidos).toBe(1);
    const sp = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?grupo=SERV_PROF`));
    expect(sp.body.incluidos).toBe(0);
    expect(sp.body.excluidos).toHaveLength(1);
  });

  it('rechaza grupo inválido y período inexistente', async () => {
    const app = createApp();
    const malGrupo = await auth(
      request(app).get('/api/periodos/00000000-0000-0000-0000-000000000000/txt-pago?grupo=NADA')
    );
    expect(malGrupo.status).toBe(400);
    const noExiste = await auth(
      request(app).get('/api/periodos/00000000-0000-0000-0000-000000000000/txt-pago')
    );
    expect(noExiste.status).toBe(404);
  });

  it('exige tipo y clasificación juntos (400 si falta uno de los dos)', async () => {
    const app = createApp();
    const sello = Date.now();
    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT solo-tipo ${sello}','2026-09-01','2026-09-15',1,'BORRADOR') RETURNING id`
    );
    const soloTipo = await auth(request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=IESS`));
    expect(soloTipo.status).toBe(400);
    const soloClasificacion = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?clasificacion=COMERCIAL`)
    );
    expect(soloClasificacion.status).toBe(400);
  });

  it('filtra por tipo+clasificacion ortogonales y por empresa, dentro de una misma quincena', async () => {
    const app = createApp();
    const sello = Date.now();
    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT ortogonal ${sello}','2026-10-01','2026-10-15',1,'BORRADOR') RETURNING id`
    );
    const crearCol = async (tipo, clasificacion, empresa, cedulaPrefijo) => {
      const { rows: c } = await pool.query(
        `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa, clasificacion, cuenta_bancaria, tipo_cuenta, codigo_banco)
         VALUES ($1,$2,$3,'ADMINISTRACION',$4,$5,'2205467800','AHORRO','10') RETURNING id`,
        [tipo, `${cedulaPrefijo}${sello % 1e8}`, `${tipo} ${clasificacion} ${empresa} ${sello}`, empresa, clasificacion]
      );
      await pool.query(`INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,100)`, [per[0].id, c[0].id]);
      return c[0];
    };

    await crearCol('IESS', 'ADMINISTRATIVO', 'BOPELUAL S.A.', '01');
    await crearCol('IESS', 'ADMINISTRATIVO', 'CARROS-YA S.A.', '02');
    await crearCol('IESS', 'COMERCIAL', 'BOPELUAL S.A.', '03');
    await crearCol('EXTERNO', 'ADMINISTRATIVO', 'BOPELUAL S.A.', '04');

    // tipo+clasificacion sin empresa: junta las dos empresas (IESS+ADMINISTRATIVO = 2)
    const sinEmpresa = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO`)
    );
    expect(sinEmpresa.status).toBe(200);
    expect(sinEmpresa.body.incluidos).toBe(2);
    expect(sinEmpresa.body.warnings).toEqual([]);

    // con empresa: excluye a la otra empresa
    const conEmpresa = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO&empresa=${encodeURIComponent('BOPELUAL S.A.')}`)
    );
    expect(conEmpresa.status).toBe(200);
    expect(conEmpresa.body.incluidos).toBe(1);

    // otra combinación ortogonal (COMERCIAL) da un resultado distinto (no se mezcla con ADMINISTRATIVO)
    const comercial = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=IESS&clasificacion=COMERCIAL`)
    );
    expect(comercial.status).toBe(200);
    expect(comercial.body.incluidos).toBe(1);
  });

  it('warnings es [] cuando hay datos y trae un mensaje cuando la combinación no tiene colaboradores', async () => {
    const app = createApp();
    const sello = Date.now();
    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT warnings ${sello}','2026-10-16','2026-10-31',2,'BORRADOR') RETURNING id`
    );
    const { rows: warnCol } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa, clasificacion, cuenta_bancaria, tipo_cuenta, codigo_banco)
       VALUES ('IESS','05${sello % 1e8}','WARN TEST ${sello}','ADMINISTRACION','BOPELUAL S.A.','ADMINISTRATIVO','2205467800','AHORRO','10')
       RETURNING id`
    );
    await pool.query(`INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,100)`, [per[0].id, warnCol[0].id]);

    // combinación sin ningún colaborador (EXTERNO/COMERCIAL no existe en este período)
    const vacio = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=EXTERNO&clasificacion=COMERCIAL`)
    );
    expect(vacio.status).toBe(200);
    expect(vacio.body.incluidos).toBe(0);
    expect(vacio.body.excluidos).toEqual([]);
    expect(Array.isArray(vacio.body.warnings)).toBe(true);
    expect(vacio.body.warnings).toHaveLength(1);
    expect(vacio.body.warnings[0]).toMatch(/tipo=EXTERNO/);
    expect(vacio.body.warnings[0]).toMatch(/clasificacion=COMERCIAL/);

    // combinación con colaborador: sin warnings
    const conDatos = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO`)
    );
    expect(conDatos.body.incluidos).toBe(1);
    expect(conDatos.body.warnings).toEqual([]);
  });

  it('registra la descarga en txt_descargas cuando genera contenido con éxito', async () => {
    const app = createApp();
    const sello = Date.now();
    const { rows: usr } = await pool.query(`SELECT id FROM usuarios WHERE email='rrhh@bopelual.com'`);
    const { rows: per } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, estado)
       VALUES ('TXT auditoria ${sello}','2026-11-01','2026-11-15',1,'BORRADOR') RETURNING id`
    );
    const { rows: c } = await pool.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa, clasificacion, cuenta_bancaria, tipo_cuenta, codigo_banco)
       VALUES ('IESS','06${sello % 1e8}','AUDIT TEST ${sello}','ADMINISTRACION','BOPELUAL S.A.','ADMINISTRATIVO','2205467800','AHORRO','10')
       RETURNING id`
    );
    await pool.query(`INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,123.45)`, [per[0].id, c[0].id]);

    const res = await auth(
      request(app).get(`/api/periodos/${per[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO`)
    );
    expect(res.status).toBe(200);
    expect(res.body.incluidos).toBe(1);

    const { rows: descargas } = await pool.query(
      `SELECT * FROM txt_descargas WHERE periodo_id=$1`, [per[0].id]
    );
    expect(descargas).toHaveLength(1);
    expect(descargas[0].usuario_id).toBe(usr[0].id);
    expect(descargas[0].transferencias_count).toBe(1);
    expect(Number(descargas[0].total)).toBe(123.45);
    expect(descargas[0].filtros).toEqual({ empresa: null, tipo: 'IESS', clasificacion: 'ADMINISTRATIVO', quincena: null });
  });

  it('período padre (MES): sin quincena junta ambas hijas, con ?quincena= acota a una sola, 404 si no existe', async () => {
    const app = createApp();
    const sello = Date.now();
    const { rows: padre } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado)
       VALUES ('Mes TXT ${sello}','2026-12-01','2026-12-31','AMBAS','MES','BORRADOR') RETURNING id`
    );
    const { rows: q1 } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado, mes_periodo_id)
       VALUES ('Mes TXT ${sello} Q1','2026-12-01','2026-12-15','1','QUINCENA','BORRADOR',$1) RETURNING id`,
      [padre[0].id]
    );
    const { rows: q2 } = await pool.query(
      `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado, mes_periodo_id)
       VALUES ('Mes TXT ${sello} Q2','2026-12-16','2026-12-31','2','QUINCENA','BORRADOR',$1) RETURNING id`,
      [padre[0].id]
    );
    const crearColEnQuincena = async (periodoId, cedulaPrefijo) => {
      const { rows: c } = await pool.query(
        `INSERT INTO colaboradores (tipo, cedula, nombre, departamento, empresa, clasificacion, cuenta_bancaria, tipo_cuenta, codigo_banco)
         VALUES ('IESS',$1,$2,'ADMINISTRACION','BOPELUAL S.A.','ADMINISTRATIVO','2205467800','AHORRO','10') RETURNING id`,
        [`${cedulaPrefijo}${sello % 1e8}`, `MES COL ${cedulaPrefijo} ${sello}`]
      );
      await pool.query(`INSERT INTO roles_pago (periodo_id, colaborador_id, neto) VALUES ($1,$2,50)`, [periodoId, c[0].id]);
    };
    await crearColEnQuincena(q1[0].id, '07');
    await crearColEnQuincena(q2[0].id, '08');

    // Sin ?quincena=: junta ambas hijas
    const ambas = await auth(
      request(app).get(`/api/periodos/${padre[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO`)
    );
    expect(ambas.status).toBe(200);
    expect(ambas.body.incluidos).toBe(2);

    // Con ?quincena=1: solo la hija Q1
    const soloQ1 = await auth(
      request(app).get(`/api/periodos/${padre[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO&quincena=1`)
    );
    expect(soloQ1.status).toBe(200);
    expect(soloQ1.body.incluidos).toBe(1);

    // Con ?quincena=2: solo la hija Q2
    const soloQ2 = await auth(
      request(app).get(`/api/periodos/${padre[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO&quincena=2`)
    );
    expect(soloQ2.status).toBe(200);
    expect(soloQ2.body.incluidos).toBe(1);

    // Quincena inexistente para este mes -> 404
    const noExiste = await auth(
      request(app).get(`/api/periodos/${padre[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO&quincena=3`)
    );
    expect(noExiste.status).toBe(404);

    // En una QUINCENA (no MES), ?quincena= se ignora — el id ya es una sola quincena.
    const enHijaConQuinceIgnorado = await auth(
      request(app).get(`/api/periodos/${q1[0].id}/txt-pago?tipo=IESS&clasificacion=ADMINISTRATIVO&quincena=2`)
    );
    expect(enHijaConQuinceIgnorado.status).toBe(200);
    expect(enHijaConQuinceIgnorado.body.incluidos).toBe(1); // el colaborador de Q1, no el de Q2
  });
});
