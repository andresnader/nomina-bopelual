import { siguienteEstado } from '../lib/periodo-fsm.js';
import * as calc from '../lib/calculo.js';
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

// Genera un rol_pago con líneas automáticas para cada colaborador activo con contrato vigente.
export async function generarRoles(client, periodoId, { sbu }) {
  const { rows: periodoRows } = await client.query('SELECT * FROM periodos WHERE id=$1', [periodoId]);
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

    if (quincena === 1) {
      await insertarLinea(client, rolId, {
        tipo: 'ANTICIPO_QUINCENA', clase: 'INGRESO', monto: calc.anticipoQuincena(sueldo),
        desc: 'Anticipo primera quincena'
      });
    } else {
      await insertarLinea(client, rolId, { tipo: 'SUELDO_BASE', clase: 'INGRESO', monto: sueldo });
      // Descuento del anticipo ya pagado en la primera quincena.
      await insertarLinea(client, rolId, {
        tipo: 'ANTICIPO_QUINCENA', clase: 'DESCUENTO', monto: calc.anticipoQuincena(sueldo),
        desc: 'Anticipo ya pagado'
      });
      if (col.tipo === 'IESS') {
        await insertarLinea(client, rolId, {
          tipo: 'IESS_PERSONAL', clase: 'DESCUENTO', monto: calc.iessPersonal(sueldo)
        });
        await insertarLinea(client, rolId, {
          tipo: 'PROVISION_DECIMO_TERCERO', clase: 'INGRESO',
          monto: calc.decimoTercero(sueldo), es_provision: true
        });
        await insertarLinea(client, rolId, {
          tipo: 'PROVISION_DECIMO_CUARTO', clase: 'INGRESO',
          monto: calc.decimoCuarto(sbu), es_provision: true
        });
      }
    }

    // Préstamos activos → cuota de amortización.
    const { rows: prestamos } = await client.query(
      'SELECT * FROM prestamos WHERE colaborador_id=$1 AND activo=true',
      [col.id]
    );
    for (const pr of prestamos) {
      const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
      if (r.aplicada > 0) {
        await insertarLinea(client, rolId, {
          tipo: 'CUOTA_PRESTAMO', clase: 'DESCUENTO', monto: r.aplicada, desc: 'Cuota de préstamo'
        });
        await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3', [
          r.saldoNuevo, r.activo, pr.id
        ]);
      }
    }

    await recalcularTotales(client, rolId);
    creados++;
  }
  return { creados };
}

// Aplica una transición de estado del período usando la FSM.
export async function transicionarPeriodo(client, periodoId, accion, usuarioId) {
  const { rows } = await client.query('SELECT estado FROM periodos WHERE id=$1', [periodoId]);
  if (rows.length === 0) throw new Error('período no existe');
  const nuevo = siguienteEstado(rows[0].estado, accion);

  const extra = accion === 'aprobar' ? ', aprobado_por=$3' : accion === 'cerrar' ? ', cerrado_en=now()' : '';
  const params = accion === 'aprobar' ? [nuevo, periodoId, usuarioId] : [nuevo, periodoId];
  const { rows: upd } = await client.query(
    `UPDATE periodos SET estado=$1${extra} WHERE id=$2 RETURNING *`,
    params
  );
  return upd[0];
}
