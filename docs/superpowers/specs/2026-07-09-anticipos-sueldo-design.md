# Anticipos de sueldo (extensión de Préstamos)

**Fecha**: 2026-07-09 · **Estado**: aprobado por Andrés

## Contexto

Andrés pidió que cada colaborador tenga la opción de anticipo de sueldo.
Ya existe `ANTICIPO_SUELDO` como tipo de descuento genérico (monto +
cuotas, sin saldo ni abonos), pero Andrés quiere un flujo dedicado como
**Préstamos** (`prestamos` + `abonos_prestamo`: saldo_pendiente, abonos
extraordinarios, precancelación, KPIs, paginación/filtros). En vez de
construir un sistema paralelo, se extiende Préstamos con un discriminador
de `tipo`, reutilizando toda su infraestructura.

## Decisiones confirmadas

1. Pestaña **"Anticipos"** separada de "Préstamos" en la ficha del
   colaborador (no una tabla combinada con filtro).
2. El tipo de descuento genérico `ANTICIPO_SUELDO` se desactiva del
   catálogo de descuentos (`servicios_descuento.activo=false`) — de ahora
   en adelante todo anticipo se crea desde el flujo dedicado.

## Alcance

### Schema — migración `013_prestamos_tipo.sql`

```sql
ALTER TABLE prestamos
  ADD COLUMN tipo text NOT NULL DEFAULT 'PRESTAMO' CHECK (tipo IN ('PRESTAMO','ANTICIPO'));

UPDATE servicios_descuento SET activo=false WHERE codigo='ANTICIPO_SUELDO';
```

`DEFAULT 'PRESTAMO'` deja todos los préstamos existentes intactos sin
tocarlos.

### Backend

- `server/src/routes/prestamos.js`:
  - `POST /`: acepta `tipo` (default `'PRESTAMO'` si no se envía —
    compatibilidad con la pantalla global actual, que no lo manda hoy).
  - `GET /`: acepta `?tipo=PRESTAMO|ANTICIPO`, mismo patrón que los
    filtros `activo`/`q`/`colaborador_id` que ya existen; el `resumen`
    (KPIs) se calcula sobre el conjunto ya filtrado, igual que hoy.
- `server/src/services/periodos.js`, `aplicarPrestamosPendientes`: al
  insertar la línea de nómina, si `prestamo.tipo==='ANTICIPO'` usa
  `tipo_linea='ANTICIPO_SUELDO'` y `descripcion='Cuota de anticipo'` en
  vez de `'CUOTA_PRESTAMO'`/`'Cuota de préstamo'` — el rol de pago
  impreso debe decir la verdad sobre qué se está descontando.
- `server/src/lib/tipos-descuento.js`: se quita `ANTICIPO_SUELDO` de
  `TIPOS_FALLBACK` también (coherencia con la desactivación en BD).

### Frontend

- `client/src/pages/Prestamos.jsx` (pantalla global): filtro de tipo
  (Todos/Préstamos/Anticipos) junto al de Activos/Pagados; el formulario
  de alta gana un selector Préstamo/Anticipo; la tabla gana una
  columna/badge de tipo.
- `client/src/pages/ColaboradorDetalle.jsx`: nueva pestaña **"Anticipos"**
  entre "Préstamos" y "Ausencias" — componente `AnticiposTab`, misma
  estructura que `PrestamosTab` pero fijando `tipo=ANTICIPO` tanto en el
  alta (`POST /prestamos`) como en la carga (`GET
  /prestamos?colaborador_id=X&tipo=ANTICIPO`). Reutiliza `AbonoModal`/
  `CuotaModal` ya exportados de `Prestamos.jsx`.

## Testing

- Test de API: `POST /prestamos` con `tipo=ANTICIPO` — confirma que queda
  guardado; `GET /prestamos?tipo=ANTICIPO` no devuelve préstamos
  `tipo=PRESTAMO` y viceversa.
- Test de `aplicarPrestamosPendientes`/`generarRoles`: un préstamo con
  `tipo=ANTICIPO` genera una línea con `tipo_linea='ANTICIPO_SUELDO'`,
  descripcion `'Cuota de anticipo'`; uno con `tipo=PRESTAMO` (o sin
  especificar) sigue generando `'CUOTA_PRESTAMO'`/`'Cuota de préstamo'`
  exactamente como hoy (test de regresión explícito, dado que esto toca
  lógica de nómina compartida).
- `npm -w client run build`.

## Fuera de alcance

No se toca `abonos_prestamo` (ya funciona igual para ambos tipos — un
abono es un abono, sin importar si el préstamo es de tipo PRESTAMO o
ANTICIPO). No se migran datos existentes de `ANTICIPO_SUELDO` (descuentos
recurrentes viejos) al nuevo sistema — quedan como están, solo se bloquea
crear nuevos por esa vía.
