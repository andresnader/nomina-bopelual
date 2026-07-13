import { Router } from 'express';
import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { subirArchivo, descargarArchivo } from '../lib/storage.js';
import { generarAcuerdoConfidencialidadDocx } from '../lib/acuerdo-confidencialidad-docx.js';
import { generarConsentimientoExpresoDocx } from '../lib/consentimiento-expreso-docx.js';
import { generarConsentimientoBiometricoDocx } from '../lib/consentimiento-biometrico-docx.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'RRHH']));

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

const TABLAS = {
  confidencialidad: {
    tabla: 'colaborador_confidencialidad',
    generar: generarAcuerdoConfidencialidadDocx,
    campos: ['cargo'],
    filename: 'acuerdo-confidencialidad',
  },
  consentimiento_expreso: {
    tabla: 'colaborador_consentimiento_expreso',
    generar: generarConsentimientoExpresoDocx,
    campos: ['cargo'],
    filename: 'consentimiento-expreso',
  },
  consentimiento_biometrico: {
    tabla: 'colaborador_consentimiento_biometrico',
    generar: generarConsentimientoBiometricoDocx,
    campos: [],
    filename: 'consentimiento-biometrico',
  },
};

const FORMATOS_FECHA = { confidencialidad: true, consentimiento_expreso: false, consentimiento_biometrico: true };

router.post('/:tipo', async (req, res) => {
  const { colaboradorId, tipo } = req.params;
  const config = TABLAS[tipo];
  if (!config) return res.status(400).json({ error: `tipo de documento no válido: ${tipo}` });

  for (const campo of config.campos) {
    if (!req.body[campo]) return res.status(400).json({ error: `campo requerido: ${campo}` });
  }

  const { rows: colRows } = await pool.query(
    'SELECT id, nombre, cedula, cargo, empresa, sexo FROM colaboradores WHERE id=$1',
    [colaboradorId]
  );
  if (colRows.length === 0) return res.status(404).json({ error: 'colaborador no encontrado' });
  const colaborador = colRows[0];
  if (!colaborador.empresa) return res.status(400).json({ error: 'el colaborador no tiene empresa asignada' });

  const { rows: empRows } = await pool.query('SELECT * FROM config_empresas WHERE empresa=$1', [colaborador.empresa]);
  const empresa = empRows[0];
  if (!empresa) return res.status(400).json({ error: `empresa ${colaborador.empresa} no encontrada en config_empresas` });

  const emision = {
    ...FORMATOS_FECHA[tipo] ? { fecha_celebracion: new Date().toISOString() } : {},
    ...req.body,
  };

  const buffer = await config.generar({ empresa, colaborador, emision });
  const key = `${tipo}/${colaboradorId}/generado-${Date.now()}.docx`;
  await subirArchivo(key, buffer, DOCX_MIME);

  const cols = ['colaborador_id', 'archivo_generado_key', 'generado_por', ...config.campos];
  const vals = [colaboradorId, key, req.usuario.id, ...config.campos.map(c => req.body[c])];
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO ${config.tabla} (${cols.join(', ')}) VALUES (${ph}) RETURNING *`,
    vals
  );
  res.status(201).json(rows[0]);
});

router.get('/:tipo', async (req, res) => {
  const { colaboradorId, tipo } = req.params;
  const config = TABLAS[tipo];
  if (!config) return res.status(400).json({ error: `tipo no válido: ${tipo}` });

  const { rows } = await pool.query(
    `SELECT * FROM ${config.tabla} WHERE colaborador_id=$1 ORDER BY generado_en DESC`,
    [colaboradorId]
  );
  res.json(rows);
});

router.get('/:tipo/:emisionId/generado', async (req, res) => {
  const { colaboradorId, tipo, emisionId } = req.params;
  const config = TABLAS[tipo];
  if (!config) return res.status(400).json({ error: `tipo no válido: ${tipo}` });

  const { rows } = await pool.query(
    `SELECT archivo_generado_key FROM ${config.tabla} WHERE id=$1 AND colaborador_id=$2`,
    [emisionId, colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_generado_key);
  res.set('Content-Type', DOCX_MIME);
  res.set('Content-Disposition', `attachment; filename="${config.filename}.docx"`);
  res.send(buffer);
});

router.post('/:tipo/:emisionId/firmado', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const { colaboradorId, tipo, emisionId } = req.params;
  const config = TABLAS[tipo];
  if (!config) return res.status(400).json({ error: `tipo no válido: ${tipo}` });
  if (!req.body?.length) return res.status(400).json({ error: 'archivo requerido' });

  const { rows } = await pool.query(
    `SELECT id FROM ${config.tabla} WHERE id=$1 AND colaborador_id=$2`,
    [emisionId, colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });

  const mime = req.headers['content-type'] ?? 'application/octet-stream';
  const key = `${tipo}/${colaboradorId}/firmado-${Date.now()}`;
  await subirArchivo(key, req.body, mime);

  const { rows: actualizado } = await pool.query(
    `UPDATE ${config.tabla} SET archivo_firmado_key=$1, archivo_firmado_mime=$2, firmado_en=now(), firmado_por=$3
     WHERE id=$4 RETURNING *`,
    [key, mime, req.usuario.id, emisionId]
  );
  res.json(actualizado[0]);
});

router.get('/:tipo/:emisionId/firmado', async (req, res) => {
  const { colaboradorId, tipo, emisionId } = req.params;
  const config = TABLAS[tipo];
  if (!config) return res.status(400).json({ error: `tipo no válido: ${tipo}` });

  const { rows } = await pool.query(
    `SELECT archivo_firmado_key, archivo_firmado_mime FROM ${config.tabla} WHERE id=$1 AND colaborador_id=$2`,
    [emisionId, colaboradorId]
  );
  if (rows.length === 0 || !rows[0].archivo_firmado_key) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_firmado_key);
  const extension = EXTENSIONES[rows[0].archivo_firmado_mime] || 'bin';
  res.set('Content-Type', rows[0].archivo_firmado_mime || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${config.filename}-firmado.${extension}"`);
  res.send(buffer);
});

export default router;
