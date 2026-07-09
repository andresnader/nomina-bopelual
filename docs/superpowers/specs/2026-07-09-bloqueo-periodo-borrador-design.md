# Bloquear crear un período nuevo mientras hay uno en BORRADOR

**Fecha**: 2026-07-09 · **Estado**: aprobado por Andrés

## Contexto

Hoy `POST /periodos` no valida nada respecto a otros períodos existentes:
se puede crear un período nuevo (y generar sus roles) aunque ya exista otro
en estado `BORRADOR` sin aprobar ni cerrar. Andrés pidió que esto se
bloquee — solo debe poder haber un período en BORRADOR a la vez.

## Decisión confirmada

El bloqueo aplica sin importar la quincena: si existe **cualquier** período
en `BORRADOR` (1ra o 2da quincena), no se puede crear otro hasta aprobarlo
o cerrarlo. Un período cubre ambas empresas a la vez, así que tiene sentido
tratarlo como un recurso único en el tiempo.

## Alcance

### Backend — `server/src/routes/periodos.js`, `POST /`

Dentro de la misma transacción, antes de `crearPeriodo`:

```sql
SELECT id, nombre FROM periodos WHERE estado='BORRADOR' FOR UPDATE
```

Si devuelve alguna fila: `ROLLBACK` y `409` con el nombre del período
pendiente. El `FOR UPDATE` también cierra la carrera entre dos creaciones
concurrentes: la segunda transacción espera a que la primera termine antes
de reevaluar la condición, en vez de que ambas pasen el chequeo a la vez.

### Frontend — `client/src/pages/Periodos.jsx`

El botón "Nuevo período" se deshabilita (`disabled:opacity-40`, mismo
patrón que otros botones condicionales del proyecto) cuando
`lista.some(p => p.estado === 'BORRADOR')`. Mensaje junto al botón:
"Hay un período en BORRADOR pendiente — apruébalo o ciérralo antes de
crear uno nuevo", con link al período en cuestión.

## Testing

- Test de API: crear un período (queda BORRADOR) → intentar crear un
  segundo → esperar 409. Aprobar y cerrar el primero → crear un segundo
  ahora sí funciona (201).
- `npm -w client run build`.

## Fuera de alcance

No se toca `generarRoles`, `sincronizarPeriodo`, ni la lógica de cálculo —
el bloqueo es puramente sobre la creación del período, antes de que exista
cualquier rol.
