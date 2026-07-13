# Emisión de contratos (BOPELUAL / CarrosYa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let RRHH emitir un contrato productivo (BOPELUAL o CarrosYa) ya rellenado con los datos del colaborador, descargarlo como .docx, y subir de vuelta el escaneado firmado — guardando ambos archivos en el bucket S3-compatible de Railway en vez de Postgres — per el spec aprobado en `docs/superpowers/specs/2026-07-13-emision-contratos-design.md`.

**Architecture:** Una migración agrega datos legales a `config_empresas` (RUC, representante legal, cédula) y crea `contrato_emisiones` (historial de emisiones por contrato, con las claves de los archivos en el bucket). Un módulo `storage.js` envuelve `@aws-sdk/client-s3` apuntando al endpoint de Railway. Un generador `contrato-productivo-docx.js` construye el .docx por código con la librería `docx` (sin templating sobre el .docx original). Rutas nuevas anidadas bajo `colaboradores/:colaboradorId/contratos/:contratoId/emisiones` orquestan generar+subir, descargar el generado, subir el firmado y descargar el firmado. El frontend extiende la pestaña "Contratos" existente en `ColaboradorDetalle.jsx` con un modal de emisión y enlaces de descarga/subida por emisión.

**Tech Stack:** Node/Express + pg (server), `docx`@9.7.1 (generación), `@aws-sdk/client-s3`@3.x (bucket), React + Vite + Tailwind (client), Vitest + supertest + `jszip` (tests).

## Global Constraints

- Solo `tipo_contrato = 'PRODUCTIVO'` se puede emitir por ahora — cualquier otro tipo responde 400 en el backend y muestra el botón deshabilitado en el UI.
- Descargas siempre autenticadas vía servidor (proxy desde el bucket), protegidas con `requireRole(['ADMIN','RRHH'])` — igual que `server/src/routes/documentos.js`. Nunca URLs públicas/prefirmadas.
- Límite de 5 MB para el archivo firmado subido (mismo límite que `documentos.js`).
- Credenciales del bucket (`STORAGE_*`) van solo en `server/.env` (gitignored) y como variables del servicio en Railway — nunca en el repo ni en commits.
- Ciudad fija ("Guayaquil") en el generador, no es un campo configurable.
- No se auto-convierten números a letras (monto, jornada) — son campos de texto libre al emitir.

---

### Task 1: Migración — datos legales de empresa + historial de emisiones

**Files:**
- Create: `server/db/migrations/014_contrato_emisiones.sql`
- Modify: `server/tests/migrate.test.js`
- Modify: `server/tests/empresas.test.js`

**Interfaces:**
- Produces: columnas `config_empresas.ruc`, `config_empresas.representante_legal`, `config_empresas.cedula_representante` (sembradas para BOPELUAL S.A. y CARROS-YA S.A.); tabla `contrato_emisiones` (columnas: `id, contrato_id, funciones, remuneracion_letras, horas_semanales, horas_diarias, dias_descanso, duracion_texto, periodo_prueba_texto, archivo_generado_key, generado_en, generado_por, archivo_firmado_key, archivo_firmado_mime, firmado_en, firmado_por`).
- Consumes: nada nuevo (usa `contratos`, `usuarios`, `config_empresas` existentes).

- [ ] **Step 1: Write the failing tests**

En `server/tests/migrate.test.js`, en el array de tablas esperadas dentro de `'crea las tablas del dominio'`, agrega `'contrato_emisiones'`:

```js
  it('crea las tablas del dominio', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    );
    const nombres = rows.map((r) => r.table_name);
    for (const t of [
      'colaboradores', 'contratos', 'periodos', 'roles_pago', 'lineas_rol',
      'provisiones', 'prestamos', 'facturas_proveedor', 'usuarios', 'parametros',
      'contrato_emisiones'
    ]) {
      expect(nombres).toContain(t);
    }
  });
```

En `server/tests/empresas.test.js`, agrega un nuevo `it` dentro del `describe('config_empresas', ...)`, después del test `'viene sembrado: BOPELUAL retiene, CARROS-YA no'`:

```js
  it('viene sembrado con datos legales para emitir contratos', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/empresas'));
    const bop = res.body.find((e) => e.empresa === 'BOPELUAL S.A.');
    const cya = res.body.find((e) => e.empresa === 'CARROS-YA S.A.');
    expect(bop.ruc).toBe('0993316237001');
    expect(bop.representante_legal).toBe('Miguel Velez Pérez');
    expect(bop.cedula_representante).toBe('0911764975');
    expect(cya.ruc).toBe('0993074357001');
    expect(cya.representante_legal).toBe('Alejandro Boloña Baux');
    expect(cya.cedula_representante).toBe('0920303997');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- migrate.test.js empresas.test.js`
Expected: FAIL — `contrato_emisiones` no está en `nombres`, y `bop.ruc`/`cya.ruc` etc. son `undefined` porque las columnas no existen todavía.

- [ ] **Step 3: Write the migration**

Create `server/db/migrations/014_contrato_emisiones.sql`:

```sql
-- Datos legales por empresa para poder emitir contratos (RUC, representante
-- legal y su cédula), e historial de emisiones de contrato: un contrato
-- puede reemitirse/corregirse, cada fila es una emisión con el .docx
-- generado y, opcionalmente, el escaneado firmado. Ambos archivos viven en
-- el bucket S3-compatible de Railway (ver server/src/lib/storage.js), no en
-- bytea como la tabla documentos.
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
  archivo_firmado_mime text,
  firmado_en timestamptz,
  firmado_por uuid REFERENCES usuarios(id)
);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm -w server test -- migrate.test.js empresas.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/014_contrato_emisiones.sql server/tests/migrate.test.js server/tests/empresas.test.js
git commit -m "feat: datos legales de empresa e historial de emisiones de contrato"
```

