import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

router.get('/', async (req, res) => {
  const cond = req.query.activo !== undefined ? 'WHERE p.activo=$1' : '';
  const params = req.query.activo !== undefined ? [req.query.activo === 'true'] : [];
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS colaborador_nombre FROM prestamos p
     JOIN colaboradores c ON c.id=p.colaborador_id ${cond} ORDER BY p.fecha_inicio DESC`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas } = req.body;
  if (!colaborador_id || !monto_total || !cuota_quincena || !fecha_inicio) {
    return res.status(400).json({ error: 'campos requeridos' });
  }
  // saldo_pendiente arranca en monto_total (=$2).
  const { rows } = await pool.query(
    `INSERT INTO prestamos (colaborador_id, monto_total, cuota_quincena, saldo_pendiente, fecha_inicio, notas)
     VALUES ($1,$2,$3,$2,$4,$5) RETURNING *`,
    [colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const campos = ['cuota_quincena', 'activo', 'notas'];
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
    `UPDATE prestamos SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

export default router;
