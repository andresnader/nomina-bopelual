# Descuentos recurrentes: fecha de vencimiento automática

**Fecha**: 2026-07-09 · **Estado**: aprobado por Andrés

## Contexto

Última observación pendiente del correo de RRHH: los descuentos recurrentes
deben poder tener una fecha límite, de manera que el sistema los desactive
solo una vez cumplida esa fecha, sin depender de que alguien los apague a
mano.

Este es el tercer y último sub-proyecto derivado del correo (los otros dos —
nuevos campos de colaboradores, y reporte de décimos/fondos por período —
ya están implementados). A diferencia de esos dos, este toca la lógica de
generación/sincronización de nómina (`generarRoles`, `sincronizarPeriodo`,
`/roles/:id/sincronizar`), por eso se especifica con más cuidado.

## Decisiones (confirmadas con Andrés)

1. **Sin cron**: el proyecto no tiene tareas programadas — todo ocurre
   cuando se genera o sincroniza un período. La desactivación por fecha es
   **perezosa**: se detecta la próxima vez que un período nuevo la toca,
   igual que ya funciona `cuotas_restantes` hoy.
2. **Borde del vencimiento**: se compara contra la **fecha de inicio** del
   período, no la de fin. Si el descuento seguía vigente cuando el período
   arrancó, se aplica completo esa quincena aunque venza a mitad de camino;
   ya no se aplica en el siguiente período.

## Alcance

### Schema — migración `010_descuento_fecha_vencimiento.sql`

```sql
-- Fecha límite opcional de un descuento recurrente. NULL = indefinido,
-- mismo criterio que cuotas_restantes. La desactivación es perezosa: se
-- aplica la primera vez que un período con fecha_inicio posterior la toca
-- (ver aplicarDescuentosPendientes en services/periodos.js).
ALTER TABLE descuentos_recurrentes
  ADD COLUMN fecha_vencimiento date;
```

Nullable, no rompe descuentos existentes.

### Backend

- `server/src/services/periodos.js` — `aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena, periodoFechaInicio)` gana un cuarto parámetro. Antes de la consulta que aplica descuentos, corre:
  ```sql
  UPDATE descuentos_recurrentes
  SET activo=false
  WHERE colaborador_id=$1 AND activo=true
    AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < $2
  ```
  (`$2` = `periodoFechaInicio`). Como la consulta existente que selecciona descuentos a aplicar ya filtra `activo=true`, un descuento recién desactivado queda excluido automáticamente sin tocar esa consulta — solo se le agrega este paso previo.
- Tres call-sites deben pasar `periodoFechaInicio` (los tres ya tienen `fecha_inicio` del período disponible, ninguno necesita una query nueva):
  - `generarRoles` (mismo archivo) — usa `periodoRows[0].fecha_inicio`.
  - `sincronizarPeriodo` (mismo archivo) — usa `periodoRows[0].fecha_inicio`.
  - `POST /roles/:id/sincronizar` (`server/src/routes/roles.js`) — su `SELECT` ya trae `p.fecha_fin, p.quincena`; hay que agregar `p.fecha_inicio` a esa misma consulta.
- `server/src/routes/descuentos.js`: `POST /` y `PATCH /:id` aceptan `fecha_vencimiento` (mismo patrón que `cuotas_restantes` — opcional, nulo si no se envía).

### Frontend — `client/src/pages/Descuentos.jsx`

- `FormDescuento`: input `type="date"` opcional, "Vence el (opcional)", junto a "Cuotas (opcional)".
- `TablaDescuentos`: columna "Vence" mostrando `fecha(d.fecha_vencimiento)` o `∞` si es null (mismo patrón que la columna "Cuotas rest."); el modal de edición gana el mismo input de fecha.

## Testing

- `aplicarDescuentosPendientes`/`generarRoles`: crear un descuento con `fecha_vencimiento` **anterior** a la `fecha_inicio` de un período nuevo → generar el período → verificar que (a) no se creó línea para ese descuento y (b) el descuento quedó `activo=false` en BD.
- Caso complementario: `fecha_vencimiento` **posterior o igual** a la `fecha_inicio` → el descuento se sigue aplicando normalmente.
- `PATCH /descuentos/:id` acepta y persiste `fecha_vencimiento`.
- `npm -w client run build` para confirmar que compila.

## Fuera de alcance

- No se agrega infraestructura de tareas programadas (cron) — desactivación puramente perezosa, como se acordó.
- No se notifica a nadie cuando un descuento vence (ni email ni UI de alertas) — solo se refleja en el badge ACTIVO/INACTIVO existente.
- No se toca `aplicarPrestamosPendientes` ni la lógica de préstamos — este spec es solo sobre `descuentos_recurrentes`.