---

### Task 2: `server/src/lib/storage.js` — wrapper del bucket S3-compatible

**Files:**
- Modify: `server/package.json` (agrega `@aws-sdk/client-s3`)
- Modify: `server/src/config.js`
- Modify: `.env.example`
- Create: `server/src/lib/storage.js`
- Test: `server/tests/storage.test.js`

**Interfaces:**
- Produces: `subirArchivo(key: string, buffer: Buffer, contentType: string): Promise<string>` (devuelve `key`), `descargarArchivo(key: string): Promise<Buffer>`.
- Consumes: nada nuevo.

- [ ] **Step 1: Install the dependency**

Run: `npm install @aws-sdk/client-s3@^3.1085.0 -w server`

- [ ] **Step 2: Add the env vars to `config.js` and `.env.example`**

En `server/src/config.js`, agrega al final:

```js
export const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT;
export const STORAGE_REGION = process.env.STORAGE_REGION || 'auto';
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET;
export const STORAGE_ACCESS_KEY_ID = process.env.STORAGE_ACCESS_KEY_ID;
export const STORAGE_SECRET_ACCESS_KEY = process.env.STORAGE_SECRET_ACCESS_KEY;
```

En `.env.example`, agrega después de `PORT=3001`:

```
# Bucket S3-compatible (Railway) para contratos emitidos
STORAGE_ENDPOINT=https://xxxx.storageapi.dev
STORAGE_REGION=auto
STORAGE_BUCKET=xxxx
STORAGE_ACCESS_KEY_ID=xxxx
STORAGE_SECRET_ACCESS_KEY=xxxx
```

En `server/.env` (no versionado — no lo toques en el commit de este paso), agrega los mismos 5 valores reales del bucket ya provisto.

- [ ] **Step 3: Write the failing test**

Create `server/tests/storage.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

const send = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({ send })),
  PutObjectCommand: vi.fn((args) => ({ __cmd: 'Put', ...args })),
  GetObjectCommand: vi.fn((args) => ({ __cmd: 'Get', ...args })),
}));

const { subirArchivo, descargarArchivo } = await import('../src/lib/storage.js');

describe('storage (bucket S3-compatible)', () => {
  beforeEach(() => { send.mockReset(); });

  it('subirArchivo manda un PutObjectCommand con key, body y content-type', async () => {
    send.mockResolvedValueOnce({});
    const key = await subirArchivo('contratos/x/generado.docx', Buffer.from('hola'), 'application/msword');
    expect(key).toBe('contratos/x/generado.docx');
    expect(send).toHaveBeenCalledTimes(1);
    const comando = send.mock.calls[0][0];
    expect(comando.__cmd).toBe('Put');
    expect(comando.Key).toBe('contratos/x/generado.docx');
    expect(comando.ContentType).toBe('application/msword');
    expect(comando.Body.toString()).toBe('hola');
  });

  it('descargarArchivo devuelve un Buffer con el contenido del objeto', async () => {
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => new Uint8Array([104, 111, 108, 97]) }
    });
    const buffer = await descargarArchivo('contratos/x/generado.docx');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString()).toBe('hola');
    const comando = send.mock.calls[0][0];
    expect(comando.__cmd).toBe('Get');
    expect(comando.Key).toBe('contratos/x/generado.docx');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm -w server test -- storage.test.js`
Expected: FAIL — `Cannot find module '../src/lib/storage.js'`.

- [ ] **Step 5: Write `server/src/lib/storage.js`**

```js
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import {
  STORAGE_ENDPOINT, STORAGE_REGION, STORAGE_BUCKET,
  STORAGE_ACCESS_KEY_ID, STORAGE_SECRET_ACCESS_KEY,
} from '../config.js';

const client = new S3Client({
  region: STORAGE_REGION,
  endpoint: STORAGE_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: STORAGE_ACCESS_KEY_ID,
    secretAccessKey: STORAGE_SECRET_ACCESS_KEY,
  },
});

export async function subirArchivo(key, buffer, contentType) {
  await client.send(new PutObjectCommand({
    Bucket: STORAGE_BUCKET, Key: key, Body: buffer, ContentType: contentType,
  }));
  return key;
}

export async function descargarArchivo(key) {
  const res = await client.send(new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }));
  return Buffer.from(await res.Body.transformToByteArray());
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm -w server test -- storage.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/package.json server/package-lock.json server/src/config.js server/src/lib/storage.js server/tests/storage.test.js .env.example
git commit -m "feat: wrapper del bucket S3-compatible de Railway para archivos de contratos"
```

---

### Task 3: `server/src/lib/contrato-productivo-docx.js` — generador del .docx

**Files:**
- Modify: `server/package.json` (agrega `docx`; agrega `jszip` como devDependency para tests)
- Create: `server/src/lib/contrato-productivo-docx.js`
- Test: `server/tests/contrato-productivo-docx.test.js`

