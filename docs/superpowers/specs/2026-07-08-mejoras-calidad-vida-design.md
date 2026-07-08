# Mejoras de calidad de vida — Nómina BOPELUAL

**Fecha**: 2026-07-08 · **Estado**: aprobado por Andrés

## Objetivo

Batería de mejoras transversales de UX y funcionalidad sobre el sistema ya
existente (fases 1 y 2): sistema de Toast/Modal como estándar obligatorio,
corrección de comportamientos poco claros en préstamos y facturas, sincronización
de períodos en BORRADOR, KPIs de talento humano en el dashboard, reportes más
detallados, y Configuración organizada en pestañas.

## Alcance aprobado

### 1. Sistema Toast + Modal (base transversal)

- `client/src/components/Toast.jsx`: `ToastProvider` (contexto) + `useToast()`
  exponiendo `toast.success(msg)` / `toast.error(msg)` / `toast.info(msg)`.
  Pila de notificaciones abajo-derecha, auto-descarta a los 4s, cierre manual.
- `client/src/components/Modal.jsx`: `Modal` genérico (portal a `document.body`,
  cierre con Escape y click en el backdrop, tamaños sm/md) + `ConfirmProvider`/
  `useConfirm()` construido sobre `Modal`, que reemplaza `confirm()` nativo con
  una API basada en promesas: `if (await confirm({title, message, danger})) {...}`.
- `client/src/lib/validacion-html5.js`: `instalarMensajesValidacionEspanol()`
  — un listener en fase de captura sobre `document` para el evento `invalid`
  que traduce los mensajes nativos del navegador (`valueMissing`,
  `typeMismatch`, `rangeUnderflow/overflow`, etc.) a español mediante
  `setCustomValidity()`, limpiando el mensaje en el evento `input` siguiente.
  Se instala una sola vez en `App.jsx`. No requiere tocar formularios
  individuales.
- Ambos providers (`ToastProvider`, `ConfirmProvider`) se montan en `App.jsx`
  envolviendo el `Router`.
- Reemplazo de los 7 usos nativos existentes:
  - `Configuracion.jsx` renombrar banco (`prompt`) → modal "Editar banco".
  - `Prestamos.jsx` abonar/precancelar (`prompt`) → modal único "Registrar
    abono" (ver sección 2).
  - `Prestamos.jsx` editar cuota (`prompt`) → modal "Editar cuota".
  - `Prestamos.jsx` eliminar (`confirm`) → `useConfirm()`.
  - `Descuentos.jsx` eliminar (`confirm`) → `useConfirm()`.
  - `ColaboradorDetalle.jsx` eliminar documento (`confirm`) → `useConfirm()`.
- Alcance de reemplazo de banners de error inline: en acciones de
  crear/editar/eliminar/aprobar, el error pasa a mostrarse con
  `toast.error()` en vez de (o además de) un `<Card>` de error. Los errores
  de **carga inicial de página** que impiden renderizar (ej. "Cargando…" con
  fallback) NO se tocan — son un caso distinto (bloquean la vista, no una
  notificación puntual). Las mutaciones exitosas muestran `toast.success()`
  con un mensaje corto ("Préstamo abonado", "Descuento eliminado", etc.).
- Este patrón (Toast + Modal, nunca `alert/confirm/prompt` nativos) queda
  como estándar obligatorio para todo desarrollo futuro en el proyecto.

### 2. Préstamos: fecha real + abono/precancelación en modal

- **Semántica de fecha**: se renombra la etiqueta de "Fecha de inicio" a
  **"Primera quincena de descuento"**, con texto de ayuda explicando el
  efecto. Cambio funcional real (hoy es puramente informativa): en
  `generarRoles`, el query de préstamos activos agrega
  `AND fecha_inicio <= $periodoFechaFin` — un préstamo con fecha futura ya
  no se descuenta antes de tiempo.
- **Modal único "Registrar abono o precancelar"**: campo de monto **editable**
  (precargado con el saldo total cuando se abre desde el botón "Precancelar",
  vacío/0 desde "Abonar"), campo de notas opcional, y un aviso dinámico
  ("Esto precancelará el préstamo") cuando el monto ingresado iguala el
  saldo pendiente. Un solo botón "Registrar". Usa el endpoint existente
  `POST /prestamos/:id/abonos` (ya soporta abonos parciales y precancelación
  sin `monto` = todo el saldo; el modal siempre envía un monto explícito).
