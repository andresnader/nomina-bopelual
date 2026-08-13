import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';
import { esTipoContratoValido } from '../lib/tipos-contrato.js';
import { agregarColaboradorAPeriodosBorrador, reconciliarColaboradorEnPeriodosBorrador } from '../services/periodos.js';
import { crearVinculo, listarVinculos, editarVinculo, borrarVinculo, sincronizarFechasDerivadas } from '../services/empleo.js';

const router = Router();
router.use(requireAuth);

const SORT_VALIDO = ['nombre', 'tipo', 'departamento', 'empresa', 'fecha_ingreso', 'cedula', 'cargo', 'email'];

router.get('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo, activo, q, sort, order, page, per_page } = req.query;
  const cond = [];
  const params = [];

  if (tipo) {
    params.push(tipo);
    cond.push(`tipo=$${params.length}`);
  }
  if (activo !== undefined) {
    params.push(activo === 'true');
    cond.push(`activo=$${params.length}`);
  }
  if (q) {
    const like = `%${q}%`;
    params.push(like, like, like, like);
    const idx = params.length - 3;
    cond.push(`(nombre ILIKE $${idx} OR cedula ILIKE $${idx + 1} OR departamento ILIKE $${idx + 2} OR email ILIKE $${idx + 3})`);
  }

  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const colSort = SORT_VALIDO.includes(sort) ? sort : 'nombre';
  const dir = order === 'desc' ? 'DESC' : 'ASC';

  const { rows: [{ count }] } = await pool.query(
    `SELECT count(*)::int AS count FROM colaboradores ${where}`, params
  );

  if (per_page === 'all') {
    const { rows } = await pool.query(
      `SELECT * FROM colaboradores ${where} ORDER BY ${colSort} ${dir}`, params
    );
    return res.json({ data: rows, total: count, page: 1, per_page: count });
  }

  const limite = Math.min(Math.max(parseInt(per_page) || 25, 1), 100);
  const pag = Math.max(parseInt(page) || 1, 1);
  const offset = (pag - 1) * limite;

  const { rows } = await pool.query(
    `SELECT * FROM colaboradores ${where} ORDER BY ${colSort} ${dir} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limite, offset]
  );
  res.json({ data: rows, total: count, page: pag, per_page: limite });
});

router.post('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso, fecha_salida, clasificacion,
    sueldo_base, bono } = req.body;
  if (!tipo || !nombre) return res.status(400).json({ error: 'tipo y nombre requeridos' });
  if (clasificacion && !['COMERCIAL', 'ADMINISTRATIVO'].includes(clasificacion)) {
    return res.status(400).json({ error: `clasificacion inválida: ${clasificacion}` });
  }
  // El sueldo es opcional, pero si viene tiene que ser un número: un texto
  // llegaría hasta el INSERT y reventaría a mitad de la transacción.
  const traeSueldo = sueldo_base !== undefined && sueldo_base !== null && sueldo_base !== '';
  if (traeSueldo && !Number.isFinite(Number(sueldo_base))) {
    return res.status(400).json({ error: `sueldo_base inválido: ${sueldo_base}` });
  }
  if (bono !== undefined && bono !== null && bono !== '' && !Number.isFinite(Number(bono))) {
    return res.status(400).json({ error: `bono inválido: ${bono}` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `INSERT INTO colaboradores (tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso, fecha_salida, clasificacion)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'ADMINISTRATIVO')) RETURNING *`,
      [tipo, cedula, nombre.toUpperCase(), email, departamento, cargo, fecha_ingreso ?? null, fecha_salida ?? null, clasificacion || null]
    );
    // Vínculo de empresa inicial (fuente de verdad de las fechas de la nómina).
    const hoy = new Date().toISOString().slice(0, 10);
    await crearVinculo(client, rows[0].id, {
      fecha_entrada: fecha_ingreso ?? hoy,
      fecha_salida: fecha_salida ?? null,
    });
    // El sueldo vive en `contratos`, y generarRoles exige uno vigente
    // (fecha_fin IS NULL) para que el colaborador entre al período. Crearlo
    // acá evita el segundo paso manual por la ficha, que era donde se perdía.
    if (traeSueldo) {
      await client.query(
        `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, bono)
         VALUES ($1,$2,$3,$4)`,
        [rows[0].id, Number(sueldo_base), fecha_ingreso ?? hoy, Number(bono ?? 0)]
      );
    }
    await client.query('COMMIT');
    // Sin fecha de ingreso el vínculo arranca hoy, y generarRoles solo incluye
    // a quien tenga fecha_entrada <= fecha_fin del período: el colaborador
    // queda fuera de toda quincena ya transcurrida, sin señal visible. Se
    // conserva el default (no romper cargas existentes) pero se avisa.
    const advertencias = [];
    if (!fecha_ingreso) {
      advertencias.push(
        `Se asumió ${hoy} como fecha de ingreso. No entrará en quincenas anteriores a esa fecha; ` +
        `corrígela en su ficha si ingresó antes.`
      );
    }
    // Mismo criterio para el sueldo: sin contrato vigente no entra a NINGUNA
    // quincena (generarRoles lo descarta con un JOIN interno, sin dejar rastro).
    if (!traeSueldo) {
      advertencias.push(
        `Sin sueldo cargado no entrará en ninguna quincena. Agregale un contrato ` +
        `desde su ficha, pestaña Contratos.`
      );
    }
    res.status(201).json({ ...rows[0], advertencias });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get(
  '/:id',
  requireSelfOrRole(['ADMIN', 'RRHH'], (req) => req.params.id),
  async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM colaboradores WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const [contratos, rolesPago, prestamos, emisiones] = await Promise.all([
      pool.query('SELECT * FROM contratos WHERE colaborador_id=$1 ORDER BY fecha_inicio DESC', [req.params.id]),
      pool.query(
        `SELECT rp.*, p.nombre AS periodo_nombre, p.fecha_fin AS periodo_fecha, p.estado AS periodo_estado
         FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
         WHERE rp.colaborador_id=$1 ORDER BY p.fecha_inicio DESC`,
        [req.params.id]
      ),
      pool.query('SELECT * FROM prestamos WHERE colaborador_id=$1', [req.params.id]),
      // Une las 3 tablas de emisiones de contrato (productivo + las 2 avanzadas de
      // 015_documentos_emitidos.sql) para que el badge Generado/Firmado en el UI
      // funcione sin importar el tipo_contrato.
      pool.query(
        `SELECT id, contrato_id, archivo_generado_key, archivo_firmado_key, generado_en
         FROM contrato_emisiones ce
         WHERE EXISTS (SELECT 1 FROM contratos c WHERE c.id = ce.contrato_id AND c.colaborador_id=$1)
         UNION ALL
         SELECT id, contrato_id, archivo_generado_key, archivo_firmado_key, generado_en
         FROM contrato_comisionista_emisiones cce
         WHERE EXISTS (SELECT 1 FROM contratos c WHERE c.id = cce.contrato_id AND c.colaborador_id=$1)
         UNION ALL
         SELECT id, contrato_id, archivo_generado_key, archivo_firmado_key, generado_en
         FROM contrato_servicios_profesionales_emisiones csp
         WHERE EXISTS (SELECT 1 FROM contratos c WHERE c.id = csp.contrato_id AND c.colaborador_id=$1)
         ORDER BY generado_en DESC`,
        [req.params.id]
      )
    ]);
    res.json({
      ...rows[0],
      contratos: contratos.rows.map((c) => ({
        ...c,
        emisiones: emisiones.rows.filter((e) => e.contrato_id === c.id)
      })),
      roles_pago: rolesPago.rows,
      prestamos: prestamos.rows
    });
  }
);

// Traduce un cambio de fecha_ingreso/fecha_salida (API legada de la ficha) a los
// vínculos de empresa: ingreso => entrada del vínculo más antiguo; salida =>
// salida del más reciente. El historial completo se edita por /empleo-periodos.
async function aplicarFechasEmpleo(client, colId, body) {
  const vinculos = await listarVinculos(client, colId); // orden por fecha_entrada asc
  if (vinculos.length === 0) {
    await crearVinculo(client, colId, {
      fecha_entrada: body.fecha_ingreso ?? new Date().toISOString().slice(0, 10),
      fecha_salida: 'fecha_salida' in body ? body.fecha_salida : null,
    });
    return;
  }
  if ('fecha_ingreso' in body && body.fecha_ingreso) {
    const primero = vinculos[0];
    await editarVinculo(client, primero.id, { fecha_entrada: body.fecha_ingreso, fecha_salida: primero.fecha_salida });
  }
  if ('fecha_salida' in body) {
    const ultimo = vinculos[vinculos.length - 1];
    await editarVinculo(client, ultimo.id, { fecha_entrada: ultimo.fecha_entrada, fecha_salida: body.fecha_salida });
  }
}

router.patch('/:id', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  // fecha_ingreso/fecha_salida NO se escriben directo: son columnas derivadas
  // que gobiernan los vínculos de empresa (se sincronizan aparte).
  const campos = [
    'nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula', 'tipo',
    'empresa', 'centro_costo', 'cargas_personales', 'forma_pago', 'clasificacion',
    'banco', 'codigo_banco', 'tipo_cuenta', 'cuenta_bancaria', 'pct_anticipo',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'direccion', 'horario',
    'acumular_decimos', 'acumular_fondos_reserva', 'extension_conyugal'
  ];
  if ('nombre' in req.body && req.body.nombre) req.body.nombre = req.body.nombre.toUpperCase();
  // `tipo` decide el porcentaje de la quincena, si se prorratea y si le tocan
  // las líneas de ley: un valor fuera del catálogo rompería todo el cálculo.
  if ('tipo' in req.body && !['IESS', 'EXTERNO'].includes(req.body.tipo)) {
    return res.status(400).json({ error: `tipo inválido: ${req.body.tipo}` });
  }
  const tocaFechas = ['fecha_ingreso', 'fecha_salida'].some((c) => c in req.body);
  const set = [], params = [];
  for (const c of campos) {
    if (c in req.body) { params.push(req.body[c]); set.push(`${c}=$${params.length}`); }
  }
  if (!tocaFechas && set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tocaFechas) await aplicarFechasEmpleo(client, req.params.id, req.body);
    if (set.length > 0) {
      params.push(req.params.id);
      const upd = await client.query(
        `UPDATE colaboradores SET ${set.join(', ')} WHERE id=$${params.length} RETURNING id`, params);
      if (upd.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'no encontrado' }); }
    }
    if (tocaFechas) {
      await sincronizarFechasDerivadas(client, req.params.id);
    }
    // `tipo` y `pct_anticipo` cambian el monto de las líneas igual que las
    // fechas: sin reconciliar, la ficha muestra el valor nuevo y la quincena
    // en BORRADOR se queda con el cálculo viejo.
    if (tocaFechas || 'tipo' in req.body || 'pct_anticipo' in req.body) {
      await reconciliarColaboradorEnPeriodosBorrador(client, req.params.id);
    }
    const { rows } = await client.query('SELECT * FROM colaboradores WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── Vínculos de empresa (historial de entradas/salidas) ────────────────────
router.get('/:id/empleo-periodos', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const vinculos = await listarVinculos(pool, req.params.id);
  res.json(vinculos);
});

// Aplica un cambio de vínculos y luego sincroniza las fechas derivadas y
// reconcilia los períodos en borrador, todo en la misma transacción.
async function conVinculos(req, res, mut) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await mut(client);
    await sincronizarFechasDerivadas(client, req.params.id);
    await reconciliarColaboradorEnPeriodosBorrador(client, req.params.id);
    await client.query('COMMIT');
    return resultado;
  } catch (e) {
    await client.query('ROLLBACK');
    const msg = e.constraint === 'empleo_periodos_check'
      ? 'La fecha de salida no puede ser anterior a la fecha de entrada.'
      : e.message;
    res.status(400).json({ error: msg });
    return null;
  } finally {
    client.release();
  }
}

router.post('/:id/empleo-periodos', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { fecha_entrada, fecha_salida } = req.body;
  if (!fecha_entrada) return res.status(400).json({ error: 'fecha_entrada requerida' });
  const creado = await conVinculos(req, res, (client) =>
    crearVinculo(client, req.params.id, { fecha_entrada, fecha_salida }));
  if (creado) res.status(201).json(creado);
});

router.patch('/:id/empleo-periodos/:vinculoId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = {};
  if ('fecha_entrada' in req.body) campos.fecha_entrada = req.body.fecha_entrada;
  if ('fecha_salida' in req.body) campos.fecha_salida = req.body.fecha_salida;
  if (Object.keys(campos).length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  const ok = await conVinculos(req, res, (client) => editarVinculo(client, req.params.vinculoId, campos));
  if (ok !== null) res.json({ ok: true });
});

router.delete('/:id/empleo-periodos/:vinculoId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const ok = await conVinculos(req, res, (client) => borrarVinculo(client, req.params.vinculoId));
  if (ok !== null) res.json({ ok: true });
});

// Nuevo contrato: cierra el contrato activo previo y crea el nuevo (historial de sueldos).
router.post('/:id/contratos', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { sueldo_base, fecha_inicio, notas, tipo_contrato, bono } = req.body;
  if (!sueldo_base || !fecha_inicio) {
    return res.status(400).json({ error: 'sueldo_base y fecha_inicio requeridos' });
  }
  if (tipo_contrato && !(await esTipoContratoValido(tipo_contrato))) {
    return res.status(400).json({ error: `tipo_contrato desconocido: ${tipo_contrato}` });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE contratos SET fecha_fin=$1 WHERE colaborador_id=$2 AND fecha_fin IS NULL`,
      [fecha_inicio, req.params.id]
    );
    const { rows } = await client.query(
      `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, notas, tipo_contrato, bono)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, sueldo_base, fecha_inicio, notas, tipo_contrato ?? null, bono ?? 0]
    );
    // Si hay período(s) en BORRADOR, el colaborador entra de inmediato (con
    // prorrateo si ingresó a mitad de quincena); no duplica si ya tenía rol.
    const { agregados } = await agregarColaboradorAPeriodosBorrador(client, req.params.id);
    await client.query('COMMIT');
    res.status(201).json({ ...rows[0], periodos_borrador_agregado: agregados });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Eliminar un contrato (solo si no tiene roles de pago asociados).
router.delete('/:colaboradorId/contratos/:contratoId', requireRole(['ADMIN']), async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM contratos WHERE id=$1 AND colaborador_id=$2', [
    req.params.contratoId, req.params.colaboradorId
  ]);
  if (rowCount === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json({ ok: true });
});

// Editar un contrato existente (sueldo, bono, fechas, notas, tipo).
router.patch('/:colaboradorId/contratos/:contratoId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = ['sueldo_base', 'bono', 'fecha_inicio', 'fecha_fin', 'notas', 'tipo_contrato'];
  const set = [];
  const params = [];
  for (const c of campos) {
    if (c in req.body) {
      params.push(req.body[c]);
      set.push(`${c}=$${params.length}`);
    }
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  if (req.body.tipo_contrato && !(await esTipoContratoValido(req.body.tipo_contrato))) {
    return res.status(400).json({ error: `tipo_contrato desconocido: ${req.body.tipo_contrato}` });
  }
  params.push(req.params.contratoId, req.params.colaboradorId);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE contratos SET ${set.join(', ')} WHERE id=$${params.length - 1} AND colaborador_id=$${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'no encontrado' });
    }
    // Corregir el sueldo tiene que llegar a las quincenas en BORRADOR ya
    // generadas; si no, la ficha muestra el valor nuevo y el rol sigue con el
    // viejo, y hay que reescribir cada rol a mano. Crear un contrato y editar
    // la ficha del colaborador ya reconciliaban: esto faltaba.
    await reconciliarColaboradorEnPeriodosBorrador(client, req.params.colaboradorId);
    await client.query('COMMIT');
    res.json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

// ── Rubros de Ingreso Proyectados ──────────────────────────────────
const RUBROS_INGRESO_TIPOS = ['SUELDO', 'ALIMENTACION', 'TRANSPORTE', 'VIVIENDA', 'COMISIONES', 'HORAS_EXTRA', 'BONO', 'OTROS'];

// Listar rubros de ingreso de un colaborador.
router.get('/:id/rubros-ingreso', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM rubros_ingreso WHERE colaborador_id=$1 ORDER BY tipo, creado_en',
    [req.params.id]
  );
  res.json(rows);
});

// Crear rubro de ingreso.
router.post('/:id/rubros-ingreso', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo, valor_mensual, deducible, afecta_aportacion, descripcion } = req.body;
  if (!tipo || valor_mensual == null) {
    return res.status(400).json({ error: 'tipo y valor_mensual requeridos' });
  }
  if (!RUBROS_INGRESO_TIPOS.includes(tipo)) {
    return res.status(400).json({ error: `tipo desconocido: ${tipo}. Válidos: ${RUBROS_INGRESO_TIPOS.join(', ')}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO rubros_ingreso (colaborador_id, tipo, valor_mensual, deducible, afecta_aportacion, descripcion)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, tipo, valor_mensual, deducible ?? true, afecta_aportacion ?? true, descripcion ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualizar rubro de ingreso.
router.patch('/:colaboradorId/rubros-ingreso/:rubroId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = ['tipo', 'valor_mensual', 'deducible', 'afecta_aportacion', 'descripcion', 'activo'];
  const set = [];
  const params = [];
  for (const c of campos) {
    if (c in req.body) {
      params.push(req.body[c]);
      set.push(`${c}=$${params.length}`);
    }
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.rubroId, req.params.colaboradorId);
  const { rows } = await pool.query(
    `UPDATE rubros_ingreso SET ${set.join(', ')} WHERE id=$${params.length - 1} AND colaborador_id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

// Eliminar rubro de ingreso.
router.delete('/:colaboradorId/rubros-ingreso/:rubroId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM rubros_ingreso WHERE id=$1 AND colaborador_id=$2',
    [req.params.rubroId, req.params.colaboradorId]
  );
  if (rowCount === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json({ ok: true });
});

export default router;
