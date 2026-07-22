import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';
import { esTipoContratoValido } from '../lib/tipos-contrato.js';
import { agregarColaboradorAPeriodosBorrador } from '../services/periodos.js';

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
  const { tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso, clasificacion } = req.body;
  if (!tipo || !nombre) return res.status(400).json({ error: 'tipo y nombre requeridos' });
  if (clasificacion && !['COMERCIAL', 'ADMINISTRATIVO'].includes(clasificacion)) {
    return res.status(400).json({ error: `clasificacion inválida: ${clasificacion}` });
  }
  const { rows } = await pool.query(
    `INSERT INTO colaboradores (tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso, clasificacion)
     VALUES ($1,$2,$3,$4,$5,$6,$7,COALESCE($8,'ADMINISTRATIVO')) RETURNING *`,
    [tipo, cedula, nombre.toUpperCase(), email, departamento, cargo, fecha_ingreso, clasificacion || null]
  );
  res.status(201).json(rows[0]);
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

router.patch('/:id', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = [
    'nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula', 'fecha_ingreso',
    'empresa', 'centro_costo', 'cargas_personales', 'forma_pago', 'clasificacion',
    'banco', 'codigo_banco', 'tipo_cuenta', 'cuenta_bancaria', 'pct_anticipo',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'direccion', 'horario',
    'acumular_decimos', 'acumular_fondos_reserva', 'extension_conyugal'
  ];
  if ('nombre' in req.body && req.body.nombre) req.body.nombre = req.body.nombre.toUpperCase();
  const set = [];
  const params = [];
  for (const c of campos) {
    if (c in req.body) {
      params.push(req.body[c]);
      set.push(`${c}=$${params.length}`);
    }
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE colaboradores SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
  const { rows } = await pool.query(
    `UPDATE contratos SET ${set.join(', ')} WHERE id=$${params.length - 1} AND colaborador_id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
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