**Interfaces:**
- Produces: `generarContratoProductivoDocx({ empresa, colaborador, contrato, emision }): Promise<Buffer>`, donde:
  - `empresa`: `{ empresa, ruc, representante_legal, cedula_representante }` (fila de `config_empresas`).
  - `colaborador`: `{ nombre, cedula, cargo, sexo }`.
  - `contrato`: `{ fecha_inicio }` (fecha ISO `YYYY-MM-DD`, se usa como fecha de firma del contrato).
  - `emision`: `{ funciones, remuneracion_letras, horas_semanales, horas_diarias, dias_descanso, duracion_texto, periodo_prueba_texto }` (`funciones` es texto con una función por línea).
- Consumes: nada nuevo.

- [ ] **Step 1: Install the dependencies**

Run: `npm install docx@^9.7.1 -w server && npm install -D jszip@^3.10.1 -w server`

- [ ] **Step 2: Write the failing test**

Create `server/tests/contrato-productivo-docx.test.js`:

```js
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { generarContratoProductivoDocx } from '../src/lib/contrato-productivo-docx.js';

const empresa = {
  empresa: 'BOPELUAL S.A.', ruc: '0993316237001',
  representante_legal: 'Miguel Velez Pérez', cedula_representante: '0911764975',
};
const colaborador = {
  nombre: 'RODRIGUEZ SIGUENZA CHRISTIAN MICHAEL', cedula: '0927222620',
  cargo: 'Supervisor Comercial', sexo: 'M',
};
const contrato = { fecha_inicio: '2026-05-01' };
const emision = {
  funciones: 'Supervisar y coordinar al equipo de ventas\nMonitorear el cumplimiento de objetivos y estrategias comerciales',
  remuneracion_letras: 'SEISCIENTOS 00/100',
  horas_semanales: 'cuarenta', horas_diarias: 'Ocho', dias_descanso: 'Dos',
  duracion_texto: 'un año, renovable por una sola vez hasta por un año adicional',
  periodo_prueba_texto: '90 días',
};

async function extraerTexto(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return zip.file('word/document.xml').async('string');
}

describe('generarContratoProductivoDocx', () => {
  it('incluye los datos de la empresa, el colaborador, las funciones y la fecha', async () => {
    const buffer = await generarContratoProductivoDocx({ empresa, colaborador, contrato, emision });
    const xml = await extraerTexto(buffer);

    expect(xml).toContain('BOPELUAL S.A.');
    expect(xml).toContain('0993316237001');
    expect(xml).toContain('Miguel Velez Pérez');
    expect(xml).toContain('RODRIGUEZ SIGUENZA CHRISTIAN MICHAEL');
    expect(xml).toContain('0927222620');
    expect(xml).toContain('Supervisor Comercial');
    expect(xml).toContain('Supervisar y coordinar al equipo de ventas');
    expect(xml).toContain('Monitorear el cumplimiento de objetivos y estrategias comerciales');
    expect(xml).toContain('SEISCIENTOS 00/100');
    expect(xml).toContain('cuarenta');
    expect(xml).toContain('90 días');
    expect(xml).toContain('1 de mayo de 2026');
    expect(xml).toContain('el señor');
  });

  it('usa "la señora" cuando sexo=F', async () => {
    const buffer = await generarContratoProductivoDocx({
      empresa, colaborador: { ...colaborador, sexo: 'F' }, contrato, emision
    });
    const xml = await extraerTexto(buffer);
    expect(xml).toContain('la señora');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm -w server test -- contrato-productivo-docx.test.js`
Expected: FAIL — `Cannot find module '../src/lib/contrato-productivo-docx.js'`.

- [ ] **Step 4: Write `server/src/lib/contrato-productivo-docx.js`**

