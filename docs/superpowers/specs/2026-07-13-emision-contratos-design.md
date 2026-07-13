# Emisión de contratos (BOPELUAL / CarrosYa) para firma

**Fecha**: 2026-07-13 · **Estado**: aprobado por Andrés

## Contexto

Andrés compartió `CONTRATO PRODUCTIVO.docx`, el contrato real que usa hoy
para un colaborador de BOPELUAL bajo la modalidad CONTRATO PRODUCTIVO
(Acuerdo Ministerial MDT-2020-222). Quiere poder emitir ese mismo tipo de
contrato, ya rellenado con los datos del colaborador y la empresa
correspondiente (BOPELUAL o CarrosYa), como un .docx descargable que se
imprime, se firma físicamente y luego se sube de vuelta al sistema como
constancia del contrato firmado. Esto requiere un lugar donde guardar esos
archivos fuera de Postgres — hoy `documentos` guarda todo como `bytea` y
está pensado para volúmenes bajos (~30 personas, máx 5 MB); para contratos
se usa en su lugar un bucket S3-compatible provisto en Railway
(`storageapi.dev`).

El proyecto ya tiene el catálogo `tipos_contrato` (PRODUCTIVO, INDEFINIDO,
ESPECIAL_EMERGENTE, JUVENIL, TEMPORAL) y la tabla `contratos` (historial de
contratos por colaborador). `config_empresas` ya distingue BOPELUAL S.A. /
CARROS-YA S.A., pero solo con la bandera `aplica_retencion`.

## Decisiones confirmadas

1. **Firma física, no electrónica.** El sistema genera el .docx ya
   rellenado; RRHH lo descarga, lo puede ajustar, se imprime y firma a
   mano, y el escaneado firmado se vuelve a subir al sistema como el
   documento oficial. No hay firma electrónica ni integración con un
   proveedor externo de firma.
2. **Alcance: solo tipo `PRODUCTIVO` por ahora.** Es el único .docx de
   referencia real. La estructura queda lista para agregar generadores de
   otros tipos de contrato cuando existan esas plantillas.
3. **Datos de empresa** (RUC, representante legal, cédula del
   representante) se agregan a `config_empresas` y se precargan con los
   datos reales de BOPELUAL y CarrosYa (provistos por Andrés). La ciudad
   ("Guayaquil") queda fija en el generador, no es un campo configurable.
4. **Funciones del cargo**: texto libre por emisión (una función por línea
   → viñetas), no un catálogo de cargos/funciones predefinido.
5. **Monto en letras**: campo manual al emitir (no hay conversor
   número→letras automático).
6. **Jornada / duración / período de prueba**: pueden variar entre
   contratos, así que son campos de texto libre al emitir (no boilerplate
   fijo, no campos numéricos con conversión — RRHH escribe la redacción
   legal exacta cada vez).
7. **Generación del .docx por código** (librería `docx`, MIT), no
   templating sobre el archivo Word original — ver Alcance/Backend.
8. **Descargas autenticadas vía servidor** (proxy desde el bucket), no
   URLs prefirmadas públicas — mismo modelo de autorización que
   `documentos.js`.
9. **Credenciales del bucket como variables de entorno**, nunca en el
   repo.

## Alcance

### Schema — migración `014_contrato_emisiones.sql`

```sql
ALTER TABLE config_empresas
  ADD COLUMN ruc text,
  ADD COLUMN representante_legal text,
  ADD COLUMN cedula_representante text;

UPDATE config_empresas SET
  ruc = '0993316237001',
  representante_legal = 'Miguel Velez Pérez',
  cedula_representante = '0911764975'
WHERE empresa = 'BOPELUAL S.A.';

UPDATE config_empresas SET
  ruc = '0993074357001',
  representante_legal = 'Alejandro Boloña Baux',
  cedula_representante = '0920303997'
WHERE empresa = 'CARROS-YA S.A.';

CREATE TABLE contrato_emisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  funciones text NOT NULL,
  remuneracion_letras text NOT NULL,
  horas_semanales text NOT NULL,
  horas_diarias text NOT NULL,
  dias_descanso text NOT NULL,
  duracion_texto text NOT NULL,
  periodo_prueba_texto text NOT NULL,
  archivo_generado_key text NOT NULL,
  generado_en timestamptz NOT NULL DEFAULT now(),
  generado_por uuid REFERENCES usuarios(id),
  archivo_firmado_key text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);
```

`contrato_emisiones` es historial de un `contrato`, igual que `contratos`
es historial de un `colaborador` — permite reemitir/corregir sin perder
rastro de emisiones anteriores.

