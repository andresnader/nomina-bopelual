import { siguienteEstado } from '../lib/periodo-fsm.js';
import * as calc from '../lib/calculo.js';
import { round2 } from '../lib/round.js';
import { recalcularTotales } from './roles.js';
import { aprobarTodosLosGrupos } from './aprobaciones.js';
import { SQL_GRUPO, grupoDeColaborador } from '../lib/grupos.js';
import { vinculoQueCubre } from './empleo.js';

// "Últimos 3 días del período": si un colaborador cesa antes del fin del período
// y su salida NO cae en estos últimos días, se excluye del rol (su liquidación
// de haberes se hace aparte, manual). Sólo entra al cierre si sigue activo o si
// salió dentro de esta ventana.
const DIAS_VENTANA_CIERRE = 3;
function salidaEntraAlCierre(fechaSalida, fechaFin) {
  if (!fechaSalida) return true;
  const dias = Math.round((new Date(fechaFin) - new Date(fechaSalida)) / 86400000);
  return dias <= DIAS_VENTANA_CIERRE - 1;
}

export async function crearPeriodo(client, p) {
  const { rows } = await client.query(
    `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, creado_por)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [p.nombre, p.fecha_inicio, p.fecha_fin, p.quincena, p.creado_por]
  );
  return rows[0];
}

async function insertarLinea(client, rolId, { tipo, clase, monto, es_provision = false, desc = null }) {
  await client.query(
    `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [rolId, tipo, clase, monto, desc, es_provision]
  );
}

// Inserta la línea si no existe (según el mapa `existentesPorTipo`), o la
// actualiza si el monto/descripción calculados ya no coinciden con lo
// guardado (p. ej. cambió el sueldo, el pct_anticipo o el prorrateo).
async function insertarOActualizarLinea(client, rolId, existentesPorTipo, { tipo, clase, monto, desc = null }) {
  const existente = existentesPorTipo.get(tipo);
  if (!existente) {
    await insertarLinea(client, rolId, { tipo, clase, monto, desc });
    return 'agregada';
  }
  if (Number(existente.monto) !== monto || (existente.descripcion ?? null) !== desc) {
    await client.query('UPDATE lineas_rol SET monto=$1, descripcion=$2 WHERE id=$3', [monto, desc, existente.id]);
    return 'actualizada';
  }
  return null;
}

