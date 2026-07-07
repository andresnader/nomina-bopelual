import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';

// Dos identidades: RRHH y un colaborador vinculado
const identidad = { email: 'rrhh@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('talento humano', () => {
  let colaboradorId;

  beforeEach(async () => {
    identidad.email = 'rrhh@bopelual.com';
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH', colaborador_id=NULL`);
    const { rows } = await pool.query(
      `INSERT INTO colaboradores (tipo, nombre, cedula, fecha_ingreso)
       VALUES ('IESS', 'TH test', 'TH${Date.now() % 1e8}', '2025-07-07') RETURNING id`
    );
    colaboradorId = rows[0].id;
  });

  it('ficha: PATCH acepta datos bancarios y empresa', async () => {
    const app = createApp();
    const res = await auth(request(app).patch(`/api/colaboradores/${colaboradorId}`)).send({
      empresa: 'BOPELUAL S.A.', banco: 'BANCO PICHINCHA', codigo_banco: '10',
      tipo_cuenta: 'AHORRO', cuenta_bancaria: '9999999999', cargas_personales: 2
    });
    expect(res.status).toBe(200);
    expect(res.body.cuenta_bancaria).toBe('9999999999');
    expect(res.body.cargas_personales).toBe(2);
  });

  it('ausencias: flujo solicitar → aprobar y saldo de vacaciones', async () => {
    const app = createApp();
    const sol = await auth(request(app).post('/api/ausencias')).send({
      colaborador_id: colaboradorId, tipo: 'VACACIONES',
      fecha_desde: '2026-08-01', fecha_hasta: '2026-08-05'
    });
    expect(sol.status).toBe(201);
    expect(Number(sol.body.dias)).toBe(5);

    const ap = await auth(request(app).post(`/api/ausencias/${sol.body.id}/aprobar`));
    expect(ap.status).toBe(200);
    expect(ap.body.estado).toBe('APROBADA');

    // No se puede decidir dos veces
    const re = await auth(request(app).post(`/api/ausencias/${sol.body.id}/rechazar`));
    expect(re.status).toBe(409);

    const saldo = await auth(request(app).get(`/api/ausencias/saldo/${colaboradorId}`));
    expect(saldo.body.derecho).toBeGreaterThan(14); // ~1 año trabajado
    expect(saldo.body.tomados).toBe(5);
    expect(saldo.body.saldo).toBeCloseTo(saldo.body.derecho - 5, 1);
  });

  it('ausencias: el colaborador solo ve y solicita lo suyo', async () => {
    const app = createApp();
    await pool.query(
      `INSERT INTO usuarios (email, rol, colaborador_id) VALUES ('colab@bopelual.com','COLABORADOR',$1)
       ON CONFLICT (email) DO UPDATE SET activo=true, rol='COLABORADOR', colaborador_id=$1`,
      [colaboradorId]
    );
    identidad.email = 'colab@bopelual.com';

    const propia = await auth(request(app).post('/api/ausencias')).send({
      tipo: 'PERMISO', fecha_desde: '2026-09-01', fecha_hasta: '2026-09-01', motivo: 'trámite'
    });
    expect(propia.status).toBe(201);
    expect(propia.body.colaborador_id).toBe(colaboradorId);

    const ajena = await auth(request(app).post('/api/ausencias')).send({
      colaborador_id: '00000000-0000-0000-0000-000000000001',
      tipo: 'PERMISO', fecha_desde: '2026-09-01', fecha_hasta: '2026-09-01'
    });
    expect(ajena.status).toBe(403);

    const lista = await auth(request(app).get('/api/ausencias'));
    expect(lista.body.every((a) => a.colaborador_id === colaboradorId)).toBe(true);

    // No puede aprobar
    const aprobar = await auth(request(app).post(`/api/ausencias/${propia.body.id}/aprobar`));
    expect(aprobar.status).toBe(403);
  });

  it('documentos: subir y descargar íntegro', async () => {
    const app = createApp();
    const contenido = Buffer.from('PDF falso de prueba %%EOF');
    const up = await auth(
      request(app)
        .post(`/api/colaboradores/${colaboradorId}/documentos?nombre=contrato.pdf&tipo=CONTRATO`)
        .set('Content-Type', 'application/pdf')
        .send(contenido)
    );
    expect(up.status).toBe(201);

    const lista = await auth(request(app).get(`/api/colaboradores/${colaboradorId}/documentos`));
    expect(lista.body).toHaveLength(1);
    expect(Number(lista.body[0].bytes)).toBe(contenido.length);

    const down = await auth(
      request(app).get(`/api/colaboradores/${colaboradorId}/documentos/${up.body.id}`)
    ).buffer().parse((res, cb) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(down.status).toBe(200);
    expect(Buffer.compare(down.body, contenido)).toBe(0);
  });

  it('evaluaciones: crear y listar con validación de rango', async () => {
    const app = createApp();
    const mala = await auth(
      request(app).post(`/api/colaboradores/${colaboradorId}/evaluaciones`)
    ).send({ calificacion: 9 });
    expect(mala.status).toBe(400);

    const ok = await auth(
      request(app).post(`/api/colaboradores/${colaboradorId}/evaluaciones`)
    ).send({ calificacion: 4, fortalezas: 'Puntual', oportunidades: 'Delegar más' });
    expect(ok.status).toBe(201);

    const lista = await auth(request(app).get(`/api/colaboradores/${colaboradorId}/evaluaciones`));
    expect(lista.body).toHaveLength(1);
    expect(lista.body[0].evaluador_email).toBe('rrhh@bopelual.com');
  });
});