- **Modal "Editar cuota"**: input numérico con la cuota actual precargada.
- **Eliminar**: usa `useConfirm()` en vez de `confirm()` nativo.

### 3. Sincronizar período en BORRADOR (por colaborador)

- Migración: `lineas_rol` gana dos columnas nullable —
  `prestamo_id uuid REFERENCES prestamos(id)` y
  `descuento_recurrente_id uuid REFERENCES descuentos_recurrentes(id)` — para
  saber qué línea vino de qué origen y evitar duplicados al sincronizar.
  Se actualiza `generarRoles` (ya existente) para que etiquete con estos IDs
  las líneas de préstamo/descuento recurrente que crea.
- Se extrae la lógica de "aplicar préstamos pendientes" y "aplicar descuentos
  recurrentes pendientes" de `generarRoles` a dos funciones reutilizables en
  `server/src/services/periodos.js`: `aplicarPrestamosPendientes(client, rolId,
  colaboradorId, periodoFechaFin)` y `aplicarDescuentosPendientes(client,
  rolId, colaboradorId, quincena)`. Cada una revisa las líneas ya existentes
  del rol (por `prestamo_id`/`descuento_recurrente_id`) y solo inserta lo que
  falte.
- Nuevo endpoint `POST /api/roles/:id/sincronizar` (ADMIN/RRHH, solo si el
  período está en BORRADOR): llama ambas funciones, recalcula totales, y
  responde cuántas líneas se agregaron.
- UI: en `RolPago.jsx`, mientras el período esté en BORRADOR, botón
  **"Sincronizar descuentos y préstamos"** → llama al endpoint, recarga, y
  muestra el resultado con `toast.success()` (o `toast.info()` si no había
  nada pendiente).

### 4. Retención configurable por empresa

- Nueva tabla `config_empresas(empresa text PRIMARY KEY, aplica_retencion
  boolean NOT NULL DEFAULT true)`. Sembrada: `BOPELUAL S.A.` → true,
  `CARROS-YA S.A.` → false (confirmado con el usuario: CARROS-YA no retiene
  aún, pero debe poder activarse a futuro sin tocar código).
- `facturas_proveedor` gana la columna `empresa text` (denormalizada desde
  `colaborador.empresa` al momento de crear la factura, para que quede fija
  aunque el proveedor cambie de empresa después, y para poder filtrar/listar
  por empresa).
- `POST /facturas`: busca la empresa del proveedor, consulta
  `config_empresas.aplica_retencion` para esa empresa (default `true` si no
  hay fila o el proveedor no tiene empresa asignada — mantiene el
  comportamiento actual como fallback seguro), y calcula la retención en
  consecuencia (0 si no aplica). Sigue calculándose siempre en el servidor.
- UI: nueva pestaña **Configuración → Empresas** con un toggle por empresa
  ("Aplicar retención de fuente a las facturas de proveedores").

### 5. Ficha del proveedor con sus facturas

- Nueva pestaña **"Facturas"** en `ColaboradorDetalle.jsx`, visible solo
  cuando `col.tipo === 'EXTERNO'`. Incluye formulario de alta rápida (número,
  fecha, monto bruto — la retención se calcula igual que en el flujo global)
  y tabla con retención/neto/estado/botón "Marcar pagada".
- La página global **Proveedores** se mantiene (vista consolidada para
  gestión de pagos), con la columna empresa agregada a la tabla.

### 6. Dashboard: KPIs de Talento Humano

Se agregan 4 KPIs (rol ADMIN/RRHH/GERENCIA), calculados en el propio
`Dashboard.jsx` a partir de datos ya disponibles vía API (colaboradores,
préstamos, descuentos, documentos) sin necesidad de nuevos endpoints salvo
donde se indique:

- **Cumpleaños/aniversarios del mes**: compara mes de `fecha_ingreso` (y de
  nacimiento si existiera — no existe ese campo, así que por ahora es solo
  aniversario de ingreso) con el mes actual.
- **Distribución por empresa/departamento**: conteo de colaboradores activos
  agrupado por `empresa` y `departamento` (client-side sobre la lista ya
  cargada).
- **Préstamos y descuentos activos**: total de colaboradores con al menos un
  préstamo o descuento recurrente activo, y el monto agregado que se
  descontará el próximo período (reusa `GET /prestamos` `resumen` +
  `GET /descuentos?activo=true`).
- **Documentos faltantes**: colaboradores activos sin ningún documento
  cargado (nuevo endpoint ligero `GET /reportes/documentos-faltantes` que
  hace un `LEFT JOIN` colaboradores/documentos y cuenta).