// Calcula e inserta/actualiza las líneas de sueldo/bono/IESS/décimos/fondos/
// rubros de un colaborador para un rol_pago. Única fuente de verdad para
// este cálculo: la usan tanto generarRolColaborador (rol nuevo, todo se
// inserta porque existentesPorTipo llega vacío) como aplicarSueldoPendiente
// (rol ya generado, se compara y actualiza lo que cambió) — antes cada una
// tenía su propia copia de esta fórmula y podían desincronizarse entre sí.
async function aplicarLineasSueldo(client, rolId, col, periodo, pctAnticipoGlobal, sbu, existentesPorTipo) {
  const sueldo = Number(col.sueldo_base);
  const bono = Number(col.bono);
  const quincena = periodo.quincena;
  const pct = col.pct_anticipo != null ? Number(col.pct_anticipo) : pctAnticipoGlobal;
  const factor = col.tipo === 'IESS'
    ? calc.factorProrrateo(col.vinc_entrada, col.vinc_salida, periodo.fecha_inicio, periodo.fecha_fin)
    : 1;
  const sufijoProrrateo = factor < 1 ? ` · prorrateado (${(factor * 100).toFixed(0)}% de la quincena)` : '';
  let agregadas = 0;
  let actualizadas = 0;
  const aplicar = async (linea) => {
    const r = await insertarOActualizarLinea(client, rolId, existentesPorTipo, linea);
    if (r === 'agregada') agregadas++;
    else if (r === 'actualizada') actualizadas++;
  };

  if (quincena === 1) {
    await aplicar({
      tipo: 'ANTICIPO_QUINCENA', clase: 'INGRESO', monto: round2(calc.anticipoQuincena(sueldo, pct) * factor),
      desc: `Anticipo primera quincena (${(pct * 100).toFixed(0)}%)${sufijoProrrateo}`
    });
    if (bono > 0) {
      await aplicar({
        tipo: 'BONO', clase: 'INGRESO', monto: round2(bono * pct * factor),
        desc: `Bono primera quincena (${(pct * 100).toFixed(0)}%)${sufijoProrrateo}`
      });
    }
  } else {
    const pctSegunda = round2(1 - pct);
    await aplicar({
      tipo: 'SUELDO_BASE', clase: 'INGRESO', monto: round2(sueldo * pctSegunda * factor),
      desc: `Pago segunda quincena (${(pctSegunda * 100).toFixed(0)}%)${sufijoProrrateo}`
    });
    if (bono > 0) {
      await aplicar({
        tipo: 'BONO', clase: 'INGRESO', monto: round2(bono * pctSegunda * factor),
        desc: `Bono segunda quincena (${(pctSegunda * 100).toFixed(0)}%)${sufijoProrrateo}`
      });
    }
    if (col.tipo === 'IESS') {
      await aplicar({ tipo: 'IESS_PERSONAL', clase: 'DESCUENTO', monto: calc.iessPersonal(sueldo) });
      await aplicar({ tipo: 'DECIMO_TERCERO', clase: 'INGRESO', monto: calc.decimoTercero(sueldo) });
      await aplicar({ tipo: 'DECIMO_CUARTO', clase: 'INGRESO', monto: calc.decimoCuarto(sbu) });
      await aplicar({ tipo: 'FONDOS_RESERVA', clase: 'INGRESO', monto: calc.fondosReserva(sueldo, 999), desc: 'Fondos de reserva' });
    }
  }

  // ── Rubros de Ingreso Proyectados ──────────────────────────────────
  const { rows: rubros } = await client.query(
    `SELECT * FROM rubros_ingreso WHERE colaborador_id=$1 AND (activo IS NULL OR activo=true)`,
    [col.id]
  );
  for (const rubro of rubros) {
    const montoMensual = Number(rubro.valor_mensual);
    if (montoMensual <= 0) continue;
    const monto = quincena === 1 ? round2(montoMensual * pct * factor) : round2(montoMensual * (1 - pct) * factor);
    if (monto > 0) {
      await aplicar({
        tipo: `RUBRO_${rubro.tipo}`, clase: 'INGRESO', monto,
        desc: `${rubro.tipo}${rubro.descripcion ? ': ' + rubro.descripcion : ''} (quincena ${quincena})${sufijoProrrateo}`
      });
    }
  }

  return { agregadas, actualizadas };
}

// Restaura o refresca las líneas de sueldo/bono/IESS/décimos/fondos/rubros de
// un rol ya generado: inserta las que falten y actualiza el monto de las que
// ya tenía si cambió el sueldo, el pct_anticipo o el prorrateo desde que se
// generó. Reutilizable desde sincronizarPeriodo y /roles/:id/sincronizar.
export async function aplicarSueldoPendiente(client, rolId, colaboradorId, quincena, periodoFechaInicio, periodoFechaFin) {
  // Obtener datos del colaborador y su contrato vigente.
  const { rows } = await client.query(
    `SELECT c.id, c.tipo, c.pct_anticipo, c.fecha_ingreso, c.fecha_salida, ct.sueldo_base, COALESCE(ct.bono, 0) AS bono
     FROM colaboradores c
     JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.id=$1`,
    [colaboradorId]
  );
  if (rows.length === 0) return { agregadas: 0, actualizadas: 0 };
  const col = rows[0];
  // El prorrateo usa el vínculo de empresa que cubre este período (no las
  // columnas derivadas, que reflejan el vínculo más reciente).
  const vinc = await vinculoQueCubre(client, colaboradorId, periodoFechaInicio, periodoFechaFin);
  col.vinc_entrada = vinc?.fecha_entrada ?? col.fecha_ingreso;
  col.vinc_salida = vinc?.fecha_salida ?? null;

  // Obtener parámetros globales.
  const { rows: paramRows } = await client.query(
    `SELECT clave, valor FROM parametros WHERE clave IN ('SBU','PORCENTAJE_ANTICIPO')`
  );
  const params = Object.fromEntries(paramRows.map((r) => [r.clave, r.valor]));
  const sbu = Number(params.SBU ?? '460');
  const pctGlobal = Number(params.PORCENTAJE_ANTICIPO ?? '0.40');

  // Líneas de sueldo que ya existen en el rol, con su id/monto/descripción
  // para poder comparar y actualizar si el cálculo ya no coincide.
  const { rows: existentes } = await client.query(
    `SELECT id, tipo_linea, monto, descripcion FROM lineas_rol WHERE rol_pago_id=$1
     AND (tipo_linea IN ('ANTICIPO_QUINCENA','SUELDO_BASE','IESS_PERSONAL',
       'DECIMO_TERCERO','DECIMO_CUARTO','FONDOS_RESERVA','BONO')
       OR tipo_linea LIKE 'RUBRO_%')`,
    [rolId]
  );
  const existentesPorTipo = new Map(existentes.map((e) => [e.tipo_linea, e]));

  const periodo = { quincena, fecha_inicio: periodoFechaInicio, fecha_fin: periodoFechaFin };
  return aplicarLineasSueldo(client, rolId, col, periodo, pctGlobal, sbu, existentesPorTipo);
}

