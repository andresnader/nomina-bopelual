import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { crearPeriodo, generarRoles, transicionarPeriodo, sincronizarPeriodo, eliminarRol } from '../services/periodos.js';
import { generarTxtPichincha } from '../lib/txt-pichincha.js';
import { generarExcelNomina } from '../lib/excel-nomina.js';
import { round2 } from '../lib/round.js';
import { grupoDeColaborador, SQL_GRUPO } from '../lib/grupos.js';
import { gruposDePeriodo, aprobarGrupo, reabrirGrupo } from '../services/aprobaciones.js';

const router = Router();
router.use(requireAuth);

async function getParam(client, clave, fallback) {
  const { rows } = await client.query('SELECT valor FROM parametros WHERE clave=$1', [clave]);
  return rows[0]?.valor ?? fallback;
}

router.get('/', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE(SUM(rp.neto),0) AS total_neto
     FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
     GROUP BY p.id ORDER BY p.fecha_inicio DESC`
  );
  res.json(rows);
});

router.post('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { nombre, fecha_inicio, fecha_fin, quincena } = req.body;
  if (!nombre || !fecha_inicio || !fecha_fin || !quincena) {
    return res.status(400).json({ error: 'campos requeridos faltantes' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const periodo = await crearPeriodo(client, {
      nombre, fecha_inicio, fecha_fin, quincena, creado_por: req.usuario.id
    });
    const sbu = Number(await getParam(client, 'SBU', '460'));
    const pctAnticipo = Number(await getParam(client, 'PORCENTAJE_ANTICIPO', '0.40'));
    const { creados } = await generarRoles(client, periodo.id, { sbu, pctAnticipo });
    await client.query('COMMIT');
    res.status(201).json({ periodo, creados });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.get('/:id', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (req, res) => {
  const { rows: p } = await pool.query('SELECT * FROM periodos WHERE id=$1', [req.params.id]);
  if (p.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const { rows: roles } = await pool.query(
    `SELECT rp.*, c.nombre AS colaborador_nombre, c.tipo AS colaborador_tipo, c.empresa AS colaborador_empresa
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 ORDER BY c.nombre`,
    [req.params.id]
  );
  const grupos = await gruposDePeriodo(pool, req.params.id);
  res.json({ ...p[0], roles_pago: roles, grupos });
});

function accionHandler(accion) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const periodo = await transicionarPeriodo(client, req.params.id, accion, req.usuario.id);
      await client.query('COMMIT');
      res.json(periodo);
    } catch (e) {
      await client.query('ROLLBACK');
      const code = e.message.startsWith('Transición inválida') ? 409 : 500;
      res.status(code).json({ error: e.message });
    } finally {
      client.release();
    }
  };
}
router.post('/:id/aprobar', requireRole(['ADMIN', 'RRHH']), accionHandler('aprobar'));
router.post('/:id/cerrar', requireRole(['ADMIN', 'RRHH']), accionHandler('cerrar'));

const GRUPOS_VALIDOS = ['COMERCIAL', 'ADM', 'SERV_PROF'];

function accionGrupo(fn) {
  return async (req, res) => {
    const { empresa, grupo } = req.body;
    if (!empresa || !GRUPOS_VALIDOS.includes(grupo)) {
      return res.status(400).json({ error: 'empresa y grupo válido requeridos' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Solo se aprueba/reabre mientras el período está en BORRADOR.
      const { rows } = await client.query('SELECT estado FROM periodos WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'no encontrado' }); }
      if (rows[0].estado !== 'BORRADOR') { await client.query('ROLLBACK'); return res.status(409).json({ error: `período ${rows[0].estado}: no editable` }); }
      await fn(client, req.params.id, empresa, grupo, req.usuario.id);
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (e) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: e.message });
    } finally {
      client.release();
    }
  };
}

router.post('/:id/grupos/aprobar', requireRole(['ADMIN', 'RRHH']),
  accionGrupo((client, id, empresa, grupo, usuarioId) => aprobarGrupo(client, id, empresa, grupo, usuarioId)));
router.post('/:id/grupos/reabrir', requireRole(['ADMIN', 'RRHH']),
  accionGrupo((client, id, empresa, grupo) => reabrirGrupo(client, id, empresa, grupo)));

// Quita un rol de un período en BORRADOR (respaldo manual del quitado
// automático por salida). Revierte préstamos/descuentos vía eliminarRol.
router.delete('/:id/roles/:rolId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT p.estado, c.empresa, c.tipo, c.clasificacion
       FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
       JOIN colaboradores c ON c.id=rp.colaborador_id
       WHERE rp.id=$1 AND rp.periodo_id=$2 FOR UPDATE`,
      [req.params.rolId, req.params.id]
    );
    if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'rol no encontrado en este período' }); }
    if (rows[0].estado !== 'BORRADOR') { await client.query('ROLLBACK'); return res.status(409).json({ error: `período ${rows[0].estado}: no editable` }); }
    const grupo = grupoDeColaborador(rows[0].tipo, rows[0].clasificacion);
    const { rows: ag } = await client.query(
      `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND grupo=$3`,
      [req.params.id, rows[0].empresa, grupo]);
    if (ag.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'grupo aprobado: no editable' }); }
    await eliminarRol(client, req.params.rolId);
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Marca/desmarca si un rol se paga por el TXT masivo del banco. El Excel de
// la nómina no se ve afectado: siempre incluye a todos. No se restringe por
// estado del período porque el TXT se regenera incluso después de cerrado.
router.patch('/:id/roles/:rolId/incluir-txt', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { incluir } = req.body;
  if (typeof incluir !== 'boolean') return res.status(400).json({ error: 'incluir (boolean) requerido' });
  const { rows } = await pool.query(
    `UPDATE roles_pago SET incluir_en_txt=$1
     WHERE id=$2 AND periodo_id=$3
     RETURNING id, incluir_en_txt`,
    [incluir, req.params.rolId, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'rol no encontrado en este período' });
  res.json(rows[0]);
});