```js
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle,
} from 'docx';

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function formatearFechaLarga(fechaISO) {
  const [anio, mes, dia] = fechaISO.slice(0, 10).split('-').map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

function parrafoTitulo(texto) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: texto, bold: true, size: 28 })],
  });
}

function parrafoClausula(titulo, texto) {
  return new Paragraph({
    spacing: { after: 200 },
    children: [new TextRun({ text: `${titulo}: `, bold: true }), new TextRun(texto)],
  });
}

const SIN_BORDE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const SIN_BORDES = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE };

function celdaFirma(texto) {
  return new TableCell({
    borders: SIN_BORDES,
    children: [new Paragraph({ alignment: AlignmentType.CENTER, text: texto })],
  });
}

function filaFirma(izquierda, derecha) {
  return new TableRow({ children: [celdaFirma(izquierda), celdaFirma(derecha)] });
}

export async function generarContratoProductivoDocx({ empresa, colaborador, contrato, emision }) {
  const tratamiento = colaborador.sexo === 'F' ? 'la señora' : 'el señor';
  const pronombre = colaborador.sexo === 'F' ? 'la' : 'lo';
  const fecha = formatearFechaLarga(contrato.fecha_inicio);

  const funciones = emision.funciones
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean)
    .map((f) => new Paragraph({ text: f, bullet: { level: 0 } }));

  const doc = new Document({
    sections: [{
      children: [
        parrafoTitulo('CONTRATO DE TRABAJO PRODUCTIVO'),
        new Paragraph({
          spacing: { after: 200 },
          children: [new TextRun(
            `En la ciudad de Guayaquil, el ${fecha}, comparecen: por una parte, la compañía ` +
            `${empresa.empresa}, con R.U.C. # ${empresa.ruc}, representada por ${empresa.representante_legal}, ` +
            `a quien para efectos de este contrato se llamará EL EMPLEADOR; y por otra parte, ${tratamiento} ` +
            `${colaborador.nombre} con C.C. ${colaborador.cedula}, a quien se ${pronombre} denominara EL ` +
            `TRABAJADOR. Las partes comparecientes acuerdan lo siguiente:`
          )],
        }),
        parrafoClausula('PRIMERA: ANTECEDENTES',
          'EL EMPLEADOR, para el desarrollo de sus actividades productivas de venta programada y ' +
          'comercialización de vehículos, requiere contratar personal bajo la modalidad de CONTRATO ' +
          'PRODUCTIVO, de conformidad con el Acuerdo Ministerial Nro. MDT-2020-222 y las reformas legales vigentes.'
        ),
        parrafoClausula('SEGUNDA: OBJETO Y CARGO',
          `EL TRABAJADOR se obliga a prestar sus servicios lícitos y personales en calidad de ` +
          `${colaborador.cargo}, realizando las siguientes funciones:`
        ),
        ...funciones,
        parrafoClausula('TERCERA: JORNADA LABORAL',
          `Dada la naturaleza productiva de la actividad, las partes acuerdan una jornada de ` +
          `${emision.horas_semanales} horas semanales, las cuales podrán ser distribuidas de lunes a domingo, ` +
          `en jornadas diarias de hasta ${emision.horas_diarias} horas, sin exceder el máximo legal. EL ` +
          `TRABAJADOR tendrá derecho a ${emision.dias_descanso} días de descanso consecutivos.`
        ),
        parrafoClausula('CUARTA: REMUNERACIÓN',
          `EL EMPLEADOR pagará al TRABAJADOR la cantidad de ${emision.remuneracion_letras} mensuales. ` +
          `Además, se pagarán las horas suplementarias o extraordinarias conforme a la ley, en caso de existir.`
        ),
        parrafoClausula('QUINTA: DURACIÓN Y PERIODO DE PRUEBA',
          `El presente contrato tendrá una duración de ${emision.duracion_texto}. Se establece un periodo ` +
          `de prueba de ${emision.periodo_prueba_texto}, dentro del cual cualquiera de las partes podrá ` +
          `terminar la relación laboral sin previo aviso ni indemnización.`
        ),
        parrafoClausula('SEXTA: AFILIACIÓN Y BENEFICIOS',
          'EL EMPLEADOR se obliga a afiliar al TRABAJADOR al Instituto Ecuatoriano de Seguridad Social (IESS) ' +
          'desde el primer día de labores y a pagar los beneficios sociales que tenga derecho el TRABAJADOR, ' +
          'así como los fondos de reserva según corresponda.'
        ),
        parrafoClausula('SÉPTIMA: PROTECCIÓN DE DATOS (LOPDP)',
          'EL TRABAJADOR autoriza al EMPLEADOR el tratamiento de sus datos personales para fines ' +
          'exclusivamente laborales. Asimismo, EL TRABAJADOR se compromete a guardar absoluta confidencialidad ' +
          'sobre la información sensible de los CLIENTES y del EMPLEADOR.'
        ),
        parrafoClausula('OCTAVA: JURISDICCIÓN',
          'Para cualquier controversia, las partes se someten a los Jueces de Trabajo de la ciudad de ' +
          'Guayaquil y al procedimiento sumario establecido en el COGEP.'
        ),
        new Paragraph({
          spacing: { before: 200, after: 600 },
          text: 'Para constancia, las partes firman en unidad de acto y por triplicado.',
        }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, text: `P. ${empresa.empresa}` }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            filaFirma(empresa.representante_legal, colaborador.nombre),
            filaFirma('EL EMPLEADOR', 'EL TRABAJADOR'),
            filaFirma(`C.C.# ${empresa.cedula_representante}`, `C.C.# ${colaborador.cedula}`),
          ],
        }),
      ],
    }],
  });

  return Packer.toBuffer(doc);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm -w server test -- contrato-productivo-docx.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/package.json server/package-lock.json server/src/lib/contrato-productivo-docx.js server/tests/contrato-productivo-docx.test.js