// Aplica al rol las cuotas de préstamos activos que aún no tenga (por
// prestamo_id), respetando que ya deba haber empezado a descontarse.
// Reutilizable desde generarRoles y desde /roles/:id/sincronizar.
export async function aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin) {
  const { rows: prestamos } = await client.query(
      `SELECT p.* FROM prestamos p
     WHERE p.colaborador_id=$1 AND p.activo=true AND p.fecha_inicio <= $2::date
       AND NOT EXISTS (
         SELECT 1 FROM lineas_rol l WHERE l.rol_pago_id=$3 AND l.prestamo_id=p.id
       )`,
    [colaboradorId, periodoFechaFin, rolId]
  );
  let agregadas = 0;
  for (const pr of prestamos) {
    const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
    if (r.aplicada > 0) {
      const esAnticipo = pr.tipo === 'ANTICIPO';
      const tipoLinea = esAnticipo ? 'ANTICIPO_SUELDO' : 'CUOTA_PRESTAMO';
      const descripcion = esAnticipo ? 'Cuota de anticipo' : 'Cuota de préstamo';
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, prestamo_id)
         VALUES ($1,$2,'DESCUENTO',$3,$4,false,$5)`,
        [rolId, tipoLinea, r.aplicada, descripcion, pr.id]
      );
      await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3', [
        r.saldoNuevo, r.activo, pr.id
      ]);
      agregadas++;
    }
  }
  return agregadas;
}

// Aplica al rol los descuentos recurrentes activos que correspondan a esta
// quincena: inserta los que aún no tenga (por descuento_recurrente_id) y
// refresca el monto/tipo/descripción de los que ya tenga si el descuento
// origen fue editado después de generado el rol.
export async function aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena, periodoFechaInicio) {
  // Desactivación perezosa: si este período ya empieza después de la fecha
  // de vencimiento, el descuento deja de aplicarse desde aquí en adelante.
  // La consulta de abajo ya filtra activo=true, así que no hace falta
  // excluirlo también ahí.
  await client.query(
    `UPDATE descuentos_recurrentes
     SET activo=false
     WHERE colaborador_id=$1 AND activo=true
       AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < $2`,
    [colaboradorId, periodoFechaInicio]
  );

  const { rows: descuentos } = await client.query(
    `SELECT d.* FROM descuentos_recurrentes d
     WHERE d.colaborador_id=$1 AND d.activo=true AND d.aplicar_en IN (0,$2)`,
    [colaboradorId, quincena]
  );
  let agregadas = 0;
  let actualizadas = 0;
  for (const d of descuentos) {
    const { rows: existentes } = await client.query(
      'SELECT id, tipo_linea, monto, descripcion FROM lineas_rol WHERE rol_pago_id=$1 AND descuento_recurrente_id=$2',
      [rolId, d.id]
    );
    if (existentes.length === 0) {
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, descuento_recurrente_id)
         VALUES ($1,$2,'DESCUENTO',$3,$4,false,$5)`,
        [rolId, d.tipo_linea, Number(d.monto), d.notas, d.id]
      );
      if (d.cuotas_restantes != null) {
        const restantes = d.cuotas_restantes - 1;
        await client.query(
          'UPDATE descuentos_recurrentes SET cuotas_restantes=$1, activo=$2 WHERE id=$3',
          [restantes, restantes > 0, d.id]
        );
      }
      agregadas++;
    } else {
      const linea = existentes[0];
      const montoNuevo = Number(d.monto);
      if (linea.tipo_linea !== d.tipo_linea || Number(linea.monto) !== montoNuevo || linea.descripcion !== d.notas) {
        await client.query(
          'UPDATE lineas_rol SET tipo_linea=$1, monto=$2, descripcion=$3 WHERE id=$4',
          [d.tipo_linea, montoNuevo, d.notas, linea.id]
        );
        actualizadas++;
      }
    }
  }
  return { agregadas, actualizadas };
}

