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
  const aplicaRetencion = 'aplica_retencion' in req.body ? !!req.body.aplica_retencion : null;
  const { rows } = await pool.query(
    `INSERT INTO config_empresas (empresa, aplica_retencion, direccion, telefonos)
     VALUES ($1, COALESCE($2, false), $3, $4)
     ON CONFLICT (empresa) DO UPDATE SET
       aplica_retencion = COALESCE($2, config_empresas.aplica_retencion),
       direccion = COALESCE($3, config_empresas.direccion),
       telefonos = COALESCE($4, config_empresas.telefonos)
     RETURNING *`,
    [req.params.empresa, aplicaRetencion, req.body.direccion ?? null, req.body.telefonos ?? null]
  );
  res.json(rows[0]);
});

export default router;
