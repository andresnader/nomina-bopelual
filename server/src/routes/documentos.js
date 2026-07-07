import { Router } from 'express';
import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';

// Documentos del colaborador guardados en Postgres (bytea): Railway no tiene
// disco persistente y el volumen es bajo (~30 personas). Máximo 5 MB.
const router = Router({ mergeParams: true });
router.use(requireAuth);

const GESTORES = ['ADMIN', 'RRHH'];
const TIPOS = ['CONTRATO', 'CEDULA', 'CERTIFICADO', 'OTRO'];

router.get(
  '/',
  requireSelfOrRole(GESTORES, (req) => req.params.colaboradorId),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id, nombre, tipo, mime, octet_length(archivo) AS bytes, creado_en
       FROM documentos WHERE colaborador_id=$1 ORDER BY creado_en DESC`,
      [req.params.colaboradorId]
    );
    res.json(rows);
  }
);

// Subida binaria directa (sin multipart): el frontend manda el archivo como
// body crudo con ?nombre=...&tipo=... — evita agregar multer.
router.post(
  '/',
  requireRole(GESTORES),
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res) => {
    const { nombre, tipo = 'OTRO' } = req.query;
    if (!nombre || !req.body?.length) return res.status(400).json({ error: 'nombre y archivo requeridos' });
    if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'tipo inválido' });
    const { rows } = await pool.query(
      `INSERT INTO documentos (colaborador_id, nombre, tipo, mime, archivo, subido_por)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, nombre, tipo, mime, creado_en`,
      [req.params.colaboradorId, nombre, tipo, req.headers['content-type'] ?? 'application/octet-stream', req.body, req.usuario.id]
    );
    res.status(201).json(rows[0]);
  }
);

router.get(
  '/:docId',
  requireSelfOrRole(GESTORES, (req) => req.params.colaboradorId),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT nombre, mime, archivo FROM documentos WHERE id=$1 AND colaborador_id=$2`,
      [req.params.docId, req.params.colaboradorId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    res.set('Content-Type', rows[0].mime);
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(rows[0].nombre)}"`);
    res.send(rows[0].archivo);
  }
);

router.delete('/:docId', requireRole(GESTORES), async (req, res) => {
  await pool.query('DELETE FROM documentos WHERE id=$1 AND colaborador_id=$2', [
    req.params.docId,
    req.params.colaboradorId,
  ]);
  res.json({ ok: true });
});

export default router;
