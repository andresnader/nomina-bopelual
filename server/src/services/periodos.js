import { siguienteEstado } from '../lib/periodo-fsm.js';
import * as calc from '../lib/calculo.js';
import { round2 } from '../lib/round.js';
import { recalcularTotales } from './roles.js';

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

// Aplica al rol las cuotas de préstamos activos que aún no tenga (por
// prestamo_id), respetando que ya deba haber empezado a descontarse.
// Reutilizable desde generarRoles y desde /roles/:id/sincronizar.
export async function aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin) {
  const { rows: prestamos } = await client.query(
    `SELECT p.* FROM prestamos p
     WHERE p.colaborador_id=$1 AND p.activo=true AND p.fecha_inicio <= $2
       AND NOT EXISTS (
         SELECT 1 FROM lineas_rol l WHERE l.rol_pago_id=$3 AND l.prestamo_id=p.id
       )`,
    [colaboradorId, periodoFechaFin, rolId]
  );
  let agregadas = 0;
  for (const pr of prestamos) {
    const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
    if (r.aplicada > 0) {
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, prestamo_id)
         VALUES ($1,'CUOTA_PRESTAMO','DESCUENTO',$2,'Cuota de préstamo',false,$3)`,
        [rolId, r.aplicada, pr.id]
      );
      await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3', [
        r.saldoNuevo, r.activo, pr.id
      ]);
      agregadas++;
    }
  }
  return agregadas;
}

// Aplica al rol los descuentos recurrentes activos que aún no tenga (por
// descuento_recurrente_id) y que correspondan a esta quincena.
export async function aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena) {
  const { rows: descuentos } = await client.query(
    `SELECT d.* FROM descuentos_recurrentes d
     WHERE d.colaborador_id=$1 AND d.activo=true AND d.aplicar_en IN (0,$2)
       AND NOT EXISTS (
         SELECT 1 FROM lineas_rol l WHERE l.rol_pago_id=$3 AND l.descuento_recurrente_id=d.id
       )`,
    [colaboradorId, quincena, rolId]
  );
  for (const d of descuentos) {
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
  }
  return descuentos.length;
}

// Genera un rol_pago con líneas automáticas para cada colaborador activo con contrato vigente.
// La autorización se aplica en la capa de rutas (requireRole); este servicio es interno.
export async function generarRoles(client, periodoId, { sbu, pctAnticipo = 0.4 }) {
  // FOR UPDATE bloquea el período durante la generación (evita regeneración concurrente).
  const { rows: periodoRows } = await client.query('SELECT * FROM periodos WHERE id=$1 FOR UPDATE', [periodoId]);
  if (periodoRows.length === 0) throw new Error('período no existe');
  // Solo se generan roles sobre un período en BORRADOR (integridad de estado).
  if (periodoRows[0].estado !== 'BORRADOR') {
    throw new Error(`no se generan roles en estado ${periodoRows[0].estado}`);
  }
  const quincena = periodoRows[0].quincena;
  const { rows: colaboradores } = await client.query(
    `SELECT c.*, ct.sueldo_base
     FROM colaboradores c
     JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.activo=true`
  );

  let creados = 0;
  for (const col of colaboradores) {
    const { rows: rolRows } = await client.query(
      `INSERT INTO roles_pago (periodo_id, colaborador_id) VALUES ($1,$2) RETURNING id`,
      [periodoId, col.id]
    );
    const rolId = rolRows[0].id;
    const sueldo = Number(col.sueldo_base);
    // El % de anticipo del colaborador manda; sin él aplica el parámetro global.
    const pct = col.pct_anticipo != null ? Number(col.pct_anticipo) : pctAnticipo;

    if (quincena === 1) {
      await insertarLinea(client, rolId, {
        tipo: 'ANTICIPO_QUINCENA', clase: 'INGRESO', monto: calc.anticipoQuincena(sueldo, pct),
        desc: `Anticipo primera quincena (${(pct * 100).toFixed(0)}%)`
      });
    } else {
      const pctSegunda = round2(1 - pct);
      await insertarLinea(client, rolId, {
        tipo: 'SUELDO_BASE', clase: 'INGRESO', monto: round2(sueldo * pctSegunda),
        desc: `Pago segunda quincena (${(pctSegunda * 100).toFixed(0)}%)`
      });
      if (col.tipo === 'IESS') {
        await insertarLinea(client, rolId, {
          tipo: 'IESS_PERSONAL', clase: 'DESCUENTO', monto: calc.iessPersonal(sueldo)
        });
        await insertarLinea(client, rolId, {
          tipo: 'DECIMO_TERCERO', clase: 'INGRESO',
          monto: calc.decimoTercero(sueldo)
        });
        await insertarLinea(client, rolId, {
          tipo: 'DECIMO_CUARTO', clase: 'INGRESO',
          monto: calc.decimoCuarto(sbu)
        });
        await insertarLinea(client, rolId, {
          tipo: 'FONDOS_RESERVA', clase: 'INGRESO',
          monto: calc.fondosReserva(sueldo, 999),
          desc: 'Fondos de reserva'
        });
      }
    }

    await aplicarPrestamosPendientes(client, rolId, col.id, periodoRows[0].fecha_fin);
    await aplicarDescuentosPendientes(client, rolId, col.id, quincena);

    await recalcularTotales(client, rolId);
    creados++;
  }
  return { creados };
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
