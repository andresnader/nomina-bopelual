import { SQL_GRUPO, ETIQUETA_GRUPO } from '../lib/grupos.js';

// Grupos (empresa × grupo) que realmente tienen roles en el período, con su
// conteo, total neto y estado de aprobación.
export async function gruposDePeriodo(client, periodoId) {
  const { rows } = await client.query(
    `WITH roles_grupo AS (
       SELECT rp.neto, c.empresa, ${SQL_GRUPO} AS grupo
       FROM roles_pago rp JOIN colaboradores c ON c.id = rp.colaborador_id
       WHERE rp.periodo_id = $1
     )
     SELECT rg.empresa, rg.grupo,
            COUNT(*)::int AS colaboradores,
            COALESCE(SUM(rg.neto), 0) AS total_neto,
            (ag.periodo_id IS NOT NULL) AS aprobado,
            ag.aprobado_por, ag.aprobado_en
     FROM roles_grupo rg
     LEFT JOIN aprobaciones_grupo ag
       ON ag.periodo_id = $1 AND ag.empresa = rg.empresa AND ag.grupo = rg.grupo
     GROUP BY rg.empresa, rg.grupo, ag.periodo_id, ag.aprobado_por, ag.aprobado_en
     ORDER BY rg.empresa, rg.grupo`,
    [periodoId]
  );
  return rows.map((r) => ({ ...r, etiqueta: ETIQUETA_GRUPO[r.grupo] ?? r.grupo }));
}

export async function grupoAprobado(client, periodoId, empresa, grupo) {
  const { rows } = await client.query(
    `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND grupo=$3`,
    [periodoId, empresa, grupo]
  );
  return rows.length > 0;
}

export async function aprobarGrupo(client, periodoId, empresa, grupo, usuarioId) {
  await client.query(
    `INSERT INTO aprobaciones_grupo (periodo_id, empresa, grupo, aprobado_por)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (periodo_id, empresa, grupo)
       DO UPDATE SET aprobado_por=$4, aprobado_en=now()`,
    [periodoId, empresa, grupo, usuarioId]
  );
}

export async function reabrirGrupo(client, periodoId, empresa, grupo) {
  await client.query(
    `DELETE FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND grupo=$3`,
    [periodoId, empresa, grupo]
  );
}

// Aprueba en bloque todos los grupos con roles del período (idempotente).
export async function aprobarTodosLosGrupos(client, periodoId, usuarioId) {
  await client.query(
    `INSERT INTO aprobaciones_grupo (periodo_id, empresa, grupo, aprobado_por)
     SELECT DISTINCT $1::uuid, c.empresa, ${SQL_GRUPO}, $2::uuid
     FROM roles_pago rp JOIN colaboradores c ON c.id = rp.colaborador_id
     WHERE rp.periodo_id = $1
     ON CONFLICT (periodo_id, empresa, grupo) DO NOTHING`,
    [periodoId, usuarioId]
  );
}