// Borra un rol revirtiendo los efectos secundarios de haberlo generado: devuelve
// la cuota al saldo del préstamo y la cuota consumida del descuento recurrente,
// reactivándolos. Reutilizable por la reconciliación de salidas y por el borrado
// manual de un rol.
export async function eliminarRol(client, rolId) {
  const { rows: lineas } = await client.query(
    `SELECT tipo_linea, monto, prestamo_id, descuento_recurrente_id
     FROM lineas_rol WHERE rol_pago_id=$1
       AND (prestamo_id IS NOT NULL OR descuento_recurrente_id IS NOT NULL)`,
    [rolId]
  );
  for (const l of lineas) {
    if (l.prestamo_id) {
      await client.query(
        `UPDATE prestamos SET saldo_pendiente = saldo_pendiente + $1, activo = true WHERE id=$2`,
        [Number(l.monto), l.prestamo_id]
      );
    }
    if (l.descuento_recurrente_id) {
      await client.query(
        `UPDATE descuentos_recurrentes
         SET cuotas_restantes = CASE WHEN cuotas_restantes IS NULL THEN NULL ELSE cuotas_restantes + 1 END,
             activo = true
         WHERE id=$1`,
        [l.descuento_recurrente_id]
      );
    }
  }
  await client.query('DELETE FROM lineas_rol WHERE rol_pago_id=$1', [rolId]);
  await client.query('DELETE FROM roles_pago WHERE id=$1', [rolId]);
}

// Genera el rol_pago de UN colaborador para un período dado, con las mismas
// líneas automáticas que generarRoles. Si el colaborador es IESS y su fecha
// de ingreso o de salida cae a mitad de este período, prorratea el
// sueldo/bono/rubros según los días trabajados (convención de 15 días por
// quincena) — los colaboradores EXTERNO nunca se prorratean. Reutilizable
// desde generarRoles (período nuevo) y agregarColaboradorAPeriodosBorrador
// (colaborador nuevo).
async function generarRolColaborador(client, periodoId, periodo, col, pctAnticipoGlobal, sbu) {
  const tipoPago = col.forma_pago === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'CHEQUE';
  const { rows: rolRows } = await client.query(
    `INSERT INTO roles_pago (periodo_id, colaborador_id, tipo_pago) VALUES ($1,$2,$3) RETURNING id`,
    [periodoId, col.id, tipoPago]
  );
  const rolId = rolRows[0].id;

  await aplicarLineasSueldo(client, rolId, col, periodo, pctAnticipoGlobal, sbu, new Map());
  await aplicarPrestamosPendientes(client, rolId, col.id, periodo.fecha_fin);
  await aplicarDescuentosPendientes(client, rolId, col.id, periodo.quincena, periodo.fecha_inicio);

  await recalcularTotales(client, rolId);
  return rolId;
}