git commit -m "feat: generador del contrato productivo en .docx"
```

---

### Task 4: Rutas de emisión + embeber emisiones en la ficha del colaborador

**Files:**
- Create: `server/src/routes/contrato-emisiones.js`
- Modify: `server/src/index.js` (monta el router nuevo)
- Modify: `server/src/routes/colaboradores.js` (`GET /:id` embebe `emisiones` en cada contrato)
- Test: `server/tests/contrato-emisiones.test.js`

**Interfaces:**
- Consumes: `subirArchivo`/`descargarArchivo` (Task 2), `generarContratoProductivoDocx` (Task 3), tabla `contrato_emisiones` (Task 1).
- Produces:
  - `POST /api/colaboradores/:colaboradorId/contratos/:contratoId/emisiones` → 201 con la fila de `contrato_emisiones`.
  - `GET /api/colaboradores/:colaboradorId/contratos/:contratoId/emisiones/:emisionId/generado` → stream del .docx.
  - `POST /api/colaboradores/:colaboradorId/contratos/:contratoId/emisiones/:emisionId/firmado` → sube el escaneado, 200 con la fila actualizada.
  - `GET /api/colaboradores/:colaboradorId/contratos/:contratoId/emisiones/:emisionId/firmado` → stream del escaneado.
  - `GET /api/colaboradores/:id` ahora devuelve `contratos[].emisiones` (array, más reciente primero).

- [ ] **Step 1: Write the failing tests**

Create `server/tests/contrato-emisiones.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const identidad = { email: 'rrhh@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
vi.mock('../src/lib/storage.js', () => ({
  subirArchivo: vi.fn(async (key) => key),
  descargarArchivo: vi.fn(async () => Buffer.from('contenido-fake')),
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const { subirArchivo, descargarArchivo } = await import('../src/lib/storage.js');
const auth = (r) => r.set('Authorization', 'Bearer x');

const emisionBody = {
  funciones: 'Supervisar al equipo\nCapacitar al personal',
  remuneracion_letras: 'SEISCIENTOS 00/100',
  horas_semanales: 'cuarenta', horas_diarias: 'Ocho', dias_descanso: 'Dos',
  duracion_texto: 'un año, renovable por una sola vez',
  periodo_prueba_texto: '90 días',
};

async function crearContratoProductivo(app, empresa = 'BOPELUAL S.A.') {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Emision ${Date.now()}`, cedula: `EM${Date.now() % 1e8}`
    })
  ).body;
  await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ empresa });
  const contrato = (
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 600, fecha_inicio: '2026-05-01', tipo_contrato: 'PRODUCTIVO'
    })
  ).body;
  return { col, contrato };
}

describe('emisión de contratos', () => {
  beforeEach(async () => {
    identidad.email = 'rrhh@bopelual.com';
    subirArchivo.mockClear();
    descargarArchivo.mockClear();
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST /emisiones genera el docx, lo sube al bucket y guarda la fila', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)
    ).send(emisionBody);

    expect(res.status).toBe(201);
    expect(res.body.contrato_id).toBe(contrato.id);
    expect(res.body.archivo_generado_key).toMatch(new RegExp(`^contratos/${contrato.id}/generado-`));
    expect(subirArchivo).toHaveBeenCalledTimes(1);

    const detalle = await auth(request(app).get(`/api/colaboradores/${col.id}`));
    const c = detalle.body.contratos.find((x) => x.id === contrato.id);
    expect(c.emisiones).toHaveLength(1);
    expect(c.emisiones[0].id).toBe(res.body.id);
  });

  it('rechaza emitir un contrato que no es PRODUCTIVO', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `EmisionMala ${Date.now()}`, cedula: `EB${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ empresa: 'BOPELUAL S.A.' });
    const contrato = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
        sueldo_base: 600, fecha_inicio: '2026-05-01', tipo_contrato: 'INDEFINIDO'
      })
    ).body;

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)
    ).send(emisionBody);
    expect(res.status).toBe(400);
  });

  it('GET /generado descarga el binario devuelto por el bucket', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);
    const emision = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)).send(emisionBody)
    ).body;

    const res = await auth(
      request(app).get(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones/${emision.id}/generado`)
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(descargarArchivo).toHaveBeenCalledWith(emision.archivo_generado_key);
  });

  it('POST /firmado sube el escaneado y GET /firmado lo descarga con su content-type', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);
    const emision = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)).send(emisionBody)
    ).body;

    const subida = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones/${emision.id}/firmado`)
    ).set('Content-Type', 'application/pdf').send(Buffer.from('%PDF-fake'));
    expect(subida.status).toBe(200);
    expect(subida.body.archivo_firmado_key).toMatch(new RegExp(`^contratos/${contrato.id}/firmado-`));

    const descarga = await auth(
      request(app).get(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones/${emision.id}/firmado`)
    );
    expect(descarga.status).toBe(200);
    expect(descarga.headers['content-type']).toBe('application/pdf');
  });

  it('solo ADMIN/RRHH pueden emitir; COLABORADOR no', async () => {
    const app = createApp();
    const { col, contrato } = await crearContratoProductivo(app);
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('colaborador1@bopelual.com','COLABORADOR')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='COLABORADOR'`);
    identidad.email = 'colaborador1@bopelual.com';

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/contratos/${contrato.id}/emisiones`)
    ).send(emisionBody);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- contrato-emisiones.test.js`
Expected: FAIL — la ruta `/api/colaboradores/:colaboradorId/contratos/:contratoId/emisiones` no existe (404 en vez de los status esperados).

- [ ] **Step 3: Write `server/src/routes/contrato-emisiones.js`**

```js
import { Router } from 'express';
import express from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { subirArchivo, descargarArchivo } from '../lib/storage.js';
import { generarContratoProductivoDocx } from '../lib/contrato-productivo-docx.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);

const GESTORES = ['ADMIN', 'RRHH'];
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const EXTENSIONES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' };

async function cargarContrato(colaboradorId, contratoId) {
  const { rows } = await pool.query(
    `SELECT c.*, col.nombre, col.cedula, col.cargo, col.empresa, col.sexo
     FROM contratos c JOIN colaboradores col ON col.id = c.colaborador_id
     WHERE c.id=$1 AND c.colaborador_id=$2`,
    [contratoId, colaboradorId]
  );
  return rows[0];
}

router.post('/', requireRole(GESTORES), async (req, res) => {
  const { colaboradorId, contratoId } = req.params;
  const {
    funciones, remuneracion_letras, horas_semanales, horas_diarias,
    dias_descanso, duracion_texto, periodo_prueba_texto,
  } = req.body;
  if (!funciones || !remuneracion_letras || !horas_semanales || !horas_diarias ||
      !dias_descanso || !duracion_texto || !periodo_prueba_texto) {
    return res.status(400).json({ error: 'todos los campos de la emisión son requeridos' });
  }

  const contrato = await cargarContrato(colaboradorId, contratoId);
  if (!contrato) return res.status(404).json({ error: 'contrato no encontrado' });
  if (contrato.tipo_contrato !== 'PRODUCTIVO') {
    return res.status(400).json({ error: 'solo se puede emitir el tipo de contrato PRODUCTIVO' });
  }
  if (!contrato.empresa) {
    return res.status(400).json({ error: 'el colaborador no tiene empresa asignada' });
  }

  const { rows: empresaRows } = await pool.query('SELECT * FROM config_empresas WHERE empresa=$1', [contrato.empresa]);
  const empresa = empresaRows[0];
  if (!empresa?.ruc || !empresa?.representante_legal || !empresa?.cedula_representante) {
    return res.status(400).json({ error: `faltan datos legales de ${contrato.empresa} en config_empresas` });
  }

  const colaborador = { nombre: contrato.nombre, cedula: contrato.cedula, cargo: contrato.cargo, sexo: contrato.sexo };
  const emision = { funciones, remuneracion_letras, horas_semanales, horas_diarias, dias_descanso, duracion_texto, periodo_prueba_texto };
  const buffer = await generarContratoProductivoDocx({ empresa, colaborador, contrato, emision });
  const key = `contratos/${contratoId}/generado-${Date.now()}.docx`;
  await subirArchivo(key, buffer, DOCX_MIME);

  const { rows } = await pool.query(
    `INSERT INTO contrato_emisiones
       (contrato_id, funciones, remuneracion_letras, horas_semanales, horas_diarias,
        dias_descanso, duracion_texto, periodo_prueba_texto, archivo_generado_key, generado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [contratoId, funciones, remuneracion_letras, horas_semanales, horas_diarias,
     dias_descanso, duracion_texto, periodo_prueba_texto, key, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.get('/:emisionId/generado', requireRole(GESTORES), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT archivo_generado_key FROM contrato_emisiones WHERE id=$1 AND contrato_id=$2',
    [req.params.emisionId, req.params.contratoId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_generado_key);
  res.set('Content-Type', DOCX_MIME);
  res.set('Content-Disposition', 'attachment; filename="contrato-productivo.docx"');
  res.send(buffer);
});

router.post(
  '/:emisionId/firmado',
  requireRole(GESTORES),
  express.raw({ type: () => true, limit: '5mb' }),
  async (req, res) => {
    if (!req.body?.length) return res.status(400).json({ error: 'archivo requerido' });
    const { rows } = await pool.query(
      'SELECT id FROM contrato_emisiones WHERE id=$1 AND contrato_id=$2',
      [req.params.emisionId, req.params.contratoId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const mime = req.headers['content-type'] ?? 'application/octet-stream';
    const key = `contratos/${req.params.contratoId}/firmado-${Date.now()}`;
    await subirArchivo(key, req.body, mime);
    const { rows: actualizado } = await pool.query(
      `UPDATE contrato_emisiones SET archivo_firmado_key=$1, archivo_firmado_mime=$2, firmado_en=now(), firmado_por=$3
       WHERE id=$4 RETURNING *`,
      [key, mime, req.usuario.id, req.params.emisionId]
    );
    res.json(actualizado[0]);
  }
);

router.get('/:emisionId/firmado', requireRole(GESTORES), async (req, res) => {
  const { rows } = await pool.query(
    'SELECT archivo_firmado_key, archivo_firmado_mime FROM contrato_emisiones WHERE id=$1 AND contrato_id=$2',
    [req.params.emisionId, req.params.contratoId]
  );
  if (rows.length === 0 || !rows[0].archivo_firmado_key) return res.status(404).json({ error: 'no encontrado' });
  const buffer = await descargarArchivo(rows[0].archivo_firmado_key);
  const extension = EXTENSIONES[rows[0].archivo_firmado_mime] || 'bin';
  res.set('Content-Type', rows[0].archivo_firmado_mime || 'application/octet-stream');
  res.set('Content-Disposition', `attachment; filename="firmado.${extension}"`);
  res.send(buffer);
});

export default router;
```

- [ ] **Step 4: Mount the router in `server/src/index.js`**

Current imports (near the top, after `documentosRouter`/`evaluacionesRouter` imports):

```js
import documentosRouter from './routes/documentos.js';
import evaluacionesRouter from './routes/evaluaciones.js';
```

Replace with:

```js
import documentosRouter from './routes/documentos.js';
import evaluacionesRouter from './routes/evaluaciones.js';
import contratoEmisionesRouter from './routes/contrato-emisiones.js';
```

Current mount lines:

```js
  app.use('/api/colaboradores/:colaboradorId/documentos', documentosRouter);
  app.use('/api/colaboradores/:colaboradorId/evaluaciones', evaluacionesRouter);
```

Replace with:

```js
  app.use('/api/colaboradores/:colaboradorId/documentos', documentosRouter);
  app.use('/api/colaboradores/:colaboradorId/evaluaciones', evaluacionesRouter);
  app.use('/api/colaboradores/:colaboradorId/contratos/:contratoId/emisiones', contratoEmisionesRouter);
```

- [ ] **Step 5: Embed `emisiones` in `GET /colaboradores/:id`**

En `server/src/routes/colaboradores.js`, el handler actual de `GET /:id`:

```js
router.get(
  '/:id',
  requireSelfOrRole(['ADMIN', 'RRHH'], (req) => req.params.id),
  async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM colaboradores WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const [contratos, rolesPago, prestamos] = await Promise.all([
      pool.query('SELECT * FROM contratos WHERE colaborador_id=$1 ORDER BY fecha_inicio DESC', [req.params.id]),
      pool.query(
        `SELECT rp.*, p.nombre AS periodo_nombre, p.fecha_fin AS periodo_fecha
         FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
         WHERE rp.colaborador_id=$1 ORDER BY p.fecha_inicio DESC`,
        [req.params.id]
      ),
      pool.query('SELECT * FROM prestamos WHERE colaborador_id=$1', [req.params.id])
    ]);
    res.json({
      ...rows[0],
      contratos: contratos.rows,
      roles_pago: rolesPago.rows,
      prestamos: prestamos.rows
    });
  }
);
```

Replace with (agrega la consulta de `emisiones` y las embebe por `contrato_id`):

```js
router.get(
  '/:id',
  requireSelfOrRole(['ADMIN', 'RRHH'], (req) => req.params.id),
  async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM colaboradores WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const [contratos, rolesPago, prestamos, emisiones] = await Promise.all([
      pool.query('SELECT * FROM contratos WHERE colaborador_id=$1 ORDER BY fecha_inicio DESC', [req.params.id]),
      pool.query(
        `SELECT rp.*, p.nombre AS periodo_nombre, p.fecha_fin AS periodo_fecha
         FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
         WHERE rp.colaborador_id=$1 ORDER BY p.fecha_inicio DESC`,
        [req.params.id]
      ),
      pool.query('SELECT * FROM prestamos WHERE colaborador_id=$1', [req.params.id]),
      pool.query(
        `SELECT ce.* FROM contrato_emisiones ce
         JOIN contratos c ON c.id = ce.contrato_id
         WHERE c.colaborador_id=$1 ORDER BY ce.generado_en DESC`,
        [req.params.id]
      )
    ]);
    res.json({
      ...rows[0],
      contratos: contratos.rows.map((c) => ({
        ...c,
        emisiones: emisiones.rows.filter((e) => e.contrato_id === c.id)
      })),
      roles_pago: rolesPago.rows,
      prestamos: prestamos.rows
    });
  }
);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm -w server test -- contrato-emisiones.test.js`
Expected: PASS.

- [ ] **Step 7: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS — presta especial atención a `colaboradores.test.js` (el shape de `GET /:id` cambió: `contratos` ahora trae `emisiones` embebido, pero sigue siendo un superset — cualquier test que solo lea campos existentes de `contratos` sigue funcionando).

- [ ] **Step 8: Commit**

```bash
git add server/src/routes/contrato-emisiones.js server/src/index.js server/src/routes/colaboradores.js server/tests/contrato-emisiones.test.js
git commit -m "feat: rutas de emisión de contratos (generar, descargar, subir/descargar firmado)"
```

---

### Task 5: UI — emitir, descargar y subir firmado desde la pestaña Contratos

**Files:**
- Modify: `client/src/pages/ColaboradorDetalle.jsx`

**Interfaces:**
- Consumes: `POST/GET .../emisiones` y `POST/GET .../emisiones/:id/{generado,firmado}` (Task 4); `col.contratos[].emisiones` embebido en `GET /colaboradores/:id` (Task 4).

No hay tests unitarios de UI en este proyecto (mismo patrón que el resto de pestañas) — se verifica con `npm -w client run build` + checklist manual.

- [ ] **Step 1: Add `EmitirContratoModal`, right before `ContratosTab`**

Ubicación actual — justo antes de `function ContratosTab({ col, onCambio, onError }) {` (línea 140). Agrega este componente nuevo inmediatamente antes:

```jsx
function EmitirContratoModal({ contrato, colaboradorId, onClose, onEmitido, onError }) {
  const [form, setForm] = useState({
    funciones: '', remuneracion_letras: '', horas_semanales: '', horas_diarias: '',
    dias_descanso: '', duracion_texto: '', periodo_prueba_texto: '',
  });
  const [enviando, setEnviando] = useState(false);

  const campo = (k, props = {}) => (
    <input className="input w-full" value={form[k]} {...props}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );

  const emitir = async (e) => {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post(`/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones`, form);
      onEmitido();
    } catch (err) {
      onError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Emitir contrato productivo" size="lg"
      footer={
        <>
          <button type="button" onClick={onClose} className="btn btn-secondary">Cancelar</button>
          <button form="form-emitir-contrato" disabled={enviando} className="btn btn-primary">
            {enviando ? 'Generando…' : 'Generar y descargar'}
          </button>
        </>
      }>
      <form id="form-emitir-contrato" onSubmit={emitir} className="grid gap-3">
        <label className="text-sm text-slate-600">Funciones del cargo (una por línea)
          <textarea required rows={4} className="input w-full"
            value={form.funciones} onChange={(e) => setForm({ ...form, funciones: e.target.value })} />
        </label>
        <label className="text-sm text-slate-600">Remuneración en letras (ej. SEISCIENTOS 00/100)
          {campo('remuneracion_letras', { required: true })}
        </label>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm text-slate-600">Horas semanales (ej. cuarenta)
            {campo('horas_semanales', { required: true })}
          </label>
          <label className="text-sm text-slate-600">Horas diarias (ej. Ocho)
            {campo('horas_diarias', { required: true })}
          </label>
          <label className="text-sm text-slate-600">Días de descanso (ej. Dos)
            {campo('dias_descanso', { required: true })}
          </label>
        </div>
        <label className="text-sm text-slate-600">Duración del contrato
          {campo('duracion_texto', { required: true })}
        </label>
        <label className="text-sm text-slate-600">Período de prueba
          {campo('periodo_prueba_texto', { required: true })}
        </label>
      </form>
    </Modal>
  );
}

function EmisionCell({ contrato, colaboradorId, onCambio, onError }) {
  const [modalAbierto, setModalAbierto] = useState(false);
  if (contrato.tipo_contrato !== 'PRODUCTIVO') {
    return <span className="text-slate-400 text-xs" title="Plantilla no disponible aún">—</span>;
  }

  const subirFirmado = async (emisionId, e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return onError('El archivo supera los 5 MB');
    const res = await fetch(
      `/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones/${emisionId}/firmado`,
      { method: 'POST', credentials: 'include', headers: { 'Content-Type': archivo.type || 'application/octet-stream' }, body: archivo }
    );
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    e.target.value = '';
    onCambio();
  };

  const ultima = contrato.emisiones?.[0];

  return (
    <div className="flex flex-col items-start gap-1">
      {ultima && (
        <a href={`/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones/${ultima.id}/generado`}
          className="text-xs text-gold-600 hover:underline flex items-center gap-1">
          <Download size={12} /> Generado
        </a>
      )}
      {ultima && (
        ultima.archivo_firmado_key ? (
          <a href={`/api/colaboradores/${colaboradorId}/contratos/${contrato.id}/emisiones/${ultima.id}/firmado`}
            className="text-xs text-emerald-700 hover:underline flex items-center gap-1">
            <Download size={12} /> Firmado
          </a>
        ) : (
          <label className="text-xs text-slate-500 cursor-pointer hover:text-gold-600">
            Subir firmado
            <input type="file" className="hidden" onChange={(e) => subirFirmado(ultima.id, e)} />
          </label>
        )
      )}
      <button type="button" onClick={() => setModalAbierto(true)} className="text-xs text-slate-500 hover:text-gold-600">
        {ultima ? 'Reemitir' : 'Emitir contrato'}
      </button>
      {modalAbierto && (
        <EmitirContratoModal
          contrato={contrato}
          colaboradorId={colaboradorId}
          onClose={() => setModalAbierto(false)}
          onEmitido={() => { setModalAbierto(false); onCambio(); }}
          onError={onError}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add the "Emisión" column to `ContratosTab`'s table**

Current table (dentro de `ContratosTab`, líneas 180-199):

```jsx
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Sueldo</th><th className="p-3">Desde</th><th className="p-3">Hasta</th><th className="p-3">Tipo</th><th className="p-3">Notas</th>
            </tr>
          </thead>
          <tbody>
            {col.contratos.map((c) => (
              <tr key={c.id} className="border-b border-slate-200">
                <td className="p-3 font-medium">{money(c.sueldo_base)}</td>
                <td className="p-3">{fecha(c.fecha_inicio)}</td>
                <td className="p-3">{c.fecha_fin ? fecha(c.fecha_fin) : <span className="badge bg-emerald-100 text-emerald-700">VIGENTE</span>}</td>
                <td className="p-3">{tiposContrato.find((t) => t.codigo === c.tipo_contrato)?.nombre ?? c.tipo_contrato ?? '—'}</td>
                <td className="p-3 text-slate-500">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
```

Replace with (agrega la columna "Emisión"):

```jsx
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Sueldo</th><th className="p-3">Desde</th><th className="p-3">Hasta</th><th className="p-3">Tipo</th><th className="p-3">Notas</th><th className="p-3">Emisión</th>
            </tr>
          </thead>
          <tbody>
            {col.contratos.map((c) => (
              <tr key={c.id} className="border-b border-slate-200">
                <td className="p-3 font-medium">{money(c.sueldo_base)}</td>
                <td className="p-3">{fecha(c.fecha_inicio)}</td>
                <td className="p-3">{c.fecha_fin ? fecha(c.fecha_fin) : <span className="badge bg-emerald-100 text-emerald-700">VIGENTE</span>}</td>
                <td className="p-3">{tiposContrato.find((t) => t.codigo === c.tipo_contrato)?.nombre ?? c.tipo_contrato ?? '—'}</td>
                <td className="p-3 text-slate-500">{c.notas || '—'}</td>
                <td className="p-3">
                  <EmisionCell contrato={c} colaboradorId={col.id} onCambio={onCambio} onError={onError} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
```

- [ ] **Step 3: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 4: Manual verification**

Con el servidor corriendo (`npm run dev` en la raíz) y las variables `STORAGE_*` configuradas en `server/.env`:

1. Ve a un colaborador con `empresa` asignada (BOPELUAL S.A. o CARROS-YA S.A.) y crea un contrato con tipo "Contrato productivo".
2. En la pestaña Contratos, confirma que esa fila muestra el botón "Emitir contrato" y las demás filas (otros tipos) muestran "—".
3. Click "Emitir contrato", llena el formulario y genera — confirma que aparece el link "Generado" y que al hacer click descarga un .docx válido (ábrelo en Word y confirma que los datos de empresa/colaborador/funciones aparecen correctos).
4. Usa "Subir firmado" con cualquier PDF de prueba — confirma que aparece el link "Firmado" reemplazando el control de subida, y que descargarlo trae el mismo archivo con el content-type correcto.
5. Click "Reemitir" y confirma que se puede generar una segunda emisión sin perder la anterior (recárgala en la BD o vía `GET /colaboradores/:id` si quieres confirmar el historial).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ColaboradorDetalle.jsx
git commit -m "feat: emitir, descargar y subir firmado de contratos desde la ficha del colaborador"
```

---

## Final Check

- [ ] Run `npm -w server test` — full suite green.
- [ ] Run `npm -w client run build` — compiles clean.
- [ ] Confirm `server/.env` has the real `STORAGE_*` values (not committed) and set the same variables on the Railway service (`use-railway` skill) before deploying.
- [ ] Push the branch: `git push`.
