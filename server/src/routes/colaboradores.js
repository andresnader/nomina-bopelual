import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';
import { esTipoContratoValido } from '../lib/tipos-contrato.js';

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
  const { tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso } = req.body;
  if (!tipo || !nombre) return res.status(400).json({ error: 'tipo y nombre requeridos' });
  const { rows } = await pool.query(
    `INSERT INTO colaboradores (tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso]
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
        `SELECT rp.*, p.nombre AS periodo_nombre, p.fecha_fin AS periodo_fecha
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
    'empresa', 'centro_costo', 'cargas_personales', 'forma_pago',
    'banco', 'codigo_banco', 'tipo_cuenta', 'cuenta_bancaria', 'pct_anticipo',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'direccion'
  ];
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
  const { sueldo_base, fecha_inicio, notas, tipo_contrato } = req.body;
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
      `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, notas, tipo_contrato)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, sueldo_base, fecha_inicio, notas, tipo_contrato ?? null]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
