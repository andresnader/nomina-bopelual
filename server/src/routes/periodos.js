import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import {
  crearPeriodo, generarRoles, transicionarPeriodo, sincronizarPeriodo, eliminarRol,
  crearMes, transicionarPeriodoCascada, sincronizarPeriodoCascada, estadoDerivadoMes,
  colaboradoresOmitidos,
} from '../services/periodos.js';
import { generarTxtPichincha } from '../lib/txt-pichincha.js';
import { generarExcelNomina } from '../lib/excel-nomina.js';
import { round2 } from '../lib/round.js';

import { gruposDePeriodo, aprobarGrupo, reabrirGrupo } from '../services/aprobaciones.js';

const router = Router();
router.use(requireAuth);

async function getParam(client, clave, fallback) {
  const { rows } = await client.query('SELECT valor FROM parametros WHERE clave=$1', [clave]);
  return rows[0]?.valor ?? fallback;
}

// ── Períodos mensuales (antes de /:id para evitar colisión de ruta) ───────

// Validación de fecha (no futuro más allá de mes+1)
function validarMesFuturo(anio, mes) {
  const ahora = new Date();
  const actual = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
  const solicitado = new Date(anio, mes - 1, 1);
  const maxPermitido = new Date(actual.getFullYear(), actual.getMonth() + 2, 1);
  if (solicitado >= maxPermitido) {
    throw new Error('no se puede crear un período más allá del mes siguiente al actual');
  }
}

// POST /desde-mes — wizard de creación de período mensual
router.post('/desde-mes', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { anio, mes } = req.body;
  if (!anio || !mes || mes < 1 || mes > 12 || anio < 2020 || anio > 2099) {
    return res.status(400).json({ error: 'año (2020-2099) y mes (1-12) requeridos' });
  }
  try {
    validarMesFuturo(anio, mes);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await crearMes(client, { anio, mes, creado_por: req.usuario.id });
    await client.query('COMMIT');
    res.status(201).json(resultado);
  } catch (e) {
    await client.query('ROLLBACK');
    const code = e.message.includes('ya tiene período padre') || e.message.includes('no coincide con el rango esperado')
      ? 409 : 500;
    res.status(code).json({ error: e.message });
  } finally {
    client.release();
  }
});

// GET /mes — lista de períodos mensuales con quincenas hijas anidadas
router.get('/mes', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (_req, res) => {
  const { rows: padres } = await pool.query(
    `SELECT p.*,
            COALESCE((SELECT SUM(rp.neto) FROM roles_pago rp
              JOIN periodos h ON h.id=rp.periodo_id
              WHERE h.mes_periodo_id=p.id), 0) AS total_neto
     FROM periodos p
     WHERE p.tipo_periodo='MES'
     ORDER BY p.fecha_inicio DESC`
  );
  const resultado = [];
  for (const padre of padres) {
    const { rows: hijas } = await pool.query(
      `SELECT p.*, COALESCE(SUM(rp.neto),0) AS total_neto
       FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
       WHERE p.mes_periodo_id=$1
       GROUP BY p.id ORDER BY p.quincena`,
      [padre.id]
    );
    // El estado del padre no se persiste: se deriva de sus hijas (mínimo
    // común entre ellas) y se sobreescribe acá antes de responder.
    resultado.push({ ...padre, estado: estadoDerivadoMes(hijas), hijas });
  }
  // Agregar quincenas sueltas (sin padre)
  const { rows: sueltas } = await pool.query(
    `SELECT p.*, COALESCE(SUM(rp.neto),0) AS total_neto
     FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
     WHERE p.mes_periodo_id IS NULL AND p.tipo_periodo='QUINCENA'
     GROUP BY p.id ORDER BY p.fecha_inicio DESC`
  );
  res.json({ meses: resultado, sueltas });
});

