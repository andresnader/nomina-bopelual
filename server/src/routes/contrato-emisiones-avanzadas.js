import { Router } from 'express';
import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { subirArchivo, descargarArchivo } from '../lib/storage.js';
import { generarContratoComisionistaDocx } from '../lib/contrato-comisionista-docx.js';
import { generarContratoServiciosProfesionalesDocx } from '../lib/contrato-servicios-profesionales-docx.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'RRHH']));

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

const CONFIG = {
  COMISIONISTA: {
    tabla: 'contrato_comisionista_emisiones',
    generar: generarContratoComisionistaDocx,
    campos: ['comision_porcentaje', 'anexo_productos', 'anexo_precios'],
    filename: 'contrato-comisionista',
  },
  SERVICIOS_PROFESIONALES: {
    tabla: 'contrato_servicios_profesionales_emisiones',
    generar: generarContratoServiciosProfesionalesDocx,
    campos: ['honorarios_letras', 'honorarios_numero', 'plazo_meses'],
    filename: 'contrato-servicios-profesionales',
  },
};

async function cargarContrato(colaboradorId, contratoId) {
  const { rows } = await pool.query(
    `SELECT c.*, col.nombre, col.cedula, col.cargo, col.empresa, col.sexo
     FROM contratos c JOIN colaboradores col ON col.id = c.colaborador_id
     WHERE c.id=$1 AND c.colaborador_id=$2`,
    [contratoId, colaboradorId]
  );
  return rows[0];
}

router.post('/', async (req, res) => {
  const { colaboradorId, contratoId } = req.params;
  const config = CONFIG[req.body.tipo_documento];
  if (!config) return res.status(400).json({ error: `tipo de contrato no soportado: ${req.body.tipo_documento}` });

  for (const campo of config.campos) {
    if (req.body[campo] === undefined || req.body[campo] === null || req.body[campo] === '') {
      return res.status(400).json({ error: `campo requerido: ${campo}` });
    }
  }

  const contrato = await cargarContrato(colaboradorId, contratoId);
  if (!contrato) return res.status(404).json({ error: 'contrato no encontrado' });
  if (contrato.tipo_contrato !== req.body.tipo_documento) {
    return res.status(400).json({ error: `el contrato es tipo ${contrato.tipo_contrato}, no ${req.body.tipo_documento}` });
  }
  if (!contrato.empresa) return res.status(400).json({ error: 'el colaborador no tiene empresa asignada' });

  const { rows: empRows } = await pool.query('SELECT * FROM config_empresas WHERE empresa=$1', [contrato.empresa]);
  const empresa = empRows[0];
  if (!empresa?.ruc || !empresa?.representante_legal || !empresa?.cedula_representante) {
    return res.status(400).json({ error: `faltan datos legales de ${contrato.empresa} en config_empresas` });
  }

  const colaborador = { nombre: contrato.nombre, cedula: contrato.cedula, cargo: contrato.cargo, sexo: contrato.sexo };
  const emision = {};
  for (const campo of config.campos) {
    emision[campo] = req.body[campo];
  }

  const buffer = await config.generar({ empresa, colaborador, contrato, emision });
  const key = `contratos/${contratoId}/${config.filename}-${Date.now()}.docx`;
  await subirArchivo(key, buffer, DOCX_MIME);

  const cols = ['contrato_id', 'archivo_generado_key', 'generado_por', ...config.campos];
  const vals = [contratoId, key, req.usuario.id, ...config.campos.map(c => req.body[c])];
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');

  const { rows } = await pool.query(
    `INSERT INTO ${config.tabla} (${cols.join(', ')}) VALUES (${ph}) RETURNING *`,
    vals
  );
  res.status(201).json(rows[0]);
});

router.get('/:tabla/:emisionId/generado', async (req, res) => {
  const { colaboradorId, contratoId, tabla: tipo, emisionId } = req.params;
  const config = Object.values(CONFIG).find(c => c.tabla === tipo);
  if (!config) return res.status(400).json({ error: 'tipo no válido' });

  const { rows } = await pool.query(
    `SELECT archivo_generado_key FROM ${config.tabla} WHERE id=$1 AND contrato_id=$2`,
    [emisionId, contratoId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_generado_key);
  res.set('Content-Type', DOCX_MIME);
  res.set('Content-Disposition', `attachment; filename="${config.filename}.docx"`);
  res.send(buffer);
});

router.post('/:tabla/:emisionId/firmado', express.raw({ type: () => true, limit: '5mb' }), async (req, res) => {
  const { contratoId, tabla: tipo, emisionId } = req.params;
  const config = Object.values(CONFIG).find(c => c.tabla === tipo);
  if (!config) return res.status(400).json({ error: 'tipo no válido' });
  if (!req.body?.length) return res.status(400).json({ error: 'archivo requerido' });

  const { rows } = await pool.query(
    `SELECT id FROM ${config.tabla} WHERE id=$1 AND contrato_id=$2`,
    [emisionId, contratoId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });

  const mime = req.headers['content-type'] ?? 'application/octet-stream';
  const key = `contratos/${contratoId}/${config.filename}-firmado-${Date.now()}`;
  await subirArchivo(key, req.body, mime);

  const { rows: actualizado } = await pool.query(
    `UPDATE ${config.tabla} SET archivo_firmado_key=$1, archivo_firmado_mime=$2, firmado_en=now(), firmado_por=$3
     WHERE id=$4 RETURNING *`,
    [key, mime, req.usuario.id, emisionId]
  );
  res.json(actualizado[0]);
});

router.get('/:tabla/:emisionId/firmado', async (req, res) => {
  const { contratoId, tabla: tipo, emisionId } = req.params;
  const config = Object.values(CONFIG).find(c => c.tabla === tipo);
  if (!config) return res.status(400).json({ error: 'tipo no válido' });

  const { rows } = await pool.query(
    `SELECT archivo_firmado_key, archivo_firmado_mime FROM ${config.tabla} WHERE id=$1 AND contrato_id=$2`,
    [emisionId, contratoId]
  );
  if (rows.length === 0 || !rows[0].archivo_firmado_key) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_firmado_key);
  const extension = EXTENSIONES[rows[0].archivo_firmado_mime] || 'bin';
  res.set('Content-Type', rows[0].archivo_firmado_mime || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="${config.filename}-firmado.${extension}"`);
  res.send(buffer);
});

export default router;
