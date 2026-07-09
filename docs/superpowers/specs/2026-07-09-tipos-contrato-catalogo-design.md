# Catálogo editable de tipos de contrato

**Fecha**: 2026-07-09 · **Estado**: aprobado por Andrés

## Contexto

En la migración `009_datos_personales.sql` (esta misma sesión) se agregó
`contratos.tipo_contrato` con un `CHECK` fijo de 4 valores inventados
(`INDEFINIDO`, `PLAZO_FIJO`, `PASANTIA`, `PRESTACION_SERVICIOS`). Andrés
pidió reemplazarlos por 5 categorías reales del Código de Trabajo
ecuatoriano, y que sean editables desde Configuración — mismo patrón que
`servicios_descuento` (migración 008) para los tipos de descuento.

No hay contratos reales usando `tipo_contrato` todavía (recién se agregó
hoy), así que reemplazar el catálogo completo no requiere migrar datos.

## Alcance

### Schema — migración `012_tipos_contrato_catalogo.sql`

```sql
CREATE TABLE IF NOT EXISTS tipos_contrato (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tipos_contrato (codigo, nombre) VALUES
  ('PRODUCTIVO', 'Contrato productivo'),
  ('INDEFINIDO', 'Contrato indefinido'),
  ('ESPECIAL_EMERGENTE', 'Contrato especial emergente'),
  ('JUVENIL', 'Contrato juvenil'),
  ('TEMPORAL', 'Contrato temporal')
ON CONFLICT (codigo) DO NOTHING;

ALTER TABLE contratos DROP CONSTRAINT IF EXISTS contratos_tipo_contrato_check;
```

La validación pasa de un `CHECK` de BD a nivel de aplicación (igual que
`servicios_descuento`/`esTipoDescuentoValido`), para poder agregar/
desactivar tipos sin migración.

### Backend

- `server/src/lib/tipos-contrato.js` (nuevo, espejo de
  `tipos-descuento.js`): `TIPOS_FALLBACK` con los 5 valores de arriba,
  `obtenerTiposContrato()` (lee `tipos_contrato WHERE activo=true`, cae al
  fallback si la tabla no existe), `esTipoContratoValido(tipo)`.
- `server/src/routes/tipos-contrato.js` (nuevo). `servicios-descuento.js`
  no es el mejor espejo aquí porque todo ese router es ADMIN-only, y
  `ContratosTab` la necesita RRHH también (mismo rol que ya puede crear
  contratos). El mejor espejo es **`bancos.js`**, que separa lectura de
  activos (cualquier rol autenticado) de gestión (solo ADMIN):
  - `GET /` — cualquier rol autenticado, `obtenerTiposContrato()`
    (`activo=true`) — alimenta el `<select>` de `ContratosTab`.
  - `GET /todos` — solo ADMIN, todas las filas incluyendo inactivas —
    alimenta la tabla de gestión en Configuración.
  - `POST /` y `PATCH /:codigo` — solo ADMIN, mismo shape que
    `servicios-descuento.js` (`codigo` se normaliza a mayúsculas).
- `server/src/routes/colaboradores.js`, `POST /:id/contratos`: si el body
  trae `tipo_contrato`, valida con `esTipoContratoValido()` antes del
  INSERT (400 si no es válido) — mismo patrón que `POST /descuentos`
  valida `tipo_linea`.

### Frontend

- `client/src/pages/Configuracion.jsx`: nueva pestaña "Tipos de contrato"
  (`TiposContratoTab`, espejo de `ServiciosDescuentoTab` — alta, edición
  modal, toggle activo).
- `client/src/pages/ColaboradorDetalle.jsx`, `ContratosTab`: el `<select>`
  de tipo de contrato (hoy con las 4 opciones hardcodeadas agregadas en la
  sesión de hoy) pasa a cargar `GET /tipos-contrato` con `useEffect`, mismo
  patrón que `FormDescuento` carga `/descuentos/tipos`. El label de la
  tabla de historial (`TIPO_CONTRATO_LABEL`, hardcodeado hoy) se reemplaza
  por un lookup contra la lista cargada.

## Testing

- Test de API: `POST /tipos-contrato` (ADMIN) crea uno nuevo; `PATCH`
  desactiva uno; `POST /colaboradores/:id/contratos` con un
  `tipo_contrato` inválido devuelve 400, con uno válido (de los 5
  sembrados) devuelve 201.
- `npm -w client run build`.

## Fuera de alcance

No se toca el resto de `colaboradores.js` (los campos de la Fase de datos
personales de hoy no cambian). No hay migración de datos porque no existen
contratos con `tipo_contrato` fuera de los tests.
