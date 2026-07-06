import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/usuarios', requireRole(['ADMIN']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY email');
  res.json(rows);
});

router.post('/usuarios', requireRole(['ADMIN']), async (req, res) => {
  const { email, nombre, rol, colaborador_id } = req.body;
  if (!email || !rol) return res.status(400).json({ error: 'email y rol requeridos' });
  const { rows } = await pool.query(
    `INSERT INTO usuarios (email, nombre, rol, colaborador_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET nombre=$2, rol=$3, colaborador_id=$4, activo=true RETURNING *`,
    [email, nombre, rol, colaborador_id ?? null]
  );
  res.status(201).json(rows[0]);
});

router.patch('/usuarios/:id', requireRole(['ADMIN']), async (req, res) => {
  const campos = ['nombre', 'rol', 'activo', 'colaborador_id'];
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
    `UPDATE usuarios SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

router.get('/parametros', requireRole(['ADMIN', 'RRHH']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM parametros ORDER BY clave');
  res.json(rows);
});

router.put('/parametros/:clave', requireRole(['ADMIN']), async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO parametros (clave, valor) VALUES ($1,$2)
     ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado_en=now() RETURNING *`,
    [req.params.clave, String(req.body.valor)]
  );
  res.json(rows[0]);
});

export default router;
