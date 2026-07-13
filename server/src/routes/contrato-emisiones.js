import { Router } from 'express';
import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { subirArchivo, descargarArchivo } from '../lib/storage.js';
import { generarContratoProductivoDocx } from '../lib/contrato-productivo-docx.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const GESTORES = ['ADMIN', 'RRHH'];
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

async function cargarContrato(colaboradorId, contratoId) {
  const { rows } = await pool.query(
    `SELECT c.*, col.nombre, col.cedula, col.cargo, col.empresa, col.sexo
     FROM contratos c JOIN colaboradores col ON col.id = c.colaborador_id
     WHERE c.id=$1 AND c.colaborador_id=$2`,
    [contratoId, colaboradorId]
  );
  return rows[0];
}

router.post('/', requireRole(GESTORES), async (req, res) => {
  const { colaboradorId, contratoId } = req.params;
  const {
    funciones, remuneracion_letras, horas_semanales, horas_diarias,
    dias_descanso, duracion_texto, periodo_prueba_texto,
  } = req.body;
  if (!funciones || !remuneracion_letras || !horas_semanales || !horas_diarias ||
      !dias_descanso || !duracion_texto || !periodo_prueba_texto) {
    return res.status(400).json({ error: 'todos los campos de la emisión son requeridos' });
  }

  const contrato = await cargarContrato(colaboradorId, contratoId);
  if (!contrato) return res.status(404).json({ error: 'contrato no encontrado' });
  if (contrato.tipo_contrato !== 'PRODUCTIVO') {
    return res.status(400).json({ error: 'solo se puede emitir el tipo de contrato PRODUCTIVO' });
  }
  if (!contrato.empresa) {
    return res.status(400).json({ error: 'el colaborador no tiene empresa asignada' });
  }

  const { rows: empresaRows } = await pool.query('SELECT * FROM config_empresas WHERE empresa=$1', [contrato.empresa]);
  const empresa = empresaRows[0];
  if (!empresa?.ruc || !empresa?.representante_legal || !empresa?.cedula_representante) {
    return res.status(400).json({ error: `faltan datos legales de ${contrato.empresa} en config_empresas` });
  }

  const colaborador = { nombre: contrato.nombre, cedula: contrato.cedula, cargo: contrato.cargo, sexo: contrato.sexo };
  const emision = { funciones, remuneracion_letras, horas_semanales, horas_diarias, dias_descanso, duracion_texto, periodo_prueba_texto };
  const buffer = await generarContratoProductivoDocx({ empresa, colaborador, contrato, emision });
  const key = `contratos/${contratoId}/generado-${Date.now()}.docx`;
  await subirArchivo(key, buffer, DOCX_MIME);

  const { rows } = await pool.query(
    `INSERT INTO contrato_emisiones
       (contrato_id, funciones, remuneracion_letras, horas_semanales, horas_diarias,
        dias_descanso, duracion_texto, periodo_prueba_texto, archivo_generado_key, generado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [contratoId, funciones, remuneracion_letras, horas_semanales, horas_diarias,
     dias_descanso, duracion_texto, periodo_prueba_texto, key, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.get('/:emisionId/generado', requireRole(GESTORES), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT archivo_generado_key FROM contrato_emisiones WHERE id=$1 AND contrato_id=$2',
    [req.params.emisionId, req.params.contratoId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_generado_key);
  res.set('Content-Type', DOCX_MIME);
  res.set('Content-Disposition', 'attachment; filename="contrato-productivo.docx"');
  res.send(buffer);
});

router.post(
  '/:emisionId/firmado',
  requireRole(GESTORES),
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res) => {
    if (!req.body?.length) return res.status(400).json({ error: 'archivo requerido' });
    const { rows } = await pool.query(
      'SELECT id FROM contrato_emisiones WHERE id=$1 AND contrato_id=$2',
      [req.params.emisionId, req.params.contratoId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const mime = req.headers['content-type'] ?? 'application/octet-stream';
    const key = `contratos/${req.params.contratoId}/firmado-${Date.now()}`;
    await subirArchivo(key, req.body, mime);
    const { rows: actualizado } = await pool.query(
      `UPDATE contrato_emisiones SET archivo_firmado_key=$1, archivo_firmado_mime=$2, firmado_en=now(), firmado_por=$3
       WHERE id=$4 RETURNING *`,
      [key, mime, req.usuario.id, req.params.emisionId]
    );
    res.json(actualizado[0]);
  }
);

router.get('/:emisionId/firmado', requireRole(GESTORES), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT archivo_firmado_key, archivo_firmado_mime FROM contrato_emisiones WHERE id=$1 AND contrato_id=$2',
    [req.params.emisionId, req.params.contratoId]
  );
  if (rows.length === 0 || !rows[0].archivo_firmado_key) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_firmado_key);
  const extension = EXTENSIONES[rows[0].archivo_firmado_mime] || 'bin';
  res.set('Content-Type', rows[0].archivo_firmado_mime || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="firmado.${extension}"`);
  res.send(buffer);
});

export default router;
