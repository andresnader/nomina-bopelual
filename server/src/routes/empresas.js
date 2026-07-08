import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole(['ADMIN', 'RRHH']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM config_empresas ORDER BY empresa');
  res.json(rows);
});

router.patch('/:empresa', requireRole(['ADMIN']), async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO config_empresas (empresa, aplica_retencion) VALUES ($1,$2)
     ON CONFLICT (empresa) DO UPDATE SET aplica_retencion=$2 RETURNING *`,
    [req.params.empresa, !!req.body.aplica_retencion]
  );
  res.json(rows[0]);
});

export default router;