### 7. Reportes más detallados

Cada reporte nuevo: tabla en pantalla + botón de exportar CSV (reutilizando
el helper `aCsv` existente) + un párrafo explicando qué muestra y para qué
sirve.

- **Evolución de costo de nómina por mes**: `GET /reportes/evolucion-mensual`
  — por período, suma de `total_ingresos`/`total_descuentos`/`neto` de todos
  los `roles_pago`. Se muestra como tabla con una barra de progreso CSS
  simple (reutilizando el patrón de `BarraProgreso` de Préstamos) para
  visualizar la proporción entre períodos, sin librería de gráficos.
- **Retenciones a proveedores**: `GET /reportes/retenciones-proveedor` —
  agrupado por proveedor y mes, con totales de bruto/retención/neto.
- **Provisiones acumuladas**: `GET /reportes/provisiones?anio=` — listado de
  la tabla `provisiones` por colaborador con totales.
- **Costo por departamento (mejorado)**: se modifica el endpoint existente
  `GET /reportes/costo-departamento` para aceptar `?periodo_id=` y devolver,
  para ese período específico, ingresos/descuentos/neto reales agrupados por
  departamento (antes solo mostraba una proyección de sueldo + aporte
  patronal de contratos vigentes, sin ligar a un período real). El modo sin
  `periodo_id` se mantiene igual (proyección actual) para no romper nada
  existente; con `periodo_id` se añaden las columnas reales.

### 8. Configuración en pestañas

`Configuracion.jsx` se reorganiza con el mismo patrón de pestañas que ya usa
`ColaboradorDetalle.jsx`:

- **General**: todos los parámetros de la tabla `parametros` (hoy solo SBU es
  editable desde la UI aunque `PORCENTAJE_ANTICIPO` y `DIAS_VACACIONES_ANIO`
  ya existen en la base) — se generaliza a un formulario que itera sobre
  `GET /parametros` con una etiqueta amigable por clave conocida.
- **Empresas**: toggle de retención por empresa (sección 4).
- **Bancos**: el componente `ConfiguracionBancos` ya existente, sin cambios
  de lógica.
- **Usuarios**: la gestión de usuarios ya existente, sin cambios de lógica.

## Migraciones nuevas

`007_origen_lineas_y_empresas.sql`:
```sql
ALTER TABLE lineas_rol
  ADD COLUMN prestamo_id uuid REFERENCES prestamos(id),
  ADD COLUMN descuento_recurrente_id uuid REFERENCES descuentos_recurrentes(id);

CREATE TABLE config_empresas (
  empresa text PRIMARY KEY,
  aplica_retencion boolean NOT NULL DEFAULT true
);
INSERT INTO config_empresas (empresa, aplica_retencion) VALUES
  ('BOPELUAL S.A.', true), ('CARROS-YA S.A.', false);

ALTER TABLE facturas_proveedor ADD COLUMN empresa text;
```

## Testing

- `generarRoles`: préstamo con fecha futura no se incluye en el período
  actual (nuevo caso en `tests/prestamos.test.js`).
- Endpoint `/roles/:id/sincronizar`: agrega líneas faltantes sin duplicar
  las ya existentes; rechaza si el período no está en BORRADOR.
- Facturas: retención 0 cuando la empresa del proveedor tiene
  `aplica_retencion=false`; retención normal cuando no hay configuración para
  la empresa (fallback seguro).
- Reportes nuevos: al menos un test por endpoint verificando la agregación
  correcta con datos de prueba conocidos.
- Frontend: no se agregan tests de componente (el proyecto no los tiene hoy);
  se verifica manualmente con el skill `run`/navegador tras cada fase.

## Fuera de alcance (YAGNI)

Librería de gráficos (se usan tablas + barras CSS simples), campo de fecha de
nacimiento (no existe, cumpleaños queda limitado a aniversario de ingreso),
notificaciones por email/push, deshacer sincronización.

## Plan de ejecución

Implementación por fases dentro de la misma rama, corriendo la suite de tests
después de cada una:
1. Sistema Toast/Modal + validaciones en español (base para todo lo demás).
2. Préstamos: fecha real + modales.
3. Migración 007 + sincronizar período BORRADOR.
4. Retención por empresa + pestaña Facturas en ficha proveedor.
5. Dashboard KPIs RRHH.
6. Reportes nuevos.
7. Configuración en pestañas.
8. Verificación final (tests + build) y commit/push.