// Genera un rol_pago con líneas automáticas para cada colaborador activo con contrato vigente.
// Se excluye a quien ya salió antes de que empiece el período (fecha_salida
// anterior al inicio: trabajó 0 días de esta quincena); si la salida cae a
// mitad del período, entra con prorrateo hasta ese día.
// La autorización se aplica en la capa de rutas (requireRole); este servicio es interno.
export async function generarRoles(client, periodoId, { sbu, pctAnticipo = 0.4 }) {
  // FOR UPDATE bloquea el período durante la generación (evita regeneración concurrente).
  const { rows: periodoRows } = await client.query('SELECT * FROM periodos WHERE id=$1 FOR UPDATE', [periodoId]);
  if (periodoRows.length === 0) throw new Error('período no existe');
  // Solo se generan roles sobre un período en BORRADOR (integridad de estado).
  if (periodoRows[0].estado !== 'BORRADOR') {
    throw new Error(`no se generan roles en estado ${periodoRows[0].estado}`);
  }
  const periodo = periodoRows[0];
  // Solo entran colaboradores con un vínculo de empresa que cubra el período
  // (JOIN LATERAL, no LEFT JOIN: excluye a quien salió antes o no ha entrado).
  const { rows: colaboradores } = await client.query(
    `SELECT c.*, ct.sueldo_base, COALESCE(ct.bono, 0) AS bono,
            v.fecha_entrada AS vinc_entrada, v.fecha_salida AS vinc_salida
     FROM colaboradores c
     JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     JOIN LATERAL (
       SELECT fecha_entrada, fecha_salida FROM empleo_periodos ep
       WHERE ep.colaborador_id=c.id AND ep.fecha_entrada <= $2
         AND (ep.fecha_salida IS NULL OR ep.fecha_salida >= $1)
       ORDER BY ep.fecha_entrada DESC LIMIT 1
     ) v ON true
     WHERE c.activo=true
       AND (v.fecha_salida IS NULL OR v.fecha_salida >= $2::date - ${DIAS_VENTANA_CIERRE - 1})`,
    [periodo.fecha_inicio, periodo.fecha_fin]
  );

  let creados = 0;
  for (const col of colaboradores) {
    await generarRolColaborador(client, periodoId, periodo, col, pctAnticipo, sbu);
    creados++;
  }
  return { creados };
}

// Si al crear el primer contrato (sueldo) de un colaborador hay uno o más
// períodos en BORRADOR, le genera de inmediato su línea de rol en cada uno
// (con prorrateo si su fecha_ingreso cae a mitad de ese período). No hace
// nada si ya tiene un rol en ese período (evita duplicar por un aumento de
// sueldo posterior).
export async function agregarColaboradorAPeriodosBorrador(client, colaboradorId) {
  const { rows: periodosBorrador } = await client.query(
    `SELECT * FROM periodos WHERE estado='BORRADOR' ORDER BY fecha_inicio FOR UPDATE`
  );
  if (periodosBorrador.length === 0) return { agregados: 0 };

  const { rows: colRows } = await client.query(
    `SELECT c.*, ct.sueldo_base, COALESCE(ct.bono, 0) AS bono
     FROM colaboradores c
     JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.id=$1 AND c.activo=true`,
    [colaboradorId]
  );
  if (colRows.length === 0) return { agregados: 0 };
  const col = colRows[0];

  const { rows: paramRows } = await client.query(
    `SELECT clave, valor FROM parametros WHERE clave IN ('SBU','PORCENTAJE_ANTICIPO')`
  );
  const params = Object.fromEntries(paramRows.map((r) => [r.clave, r.valor]));
  const sbu = Number(params.SBU ?? '460');
  const pctAnticipo = Number(params.PORCENTAJE_ANTICIPO ?? '0.40');

  let agregados = 0;
  for (const periodo of periodosBorrador) {
    // Solo si tiene un vínculo de empresa que cubra este período.
    const vinc = await vinculoQueCubre(client, colaboradorId, periodo.fecha_inicio, periodo.fecha_fin);
    if (!vinc || !salidaEntraAlCierre(vinc.fecha_salida, periodo.fecha_fin)) continue;
    const { rows: existente } = await client.query(
      'SELECT id FROM roles_pago WHERE periodo_id=$1 AND colaborador_id=$2', [periodo.id, colaboradorId]
    );
    if (existente.length > 0) continue;
    const colConVinc = { ...col, vinc_entrada: vinc.fecha_entrada, vinc_salida: vinc.fecha_salida };
    await generarRolColaborador(client, periodo.id, periodo, colConVinc, pctAnticipo, sbu);
    agregados++;
  }
  return { agregados };
}

