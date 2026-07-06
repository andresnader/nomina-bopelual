import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo, activo } = req.query;
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
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM colaboradores ${where} ORDER BY nombre`, params);
  res.json(rows);
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
    const [contratos, rolesPago, prestamos] = await Promise.all([
      pool.query('SELECT * FROM contratos WHERE colaborador_id=$1 ORDER BY fecha_inicio DESC', [req.params.id]),
      pool.query('SELECT * FROM roles_pago WHERE colaborador_id=$1', [req.params.id]),
      pool.query('SELECT * FROM prestamos WHERE colaborador_id=$1', [req.params.id])
    ]);
    res.json({
      ...rows[0],
      contratos: contratos.rows,
      roles_pago: rolesPago.rows,
      prestamos: prestamos.rows
    });
  }
);

router.patch('/:id', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = ['nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula'];
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
  const { rows } = await pool.query(
    `UPDATE colaboradores SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

// Nuevo contrato: cierra el contrato activo previo y crea el nuevo (historial de sueldos).
router.post('/:id/contratos', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { sueldo_base, fecha_inicio, notas } = req.body;
  if (!sueldo_base || !fecha_inicio) {
    return res.status(400).json({ error: 'sueldo_base y fecha_inicio requeridos' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE contratos SET fecha_fin=$1 WHERE colaborador_id=$2 AND fecha_fin IS NULL`,
      [fecha_inicio, req.params.id]
    );
    const { rows } = await client.query(
      `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, notas)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [req.params.id, sueldo_base, fecha_inicio, notas]
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
