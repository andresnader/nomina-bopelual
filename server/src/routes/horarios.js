import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM horarios WHERE activo=true ORDER BY codigo');
  res.json(rows);
});

router.get('/todos', requireRole(['ADMIN']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM horarios ORDER BY codigo');
  res.json(rows);
});

router.patch('/:codigo', requireRole(['ADMIN']), async (req, res) => {
  const campos = [
    'nombre', 'hora_entrada_semana', 'hora_salida_semana',
    'hora_entrada_sabado', 'hora_salida_sabado',
    'horas_jornada_semana', 'horas_jornada_sabado', 'activo',
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
  params.push(req.params.codigo);
  const { rows } = await pool.query(
    `UPDATE horarios SET ${set.join(', ')} WHERE codigo=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

export default router;