// Deja los períodos en BORRADOR consistentes con los vínculos actuales del
// colaborador: quita su rol donde ya no tiene vínculo que cubra, y lo crea/
// re-prorratea donde sí. No toca períodos no-BORRADOR ni grupos ya aprobados.
export async function reconciliarColaboradorEnPeriodosBorrador(client, colaboradorId) {
  const { rows: col } = await client.query(
    `SELECT c.*, ct.sueldo_base, COALESCE(ct.bono,0) AS bono
     FROM colaboradores c
     LEFT JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.id=$1`,
    [colaboradorId]
  );
  if (col.length === 0) return;
  const c = col[0];
  const grupo = grupoDeColaborador(c.tipo, c.clasificacion);

  const { rows: paramRows } = await client.query(
    `SELECT clave, valor FROM parametros WHERE clave IN ('SBU','PORCENTAJE_ANTICIPO')`);
  const params = Object.fromEntries(paramRows.map((r) => [r.clave, r.valor]));
  const sbu = Number(params.SBU ?? '460');
  const pctAnticipo = Number(params.PORCENTAJE_ANTICIPO ?? '0.40');

  const { rows: periodos } = await client.query(
    `SELECT * FROM periodos WHERE estado='BORRADOR' ORDER BY fecha_inicio FOR UPDATE`);

  for (const periodo of periodos) {
    // No se toca un grupo ya aprobado (bloqueado) en este período.
    const { rows: ag } = await client.query(
      `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND grupo=$3`,
      [periodo.id, c.empresa, grupo]);
    if (ag.length > 0) continue;

    const vinc = await vinculoQueCubre(client, colaboradorId, periodo.fecha_inicio, periodo.fecha_fin);
    const daRol = vinc && salidaEntraAlCierre(vinc.fecha_salida, periodo.fecha_fin);
    const { rows: rolExistente } = await client.query(
      'SELECT id FROM roles_pago WHERE periodo_id=$1 AND colaborador_id=$2', [periodo.id, colaboradorId]);

    if (!daRol) {
      if (rolExistente.length > 0) await eliminarRol(client, rolExistente[0].id);
      continue;
    }
    if (c.sueldo_base == null) continue; // sin contrato vigente no hay rol que generar
    if (rolExistente.length === 0) {
      const colConVinc = { ...c, vinc_entrada: vinc.fecha_entrada, vinc_salida: vinc.fecha_salida };
      await generarRolColaborador(client, periodo.id, periodo, colConVinc, pctAnticipo, sbu);
    } else {
      await aplicarSueldoPendiente(client, rolExistente[0].id, colaboradorId, periodo.quincena, periodo.fecha_inicio, periodo.fecha_fin);
      await recalcularTotales(client, rolExistente[0].id);
    }
  }
}