// GET /combinaciones — combinaciones (tipo, clasificacion, empresa, quincena)
// que tienen al menos un colaborador con contrato vigente en el período.
router.get('/combinaciones', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const periodoId = req.query.periodo_id;
  if (!periodoId) return res.status(400).json({ error: 'periodo_id requerido' });

  let ids = [periodoId];
  const { rows: tipo } = await pool.query('SELECT tipo_periodo FROM periodos WHERE id=$1', [periodoId]);
  if (tipo.length > 0 && tipo[0].tipo_periodo === 'MES') {
    const { rows: hijas } = await pool.query('SELECT id FROM periodos WHERE mes_periodo_id=$1', [periodoId]);
    ids = hijas.map((h) => h.id);
  }

  const { rows } = await pool.query(
    `SELECT c.tipo, c.clasificacion, c.empresa, p.quincena, COUNT(*)::int AS count
     FROM roles_pago rp
     JOIN periodos p ON p.id = rp.periodo_id
     JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id = ANY($1)
     GROUP BY c.tipo, c.clasificacion, c.empresa, p.quincena
     ORDER BY c.tipo, c.clasificacion, c.empresa, p.quincena`,
    [ids]
  );
  res.json({ combinaciones: rows });
});

// POST /mes/:id/aprobar — aprueba en cascada todas las quincenas hijas
router.post('/mes/:id/aprobar', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await transicionarPeriodoCascada(client, req.params.id, 'aprobar', req.usuario.id);
    await client.query('COMMIT');
    res.json(resultado);
  } catch (e) {
    await client.query('ROLLBACK');
    const code = e.message.startsWith('Transición inválida') ? 409 : 500;
    res.status(code).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /mes/:id/cerrar — cierra en cascada todas las quincenas hijas
router.post('/mes/:id/cerrar', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await transicionarPeriodoCascada(client, req.params.id, 'cerrar', req.usuario.id);
    await client.query('COMMIT');
    res.json(resultado);
  } catch (e) {
    await client.query('ROLLBACK');
    const code = e.message.startsWith('Transición inválida') ? 409 : 500;
    res.status(code).json({ error: e.message });
  } finally {
    client.release();
  }
});

