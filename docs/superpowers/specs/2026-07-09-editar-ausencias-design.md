# Editar solicitudes de ausencia

**Fecha**: 2026-07-09 · **Estado**: aprobado por Andrés

## Contexto

`server/src/routes/ausencias.js` hoy solo tiene `GET`, `POST`, `POST
/:id/aprobar`, `POST /:id/rechazar` y `DELETE /:id` — no existe forma de
corregir tipo/fechas/motivo de una solicitud ya creada sin borrarla y
recrearla. Andrés pidió poder editarlas.

## Decisiones confirmadas

1. Solo se puede editar mientras `estado='SOLICITADA'` — mismo criterio
   que `aprobar`/`rechazar` (`WHERE ... AND estado='SOLICITADA'`, 409 si no
   aplica). Evita reescribir en silencio una ausencia ya decidida, que
   pudo haber afectado el saldo de vacaciones ya mostrado a alguien.
2. Solo ADMIN/RRHH pueden editar — mismo permiso que aprobar/rechazar/
   eliminar hoy. El colaborador no edita ni su propia solicitud.

## Alcance

### Backend — `server/src/routes/ausencias.js`

Nuevo `router.patch('/:id', requireRole(['ADMIN','RRHH']), ...)`:
acepta `tipo`, `fecha_desde`, `fecha_hasta`, `motivo`. Si cambia alguna de
las fechas y no se manda `dias` explícito en el body, se recalcula con
`diasEntre(fecha_desde, fecha_hasta)` (mismo helper que ya usa el `POST`).

```sql
UPDATE ausencias SET tipo=$1, fecha_desde=$2, fecha_hasta=$3, dias=$4, motivo=$5
WHERE id=$6 AND estado='SOLICITADA' RETURNING *
```

404/409 si no existe o ya fue decidida (mismo patrón que `decisionHandler`).

### Frontend — `client/src/pages/Ausencias.jsx`

`TablaAusencias` gana un botón de lápiz (mismo patrón visual que
`TablaDescuentos` en `Descuentos.jsx`) que abre un modal de edición con
tipo/fecha_desde/fecha_hasta/motivo. El botón solo se muestra cuando
`a.estado === 'SOLICITADA'` y `gestionable` (prop que ya existe en el
componente, usada para mostrar aprobar/rechazar).

## Testing

- Test de API: crear ausencia → PATCH cambia fechas → confirma que `dias`
  se recalculó solo, no el enviado a mano.
- Test: aprobar una ausencia → PATCH sobre ella devuelve 409.
- `npm -w client run build`.

## Fuera de alcance

No se toca `saldoVacaciones` ni la lógica de aprobar/rechazar/eliminar.
