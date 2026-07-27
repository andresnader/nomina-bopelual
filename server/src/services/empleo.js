export async function listarVinculos(client, colaboradorId) {
  const { rows } = await client.query(
    `SELECT id, fecha_entrada, fecha_salida FROM empleo_periodos
     WHERE colaborador_id=$1 ORDER BY fecha_entrada`,
    [colaboradorId]
  );
  return rows;
}

export async function crearVinculo(client, colaboradorId, { fecha_entrada, fecha_salida }) {
  const { rows } = await client.query(
    `INSERT INTO empleo_periodos (colaborador_id, fecha_entrada, fecha_salida)
     VALUES ($1,$2,$3) RETURNING id`,
    [colaboradorId, fecha_entrada, fecha_salida ?? null]
  );
  return rows[0];
}

// Actualización parcial: solo toca los campos presentes en `campos`
// (fecha_entrada y/o fecha_salida), para poder guardar un campo sin pisar el
// otro (evita una carrera al editar entrada y salida seguidas).
export async function editarVinculo(client, vinculoId, campos) {
  const set = [], params = [];
  for (const c of ['fecha_entrada', 'fecha_salida']) {
    if (c in campos) { params.push(campos[c] ?? null); set.push(`${c}=$${params.length}`); }
  }
  if (set.length === 0) return;
  params.push(vinculoId);
  await client.query(
    `UPDATE empleo_periodos SET ${set.join(', ')}, actualizado_en=now() WHERE id=$${params.length}`,
    params
  );
}

export async function borrarVinculo(client, vinculoId) {
  await client.query('DELETE FROM empleo_periodos WHERE id=$1', [vinculoId]);
}

// colaboradores.fecha_ingreso/fecha_salida son columnas DERIVADAS (para listados
// y compatibilidad): ingreso = primera entrada; salida = la del vínculo de mayor
// fecha_entrada (NULL si ese vínculo sigue abierto). Único punto que las escribe.
export async function sincronizarFechasDerivadas(client, colaboradorId) {
  await client.query(
    `UPDATE colaboradores SET
       fecha_ingreso = sub.min_entrada,
       fecha_salida  = sub.salida_ultimo
     FROM (
       SELECT MIN(fecha_entrada) AS min_entrada,
              (ARRAY_AGG(fecha_salida ORDER BY fecha_entrada DESC))[1] AS salida_ultimo
       FROM empleo_periodos WHERE colaborador_id=$1
     ) sub
     WHERE colaboradores.id=$1`,
    [colaboradorId]
  );
}

// Vínculo que solapa el período [inicio, fin]: entrada <= fin AND
// (salida IS NULL OR salida >= inicio). Si hay varios, el de mayor entrada.
export async function vinculoQueCubre(client, colaboradorId, fechaInicio, fechaFin) {
  const { rows } = await client.query(
    `SELECT fecha_entrada, fecha_salida FROM empleo_periodos
     WHERE colaborador_id=$1 AND fecha_entrada <= $3
       AND (fecha_salida IS NULL OR fecha_salida >= $2)
     ORDER BY fecha_entrada DESC LIMIT 1`,
    [colaboradorId, fechaInicio, fechaFin]
  );
  return rows[0];
}
