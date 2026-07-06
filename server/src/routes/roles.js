import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';
import { puedeEditarLineas } from '../lib/periodo-fsm.js';
import { recalcularTotales } from '../services/roles.js';

const router = Router();
router.use(requireAuth);

async function colaboradorDelRol(req) {
  const { rows } = await pool.query('SELECT colaborador_id FROM roles_pago WHERE id=$1', [req.params.id]);
  return rows[0]?.colaborador_id;
}

router.get(
  '/:id',
  requireSelfOrRole(['ADMIN', 'RRHH', 'GERENCIA'], colaboradorDelRol),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT rp.*, c.nombre AS colaborador_nombre, c.cedula, c.cargo,
              p.nombre AS periodo_nombre, p.estado AS periodo_estado
       FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
       JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1`,
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const { rows: lineas } = await pool.query(
      'SELECT * FROM lineas_rol WHERE rol_pago_id=$1 ORDER BY clase, creado_en',
      [req.params.id]
    );
    res.json({ ...rows[0], lineas });
  }
);

async function estadoPeriodoDelRol(rolId) {
  const { rows } = await pool.query(
    `SELECT p.estado FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1`,
    [rolId]
  );
  return rows[0]?.estado;
}

router.post('/:id/lineas', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const estado = await estadoPeriodoDelRol(req.params.id);
  if (!estado) return res.status(404).json({ error: 'rol no encontrado' });
  if (!puedeEditarLineas(estado)) return res.status(409).json({ error: `período ${estado}: no editable` });
  const { tipo_linea, clase, monto, descripcion, es_provision } = req.body;
  if (!tipo_linea || !clase || monto == null) return res.status(400).json({ error: 'campos requeridos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, tipo_linea, clase, monto, descripcion ?? null, es_provision ?? false]
    );
    const totales = await recalcularTotales(client, req.params.id);
    await client.query('COMMIT');
    res.status(201).json(totales);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.delete('/:rolId/lineas/:lineaId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const estado = await estadoPeriodoDelRol(req.params.rolId);
  if (!puedeEditarLineas(estado)) return res.status(409).json({ error: `período ${estado}: no editable` });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lineas_rol WHERE id=$1 AND rol_pago_id=$2', [
      req.params.lineaId,
      req.params.rolId
    ]);
    const totales = await recalcularTotales(client, req.params.rolId);
    await client.query('COMMIT');
    res.json(totales);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

export default router;
