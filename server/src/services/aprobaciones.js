// Combinaciones (empresa × tipo × clasificacion) que realmente tienen roles en
// el período, con su conteo, total neto y estado de aprobación.
export async function gruposDePeriodo(client, periodoId) {
  const { rows } = await client.query(
    `SELECT c.empresa, c.tipo, c.clasificacion,
            COUNT(*)::int AS colaboradores,
            COALESCE(SUM(rp.neto), 0) AS total_neto,
            (ag.periodo_id IS NOT NULL) AS aprobado,
            ag.aprobado_por, ag.aprobado_en
     FROM roles_pago rp
     JOIN colaboradores c ON c.id = rp.colaborador_id
     LEFT JOIN aprobaciones_grupo ag
       ON ag.periodo_id = rp.periodo_id
      AND ag.empresa = c.empresa
      AND ag.tipo = c.tipo
      AND ag.clasificacion = c.clasificacion
     WHERE rp.periodo_id = $1
     GROUP BY c.empresa, c.tipo, c.clasificacion, ag.periodo_id, ag.aprobado_por, ag.aprobado_en
     ORDER BY c.empresa, c.tipo, c.clasificacion`,
    [periodoId]
  );
  return rows.map((r) => ({ ...r, etiqueta: `${r.tipo} · ${r.clasificacion}` }));
}

export async function grupoAprobado(client, periodoId, empresa, tipo, clasificacion) {
  const { rows } = await client.query(
    `SELECT 1 FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND tipo=$3 AND clasificacion=$4`,
    [periodoId, empresa, tipo, clasificacion]
  );
  return rows.length > 0;
}

export async function aprobarGrupo(client, periodoId, empresa, tipo, clasificacion, usuarioId) {
  await client.query(
    `INSERT INTO aprobaciones_grupo (periodo_id, empresa, tipo, clasificacion, aprobado_por)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (periodo_id, empresa, tipo, clasificacion)
       DO UPDATE SET aprobado_por=$5, aprobado_en=now()`,
    [periodoId, empresa, tipo, clasificacion, usuarioId]
  );
}

export async function reabrirGrupo(client, periodoId, empresa, tipo, clasificacion) {
  await client.query(
    `DELETE FROM aprobaciones_grupo WHERE periodo_id=$1 AND empresa=$2 AND tipo=$3 AND clasificacion=$4`,
    [periodoId, empresa, tipo, clasificacion]
  );
}

// Aprueba en bloque todas las combinaciones (empresa × tipo × clasificacion)
// que tienen roles en el período (idempotente).
export async function aprobarTodosLosGrupos(client, periodoId, usuarioId) {
  await client.query(
    `INSERT INTO aprobaciones_grupo (periodo_id, empresa, tipo, clasificacion, aprobado_por)
     SELECT DISTINCT $1::uuid, c.empresa, c.tipo, c.clasificacion, $2::uuid
     FROM roles_pago rp JOIN colaboradores c ON c.id = rp.colaborador_id
     WHERE rp.periodo_id = $1
     ON CONFLICT (periodo_id, empresa, tipo, clasificacion) DO NOTHING`,
    [periodoId, usuarioId]
  );
}
