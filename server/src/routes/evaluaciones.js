import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

router.get(
  '/',
  requireSelfOrRole(['ADMIN', 'RRHH', 'GERENCIA'], (req) => req.params.colaboradorId),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.*, u.email AS evaluador_email
       FROM evaluaciones e LEFT JOIN usuarios u ON u.id=e.evaluador_id
       WHERE e.colaborador_id=$1 ORDER BY e.fecha DESC`,
      [req.params.colaboradorId]
    );
    res.json(rows);
  }
);

router.post('/', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (req, res) => {
  const { fecha, calificacion, fortalezas, oportunidades } = req.body;
  if (!calificacion) return res.status(400).json({ error: 'calificacion requerida' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO evaluaciones (colaborador_id, fecha, calificacion, fortalezas, oportunidades, evaluador_id)
       VALUES ($1, COALESCE($2, CURRENT_DATE), $3, $4, $5, $6) RETURNING *`,
      [req.params.colaboradorId, fecha ?? null, calificacion, fortalezas ?? null, oportunidades ?? null, req.usuario.id]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/:evalId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  await pool.query('DELETE FROM evaluaciones WHERE id=$1 AND colaborador_id=$2', [
    req.params.evalId,
    req.params.colaboradorId,
  ]);
  res.json({ ok: true });
});

export default router;
