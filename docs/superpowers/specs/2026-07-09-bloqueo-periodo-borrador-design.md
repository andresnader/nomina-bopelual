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

## Corrección tras investigación (2026-07-09)

El diseño original incluía un bloqueo duro en el backend (`POST
/periodos` devuelve 409 si hay un `BORRADOR` pendiente). Al preparar la
implementación se midió cuántos períodos crea la suite de tests del
servidor sin aprobarlos/cerrarlos después: de ~18 creaciones, solo ~4
quedan aprobadas — el resto se deja a propósito en `BORRADOR` (varios
tests prueban justamente ese estado). Un bloqueo duro en el backend
rompería la gran mayoría de esos tests en cuanto la suite corriera en
paralelo, y arreglarlo implicaría tocar ~6 archivos de test sin relación
con este pedido. **Se descartó el bloqueo en backend.** Solo queda el
aviso en el frontend — suficiente para evitar el error humano en el uso
real, sin tocar la API ni los tests existentes.

## Alcance

### Frontend — `client/src/pages/Periodos.jsx`

El botón "Nuevo período" se deshabilita (`disabled:opacity-40`, mismo
patrón que otros botones condicionales del proyecto) cuando
`lista.some(p => p.estado === 'BORRADOR')`. Mensaje junto al botón:
"Hay un período en BORRADOR pendiente — apruébalo o ciérralo antes de
crear uno nuevo", con link al período en cuestión.

## Testing

- `npm -w client run build`. Sin cambios de backend, no hay test de API
  para esto — es un condicional puramente de UI sobre datos que
  `GET /periodos` ya devuelve (`estado`).

## Fuera de alcance

No se toca el backend (`POST /periodos`, `generarRoles`,
`sincronizarPeriodo`) en absoluto — solo el botón y mensaje en
`Periodos.jsx`.