// POST /mes/:id/sincronizar — sincroniza en cascada todas las quincenas hijas
router.post('/mes/:id/sincronizar', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultado = await sincronizarPeriodoCascada(client, req.params.id);
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
    const { creados, omitidos } = await generarRoles(client, periodo.id, { sbu, pctAnticipo });
    await client.query('COMMIT');
    res.status(201).json({ periodo, creados, omitidos });
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
// Colaboradores activos que NO tienen rol en este período, con el motivo. El
// aviso que devuelve la creación solo sirve para períodos nuevos; esto permite
// revisar uno ya creado (que es como apareció el problema: agosto ya existía).
router.get('/:id/omitidos', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (req, res) => {
  const { rows: periodo } = await pool.query(
    'SELECT id, fecha_inicio, fecha_fin FROM periodos WHERE id=$1', [req.params.id]
  );
  if (periodo.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const { rows: conRol } = await pool.query(
    'SELECT colaborador_id FROM roles_pago WHERE periodo_id=$1', [req.params.id]
  );
  res.json(await colaboradoresOmitidos(pool, periodo[0], conRol.map((r) => r.colaborador_id)));
});

router.post('/:id/aprobar', requireRole(['ADMIN', 'RRHH']), accionHandler('aprobar'));
router.post('/:id/cerrar', requireRole(['ADMIN', 'RRHH']), accionHandler('cerrar'));

const TIPOS_VALIDOS = ['IESS', 'EXTERNO'];
const CLASIFICACIONES_VALIDAS = ['ADMINISTRATIVO', 'COMERCIAL'];

function accionCombinacion(fn) {
  return async (req, res) => {
    const { empresa, tipo, clasificacion } = req.body;
    if (!empresa || !TIPOS_VALIDOS.includes(tipo) || !CLASIFICACIONES_VALIDAS.includes(clasificacion)) {
      return res.status(400).json({ error: 'empresa, tipo y clasificación válidos requeridos' });
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query('SELECT estado FROM periodos WHERE id=$1 FOR UPDATE', [req.params.id]);
      if (rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'no encontrado' }); }
      if (rows[0].estado !== 'BORRADOR') { await client.query('ROLLBACK'); return res.status(409).json({ error: `período ${rows[0].estado}: no editable` }); }
      await fn(client, req.params.id, empresa, tipo, clasificacion, req.usuario.id);
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

router.post('/:id/combinaciones/aprobar', requireRole(['ADMIN', 'RRHH']),
  accionCombinacion((client, id, empresa, tipo, clasificacion, usuarioId) => aprobarGrupo(client, id, empresa, tipo, clasificacion, usuarioId)));
router.post('/:id/combinaciones/reabrir', requireRole(['ADMIN', 'RRHH']),
  accionCombinacion((client, id, empresa, tipo, clasificacion) => reabrirGrupo(client, id, empresa, tipo, clasificacion)));

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
    const { rows: ag } = await client.query(
      `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND tipo=$3 AND clasificacion=$4`,
      [req.params.id, rows[0].empresa, rows[0].tipo, rows[0].clasificacion]);
    if (ag.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'combinación aprobada: no editable' }); }
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

// Tipo de pago por rol: TRANSFERENCIA (entra al TXT), CHEQUE (pago fuera del
// TXT) o PENDIENTE (no se paga por el rol; liquidación de haberes manual). No se
// restringe por estado porque el TXT se regenera incluso después de cerrado.
const TIPOS_PAGO = ['CHEQUE', 'TRANSFERENCIA', 'PENDIENTE'];
router.patch('/:id/roles/:rolId/tipo-pago', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo_pago } = req.body;
  if (!TIPOS_PAGO.includes(tipo_pago)) return res.status(400).json({ error: 'tipo_pago inválido' });
  const { rows } = await pool.query(
    `UPDATE roles_pago SET tipo_pago=$1 WHERE id=$2 AND periodo_id=$3 RETURNING id, tipo_pago`,
    [tipo_pago, req.params.rolId, req.params.id]
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

router.get('/:id/txt-pago', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { empresa, tipo, clasificacion, quincena } = req.query;
  if ((tipo || clasificacion) && (!tipo || !clasificacion)) {
    return res.status(400).json({ error: 'tipo y clasificación son requeridos juntos' });
  }
  // Compatibilidad legacy: ?grupo= se mapea internamente (30 días).
  let tipoF = tipo, clasificacionF = clasificacion;
  if (!tipo && !clasificacion && req.query.grupo) {
    const legado = { SERV_PROF: ['EXTERNO', 'ADMINISTRATIVO'], COMERCIAL: ['IESS', 'COMERCIAL'], ADM: ['IESS', 'ADMINISTRATIVO'] };
    if (!legado[req.query.grupo]) return res.status(400).json({ error: 'grupo inválido' });
    [tipoF, clasificacionF] = legado[req.query.grupo];
  }

  const { rows: p } = await pool.query('SELECT * FROM periodos WHERE id=$1', [req.params.id]);
  if (p.length === 0) return res.status(404).json({ error: 'no encontrado' });

  // Resolver el/los período(s) objetivo: los roles_pago siempre cuelgan de
  // una QUINCENA, nunca del padre MES. Si :id es un padre, se usan sus
  // quincenas hijas (acotadas a una sola si viene ?quincena=; 404 si el mes
  // no tiene esa quincena). Si :id ya es una QUINCENA, se usa tal cual y
  // ?quincena= se ignora (el id ya pertenece a una única quincena).
  let periodoIds = [req.params.id];
  let nombrePeriodo = p[0].nombre;
  if (p[0].tipo_periodo === 'MES') {
    const { rows: hijas } = await pool.query(
      'SELECT id, nombre, quincena FROM periodos WHERE mes_periodo_id=$1 ORDER BY quincena',
      [req.params.id]
    );
    if (quincena) {
      const hija = hijas.find((h) => h.quincena === String(quincena));
      if (!hija) return res.status(404).json({ error: `el mes no tiene quincena ${quincena}` });
      periodoIds = [hija.id];
      nombrePeriodo = hija.nombre;
    } else {
      periodoIds = hijas.map((h) => h.id);
    }
  }

  const params = [periodoIds];
  let idx = 2;
  if (empresa) { params.push(empresa); idx++; }
  if (tipoF) { params.push(tipoF); }
  if (clasificacionF) { params.push(clasificacionF); }

  const { rows } = await pool.query(
    `SELECT rp.neto, c.nombre, c.cedula, c.cuenta_bancaria, c.tipo_cuenta, c.codigo_banco
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id = ANY($1) AND rp.neto > 0 AND rp.tipo_pago='TRANSFERENCIA'
       ${empresa ? `AND c.empresa=$${2}` : ''}
       ${tipoF ? `AND c.tipo=$${idx++}` : ''}
       ${clasificacionF ? `AND c.clasificacion=$${idx}` : ''}
     ORDER BY c.nombre`,
    params
  );

  const pagables = rows.filter((r) => r.cuenta_bancaria && r.cedula && r.codigo_banco);
  const excluidos = rows
    .filter((r) => !pagables.includes(r))
    .map((r) => ({ nombre: r.nombre, neto: r.neto, motivo: 'sin datos bancarios' }));

  const descripcion = `ROL DE PAGOS ${nombrePeriodo}`.toUpperCase().slice(0, 40);
  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const archivo = ['pago', slug(nombrePeriodo), empresa && slug(empresa), tipoF?.toLowerCase(), clasificacionF?.toLowerCase()]
    .filter(Boolean).join('_') + '.txt';

  const total = round2(pagables.reduce((s, r) => s + Number(r.neto), 0));

  // Advertencias: la combinación pedida no tiene ningún colaborador con rol
  // en el/los período(s) resuelto(s) (ni pagable ni excluido: no hay nada).
  // El caso de ?quincena= inexistente ya se cubrió arriba como 404.
  const warnings = [];
  if (pagables.length === 0 && excluidos.length === 0) {
    warnings.push(tipoF && clasificacionF
      ? `La combinación tipo=${tipoF}, clasificacion=${clasificacionF}${empresa ? `, empresa=${empresa}` : ''} no tiene colaboradores en este período.`
      : 'No hay colaboradores con roles en este período.');
  }

  // Auditoría de descargas (txt_descargas): solo si se generó contenido con
  // éxito. periodo_id queda tal cual el :id de la URL (sin resolver a
  // hijas), para saber desde qué vista se pidió (mes o quincena puntual).
  // Best-effort: un fallo acá no debe impedir que RRHH reciba el archivo de
  // pago ya calculado (y esta ruta no tiene try/catch propio — Express 4 no
  // reenvía rejections de handlers async).
  if (pagables.length > 0) {
    try {
      await pool.query(
        `INSERT INTO txt_descargas (usuario_id, periodo_id, filtros, transferencias_count, total)
         VALUES ($1,$2,$3,$4,$5)`,
        [
          req.usuario.id,
          req.params.id,
          JSON.stringify({ empresa: empresa ?? null, tipo: tipoF ?? null, clasificacion: clasificacionF ?? null, quincena: quincena ?? null }),
          pagables.length,
          total,
        ]
      );
    } catch (e) {
      console.error('txt_descargas: fallo al registrar auditoría', e.message);
    }
  }

  res.json({
    archivo,
    descripcion,
    contenido: pagables.length ? generarTxtPichincha(pagables, descripcion) : '',
    incluidos: pagables.length,
    total,
    excluidos,
    warnings,
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
    `SELECT rp.total_ingresos, rp.total_descuentos, rp.neto, rp.tipo_pago,
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