### Backend

- **`server/src/lib/storage.js`** — wrapper del bucket, mismo estilo que
  `db/pool.js`. Usa `@aws-sdk/client-s3` apuntando a
  `STORAGE_ENDPOINT` (`https://t3.storageapi.dev`) con
  `forcePathStyle: true` y `region: STORAGE_REGION` (`auto`). Expone
  `subirArchivo(key, buffer, contentType)`, `descargarArchivo(key)` →
  buffer, `eliminarArchivo(key)`. Variables nuevas en `.env.example`:
  `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`,
  `STORAGE_ACCESS_KEY_ID`, `STORAGE_SECRET_ACCESS_KEY`. Los valores reales
  se configuran en `server/.env` (gitignored) y como variables del
  servicio en Railway — no se escriben en el repo ni en este spec.
- **`server/src/lib/contrato-productivo-docx.js`** — genera el .docx con
  la librería `docx`. Reproduce por código el texto fijo de las cláusulas
  PRIMERA a OCTAVA de `CONTRATO PRODUCTIVO.docx`, empalmando: fecha de
  emisión, empresa (RUC, representante legal, cédula — de
  `config_empresas` según `colaborador.empresa`), nombre/cédula del
  colaborador (`colaboradores`), cargo (`colaboradores.cargo`), sueldo
  base (`contratos.sueldo_base`) y los campos variables de la emisión
  (funciones como viñetas, remuneración en letras, jornada, duración,
  período de prueba). Devuelve un `Buffer`.
- **Rutas nuevas**, montadas bajo
  `colaboradores/:colaboradorId/contratos/:contratoId`, protegidas con
  `requireRole(['ADMIN','RRHH'])` (mismo patrón que `documentos.js`):
  - `POST /emitir` — valida `tipo_contrato === 'PRODUCTIVO'`, genera el
    .docx, lo sube a `contratos/{contrato_id}/generado-{timestamp}.docx`,
    inserta la fila en `contrato_emisiones`, responde con metadatos (no
    el binario).
  - `GET /emisiones` — historial de emisiones del contrato.
  - `GET /emisiones/:emisionId/generado` — stream del .docx generado
    (`Content-Disposition: attachment`).
  - `POST /emisiones/:emisionId/firmado` — subida binaria cruda del
    escaneado firmado (`express.raw`, mismo patrón que
    `documentos.js`), sube al bucket, guarda `archivo_firmado_key`,
    `firmado_en`, `firmado_por`.
  - `GET /emisiones/:emisionId/firmado` — stream del escaneado firmado.

### Frontend

- `client/src/pages/ColaboradorDetalle.jsx`, `ContratosTab`: cada fila del
  historial de contratos con `tipo_contrato === 'PRODUCTIVO'` muestra un
  botón **"Emitir contrato"**; para otros tipos aparece deshabilitado con
  tooltip "plantilla no disponible aún".
- El botón abre un modal (`Modal.jsx`) con el formulario de campos
  variables: funciones (textarea, una por línea), remuneración en letras,
  horas semanales, horas diarias, días de descanso, duración, período de
  prueba. Al enviar, llama a `POST /emitir` y dispara la descarga del
  .docx generado.
- Debajo de cada emisión: link de descarga del generado, y un control de
  subida de archivo para el firmado; una vez subido, se reemplaza por un
  badge "Firmado" + link de descarga del firmado.

## Testing

- `server/tests/contrato-emisiones.test.js`:
  - Generador de .docx en aislamiento: el buffer resultante contiene los
    datos clave (nombre y cédula del colaborador, RUC y representante
    legal de la empresa correcta, funciones como viñetas separadas).
  - `POST /emitir`: rechaza si `tipo_contrato !== 'PRODUCTIVO'`; en éxito
    crea la fila en `contrato_emisiones` con `archivo_generado_key`.
  - `GET/POST` de generado y firmado, con `storage.js` mockeado
    (`vi.mock`) para no pegarle al bucket real en CI.
  - Permisos: un colaborador no-gestor no puede emitir ni descargar
    documentos de otro colaborador (403), igual que hoy en `documentos`.
- `npm -w client run build`.

## Fuera de alcance

- Generadores para tipos de contrato distintos de PRODUCTIVO (se agregan
  cuando exista una plantilla real de referencia).
- Firma electrónica o integración con proveedores externos de firma.
- Conversión automática de números a letras (monto, jornada, etc.).
- Migración de `documentos` (bytea en Postgres) al bucket — sigue como
  está; el bucket es exclusivo de `contrato_emisiones` por ahora.