// Sincroniza TODOS los roles de un período de una sola vez: agrega préstamos/
// descuentos creados después de generar el período y refresca el monto de los
// que ya tenían línea pero fueron editados. Mismo criterio que sincronizar un
// rol individual (server/src/routes/roles.js), solo que aplicado en bloque.
export async function sincronizarPeriodo(client, periodoId) {
  const { rows: periodoRows } = await client.query('SELECT * FROM periodos WHERE id=$1 FOR UPDATE', [periodoId]);
  if (periodoRows.length === 0) throw new Error('período no existe');
  if (periodoRows[0].estado !== 'BORRADOR') {
    throw new Error(`período ${periodoRows[0].estado}: no editable`);
  }
  // Omite los roles de grupos ya aprobados (bloqueados): no se re-sincronizan.
  const { rows: roles } = await client.query(
    `SELECT rp.id, rp.colaborador_id
     FROM roles_pago rp JOIN colaboradores c ON c.id = rp.colaborador_id
     WHERE rp.periodo_id=$1
       AND NOT EXISTS (
         SELECT 1 FROM aprobaciones_grupo ag
         WHERE ag.periodo_id = rp.periodo_id AND ag.empresa = c.empresa
           AND ag.grupo = ${SQL_GRUPO}
       )`,
    [periodoId]
  );

  let agregadas = 0;
  let actualizadas = 0;
  for (const rol of roles) {
    const sueldo = await aplicarSueldoPendiente(client, rol.id, rol.colaborador_id, periodoRows[0].quincena, periodoRows[0].fecha_inicio, periodoRows[0].fecha_fin);
    agregadas += sueldo.agregadas;
    actualizadas += sueldo.actualizadas;
    agregadas += await aplicarPrestamosPendientes(client, rol.id, rol.colaborador_id, periodoRows[0].fecha_fin);
    const descuentos = await aplicarDescuentosPendientes(client, rol.id, rol.colaborador_id, periodoRows[0].quincena, periodoRows[0].fecha_inicio);
    agregadas += descuentos.agregadas;
    actualizadas += descuentos.actualizadas;
    await recalcularTotales(client, rol.id);
  }
  return { roles: roles.length, agregadas, actualizadas };
}

// Aplica una transición de estado del período usando la FSM.
export async function transicionarPeriodo(client, periodoId, accion, usuarioId) {
  // FOR UPDATE serializa transiciones concurrentes (evita TOCTOU entre el check y el update).
  const { rows } = await client.query('SELECT estado FROM periodos WHERE id=$1 FOR UPDATE', [periodoId]);
  if (rows.length === 0) throw new Error('período no existe');
  const nuevo = siguienteEstado(rows[0].estado, accion);

  const extra = accion === 'aprobar' ? ', aprobado_por=$3' : accion === 'cerrar' ? ', cerrado_en=now()' : '';
  const params = accion === 'aprobar' ? [nuevo, periodoId, usuarioId] : [nuevo, periodoId];
  const { rows: upd } = await client.query(
    `UPDATE periodos SET estado=$1${extra} WHERE id=$2 RETURNING *`,
    params
  );

  // Al aprobar el período, se aprueban en bloque todos sus grupos (mantiene la
  // invariante "APROBADO/CERRADO ⟹ todos los grupos aprobados").
  if (accion === 'aprobar') {
    await aprobarTodosLosGrupos(client, periodoId, usuarioId);
  }

  // Al cerrar, acumula las provisiones/pagos del período en la tabla anual por colaborador.
  if (accion === 'cerrar') {
    const anio = new Date(upd[0].fecha_fin).getUTCFullYear();
    const mapa = {
      DECIMO_TERCERO: 'decimo_tercero',
      DECIMO_CUARTO: 'decimo_cuarto',
      FONDOS_RESERVA: 'fondos_reserva',
      PROVISION_DECIMO_TERCERO: 'decimo_tercero',
      PROVISION_DECIMO_CUARTO: 'decimo_cuarto',
      PROVISION_FONDOS_RESERVA: 'fondos_reserva',
    };
    const { rows: provs } = await client.query(
      `SELECT rp.colaborador_id, l.tipo_linea, SUM(l.monto) AS total
       FROM lineas_rol l JOIN roles_pago rp ON rp.id=l.rol_pago_id
       WHERE rp.periodo_id=$1 AND l.tipo_linea IN ('DECIMO_TERCERO','DECIMO_CUARTO','FONDOS_RESERVA','PROVISION_DECIMO_TERCERO','PROVISION_DECIMO_CUARTO','PROVISION_FONDOS_RESERVA')
       GROUP BY rp.colaborador_id, l.tipo_linea`,
      [periodoId]
    );
    for (const pr of provs) {
      const col = mapa[pr.tipo_linea];
      if (!col) continue;
      await client.query(
        `INSERT INTO provisiones (colaborador_id, anio, ${col}) VALUES ($1,$2,$3)
         ON CONFLICT (colaborador_id, anio) DO UPDATE
           SET ${col}=provisiones.${col}+$3, actualizado_en=now()`,
        [pr.colaborador_id, anio, pr.total]
      );
    }
  }

  return upd[0];
}