// Sincroniza de una sola vez los préstamos/descuentos de TODOS los roles del período
// (equivalente a llamar /roles/:id/sincronizar por cada colaborador).
router.post('/:id/sincronizar', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await sincronizarPeriodo(client, req.params.id);
    await client.query('COMMIT');
    res.json(resultado);
  } catch (e) {
    await client.query('ROLLBACK');
    const code = e.message === 'período no existe' ? 404 : e.message.includes('no editable') ? 409 : 500;
    res.status(code).json({ error: e.message });
  } finally {
    client.release();
  }
});

// Grupos del archivo de pago: SERV_PROF = externos; COMERCIAL/ADM = IESS según
// la clasificación explícita del colaborador. Regla única en lib/grupos.js.
const FILTRO_GRUPO = {
  SERV_PROF: `c.tipo='EXTERNO'`,
  COMERCIAL: `c.tipo='IESS' AND c.clasificacion='COMERCIAL'`,
  ADM: `c.tipo='IESS' AND c.clasificacion='ADMINISTRATIVO'`,
};

router.get('/:id/txt-pago', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { empresa, grupo } = req.query;
  if (grupo && !FILTRO_GRUPO[grupo]) return res.status(400).json({ error: 'grupo inválido' });
  const { rows: p } = await pool.query('SELECT * FROM periodos WHERE id=$1', [req.params.id]);
  if (p.length === 0) return res.status(404).json({ error: 'no encontrado' });

  const params = [req.params.id];
  if (empresa) params.push(empresa);
  // Solo entran los roles marcados para pago por TXT (incluir_en_txt); los
  // desmarcados se pagan por otro medio y ni siquiera se reportan aquí.
  const { rows } = await pool.query(
    `SELECT rp.neto, c.nombre, c.cedula, c.cuenta_bancaria, c.tipo_cuenta, c.codigo_banco,
            c.forma_pago
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 AND rp.neto > 0 AND rp.incluir_en_txt
       ${empresa ? 'AND c.empresa=$2' : ''}
       ${grupo ? `AND ${FILTRO_GRUPO[grupo]}` : ''}
     ORDER BY c.nombre`,
    params
  );

  // Solo entran transferencias con datos bancarios completos; el resto se
  // reporta para que RRHH los pague por otro medio o complete la ficha.
  const pagables = rows.filter(
    (r) => r.forma_pago === 'TRANSFERENCIA' && r.cuenta_bancaria && r.cedula && r.codigo_banco
  );
  const excluidos = rows
    .filter((r) => !pagables.includes(r))
    .map((r) => ({ nombre: r.nombre, neto: r.neto, motivo: !r.cuenta_bancaria || !r.cedula || !r.codigo_banco ? 'sin datos bancarios' : 'forma de pago no es transferencia' }));

  const descripcion = `ROL DE PAGOS ${p[0].nombre}`.toUpperCase().slice(0, 40);
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const archivo = ['pago', slug(p[0].nombre), empresa && slug(empresa), grupo?.toLowerCase()]
    .filter(Boolean).join('_') + '.txt';

  res.json({
    archivo,
    descripcion,
    contenido: pagables.length ? generarTxtPichincha(pagables, descripcion) : '',
    incluidos: pagables.length,
    total: round2(pagables.reduce((s, r) => s + Number(r.neto), 0)),
    excluidos,
  });
});

// Excel de la nómina del período: hoja resumen (una fila por colaborador) +
// hoja detalle (todas las líneas). Incluye a TODOS los roles, marcados o no
// para TXT. Se devuelve como JSON con base64 (mismo patrón que el TXT) para
// no romper el manejo de respuestas del cliente.
router.get('/:id/excel', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { rows: p } = await pool.query('SELECT * FROM periodos WHERE id=$1', [req.params.id]);
  if (p.length === 0) return res.status(404).json({ error: 'no encontrado' });

  const { rows: roles } = await pool.query(
    `SELECT rp.total_ingresos, rp.total_descuentos, rp.neto, rp.incluir_en_txt,
            c.nombre, c.cedula, c.tipo, c.empresa, c.forma_pago, c.clasificacion
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1
     ORDER BY c.nombre`,
    [req.params.id]
  );
  const { rows: lineas } = await pool.query(
    `SELECT c.nombre AS colaborador_nombre, l.clase, l.tipo_linea, l.descripcion, l.monto
     FROM lineas_rol l
     JOIN roles_pago rp ON rp.id=l.rol_pago_id
     JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1
     ORDER BY c.nombre, l.clase, l.creado_en`,
    [req.params.id]
  );

  const buffer = generarExcelNomina(roles, lineas);
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  res.json({
    archivo: `nomina_${slug(p[0].nombre)}.xlsx`,
    contenidoBase64: buffer.toString('base64'),
    incluidos: roles.length,
    total: round2(roles.reduce((s, r) => s + Number(r.neto), 0)),
  });
});

export default router;
