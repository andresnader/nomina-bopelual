# Nómina BOPELUAL — Plan de Implementación (Fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el sistema web de nómina quincenal standalone de BOPELUAL SA (Fase 1) según el spec aprobado `docs/superpowers/specs/2026-07-02-nomina-design.md`.

**Architecture:** Monorepo `client/` (React+Vite+Tailwind) + `server/` (Express REST). PostgreSQL en Railway con migraciones SQL aplicadas al arrancar. La lógica de negocio de mayor riesgo (cálculos de Ecuador y ciclo de vida del período) vive en **funciones puras sin BD** para poder probarse con TDD estricto; la capa de rutas/servicios es una envoltura delgada sobre esas funciones + `pg`.

**Tech Stack:** Node 20 + Express 4 + `pg` + `google-auth-library` · React 18 + Vite 5 + Tailwind 3 + react-router 6 + lucide-react · Vitest + Supertest + @testing-library/react.

## Global Constraints

- **Moneda/redondeo:** todos los montos son `numeric(12,2)`. Redondeo bancario a 2 decimales con el helper `round2` (Task 8). Nunca comparar floats por igualdad sin redondear.
- **Tasas Ecuador (valores exactos, no inventar otros):** IESS personal `0.0945`, IESS patronal `0.1215`, fondos de reserva `0.0833`, retención fuente proveedores `0.10`, utilidades `0.15`. Estas viven en `server/src/lib/tasas.js` como constantes nombradas — ninguna otra parte del código escribe el número literal.
- **SBU (Salario Básico Unificado):** parámetro configurable, NO hardcodeado en cálculos. Default de arranque `460.00`, editable por ADMIN en Configuración.
- **Estado CERRADO es irreversible:** ninguna transición sale de `CERRADO`. Ninguna `linea_rol` se crea/edita/borra si su período no está en `BORRADOR`.
- **Neto se deriva, no se guarda plano:** `neto = Σ(ingresos no-provisión) − Σ(descuentos)`. Las provisiones (`es_provision=true`) son ingresos contables y se EXCLUYEN del neto en efectivo.
- **Roles:** `ADMIN`, `RRHH`, `COLABORADOR`, `GERENCIA`. Todo endpoint pasa por `requireRole([...])`. `COLABORADOR` solo accede a datos de su propio `colaborador_id`.
- **Auth:** Google SSO restringido al dominio del Workspace (variable `ALLOWED_EMAIL_DOMAIN`). Sin usuario en tabla `usuarios` con `activo=true` → 403.
- **Identidad visual:** tokens Tailwind `brand-dark` (#0f172a), `brand-yellow` (#ffca3f), `brand-darker` (#0a0a0a); Inter (cuerpo) + Manrope (titulares); sidebar oscuro en escritorio + bottom nav en móvil.
- **Idioma:** identificadores de dominio, columnas y rutas en español (`colaboradores`, `roles_pago`). Comentarios y copy de UI en español.
- **Commits frecuentes:** un commit por tarea como mínimo, mensaje `feat:` / `test:` / `chore:`.

## File Structure

```
nomina-bopelual/
  package.json                 # scripts raíz (dev, test) — npm workspaces
  .env.example
  server/
    package.json
    vitest.config.js
    src/
      index.js                 # bootstrap Express, corre migraciones, monta rutas
      config.js                # lee env: DATABASE_URL, GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN
      db/pool.js               # pg.Pool singleton
      db/migrate.js            # runner idempotente de db/migrations/*.sql
      lib/tasas.js             # constantes de tasas Ecuador (Global Constraints)
      lib/round.js             # round2
      lib/calculo.js           # motor de cálculo PURO (Fase 3)
      lib/periodo-fsm.js       # máquina de estados PURA del período (Fase 4)
      auth/google.js           # verifica ID token de Google
      auth/middleware.js       # requireAuth, requireRole, requireSelfOrRole
      services/periodos.js     # crear/generar/aprobar/cerrar (usa periodo-fsm + pool)
      services/roles.js        # recalcularTotales de un rol_pago
      routes/auth.js
      routes/colaboradores.js
      routes/contratos.js
      routes/periodos.js
      routes/roles.js          # roles_pago + lineas_rol
      routes/prestamos.js
      routes/facturas.js
      routes/provisiones.js
      routes/reportes.js       # CSV
      routes/usuarios.js       # ADMIN: config usuarios + parámetros
    db/
      schema.sql               # bootstrap destructivo (solo dev)
      migrations/001_init.sql
    tests/
      helpers/db.js            # test DB + rollback por test
      helpers/app.js           # app express montada + token fake
      calculo.test.js
      periodo-fsm.test.js
      auth.test.js
      periodos.test.js
      colaboradores.test.js
      prestamos.test.js
      facturas.test.js
      reportes.test.js
  client/
    package.json
    vite.config.js
    tailwind.config.js
    postcss.config.js
    index.html
    src/
      main.jsx
      App.jsx                  # rutas + guards por rol
      index.css                # @tailwind + fuentes
      api.js                   # wrapper fetch con token
      auth/AuthContext.jsx
      components/Layout.jsx     # sidebar + bottom nav
      components/Card.jsx
      components/KpiCard.jsx
      components/PageTitle.jsx
      components/Badge.jsx      # badges de estado (BORRADOR/APROBADO/CERRADO...)
      components/RoleGate.jsx
      pages/Login.jsx
      pages/Dashboard.jsx
      pages/Colaboradores.jsx
      pages/ColaboradorDetalle.jsx
      pages/Periodos.jsx
      pages/PeriodoDetalle.jsx
      pages/RolPago.jsx
      pages/Proveedores.jsx
      pages/Prestamos.jsx
      pages/Reportes.jsx
      pages/Configuracion.jsx
    tests/
      calculo-ui.test.jsx      # (opcional) formateo de moneda
      Badge.test.jsx
```

---

## FASE 0 — Scaffold y tooling

### Task 0: Estructura del monorepo y arranque en verde

**Files:**
- Create: `package.json`, `.env.example`, `.gitignore`
- Create: `server/package.json`, `server/vitest.config.js`, `server/src/config.js`, `server/src/index.js`
- Create: `client/package.json`, `client/vite.config.js`, `client/index.html`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/index.css`, `client/tailwind.config.js`, `client/postcss.config.js`
- Test: `server/tests/smoke.test.js`

**Interfaces:**
- Produces: `server/src/config.js` exporta `{ PORT, DATABASE_URL, DATABASE_URL_TEST, GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN }` leídos de `process.env`. `server/src/index.js` exporta `createApp()` (retorna instancia express SIN escuchar) y arranca `listen` solo si es el módulo principal.

- [ ] **Step 1: Raíz — `package.json` con workspaces**

```json
{
  "name": "nomina-bopelual",
  "private": true,
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client \"npm -w server run dev\" \"npm -w client run dev\"",
    "test": "npm -w server test && npm -w client test"
  },
  "devDependencies": { "concurrently": "^9.0.0" }
}
```

- [ ] **Step 2: `.gitignore` y `.env.example`**

`.gitignore`:
```
node_modules/
.env
dist/
.DS_Store
```

`.env.example`:
```
DATABASE_URL=postgresql://user:pass@localhost:5432/nomina
DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/nomina_test
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
ALLOWED_EMAIL_DOMAIN=bopelual.com
PORT=3001
```

- [ ] **Step 3: `server/package.json`**

```json
{
  "name": "server",
  "type": "module",
  "scripts": {
    "dev": "node --watch src/index.js",
    "start": "node src/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.19.2",
    "pg": "^8.12.0",
    "cors": "^2.8.5",
    "google-auth-library": "^9.11.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "supertest": "^7.0.0"
  }
}
```

- [ ] **Step 4: `server/src/config.js`**

```js
import 'dotenv/config';

export const PORT = process.env.PORT || 3001;
export const DATABASE_URL = process.env.DATABASE_URL;
export const DATABASE_URL_TEST = process.env.DATABASE_URL_TEST;
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
export const ALLOWED_EMAIL_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN;
```

(Añadir `dotenv` a dependencies del server.)

- [ ] **Step 5: `server/src/index.js` con `createApp()` testeable**

```js
import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}

// Arranca solo si se ejecuta directamente (no en tests)
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  createApp().listen(PORT, () => console.log(`API en :${PORT}`));
}
```

- [ ] **Step 6: `server/vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node', include: ['tests/**/*.test.js'] } });
```

- [ ] **Step 7: Test de humo — `server/tests/smoke.test.js`**

```js
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/index.js';

describe('health', () => {
  it('GET /api/health responde ok', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 8: Instalar y correr**

Run: `npm install && npm -w server test`
Expected: PASS (1 test).

- [ ] **Step 9: Client mínimo — Vite + Tailwind**

`client/package.json`:
```json
{
  "name": "client",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "test": "vitest run" },
  "dependencies": {
    "react": "^18.3.1", "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0", "lucide-react": "^0.400.0"
  },
  "devDependencies": {
    "vite": "^5.3.0", "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^3.4.0", "postcss": "^8.4.0", "autoprefixer": "^10.4.0",
    "vitest": "^2.0.0", "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.4.0", "jsdom": "^24.0.0"
  }
}
```

`client/tailwind.config.js`:
```js
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: { 'brand-dark': '#0f172a', 'brand-yellow': '#ffca3f', 'brand-darker': '#0a0a0a' },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'], display: ['Manrope', 'sans-serif'] }
    }
  },
  plugins: []
};
```

`client/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`client/vite.config.js`:
```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  test: { environment: 'jsdom', globals: true, setupFiles: './tests/setup.js' }
});
```

`client/tests/setup.js`:
```js
import '@testing-library/jest-dom';
```

`client/index.html`:
```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nómina BOPELUAL</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@600;700;800&display=swap" rel="stylesheet" />
  </head>
  <body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body>
</html>
```

`client/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
body { @apply bg-brand-darker text-slate-100 font-sans; }
```

`client/src/main.jsx`:
```jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode><BrowserRouter><App /></BrowserRouter></React.StrictMode>
);
```

`client/src/App.jsx` (placeholder, se expande en Fase 9-10):
```jsx
export default function App() {
  return <div className="p-8 font-display text-2xl">Nómina BOPELUAL</div>;
}
```

- [ ] **Step 10: Verificar build del client**

Run: `npm -w client run build`
Expected: build sin errores (genera `client/dist`).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "chore: scaffold monorepo server+client con vitest y tailwind"
```

---

## FASE 1 — Base de datos

### Task 1: Schema, migraciones y runner idempotente

**Files:**
- Create: `server/db/schema.sql`, `server/db/migrations/001_init.sql`
- Create: `server/src/db/pool.js`, `server/src/db/migrate.js`
- Create: `server/tests/helpers/db.js`
- Test: `server/tests/migrate.test.js`

**Interfaces:**
- Produces: `pool` (default export de `db/pool.js`, un `pg.Pool`). `runMigrations(pool)` (de `db/migrate.js`) crea tabla `_migraciones` si falta y aplica en orden los `.sql` no aplicados; idempotente. `helpers/db.js` exporta `withRollback(fn)` que corre `fn(client)` dentro de una transacción y hace ROLLBACK al final (aislamiento de tests).

- [ ] **Step 1: `server/db/migrations/001_init.sql`** — las 9 tablas del spec + `usuarios`

```sql
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  nombre text,
  rol text NOT NULL CHECK (rol IN ('ADMIN','RRHH','COLABORADOR','GERENCIA')),
  colaborador_id uuid,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('IESS','EXTERNO')),
  cedula text UNIQUE,
  nombre text NOT NULL,
  email text,
  departamento text,
  cargo text,
  fecha_ingreso date,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  sueldo_base numeric(12,2) NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date,
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE periodos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  fecha_inicio date NOT NULL,
  fecha_fin date NOT NULL,
  quincena int NOT NULL CHECK (quincena IN (1,2)),
  estado text NOT NULL DEFAULT 'BORRADOR' CHECK (estado IN ('BORRADOR','APROBADO','CERRADO')),
  creado_por uuid REFERENCES usuarios(id),
  aprobado_por uuid REFERENCES usuarios(id),
  cerrado_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  periodo_id uuid NOT NULL REFERENCES periodos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id),
  total_ingresos numeric(12,2) NOT NULL DEFAULT 0,
  total_descuentos numeric(12,2) NOT NULL DEFAULT 0,
  neto numeric(12,2) NOT NULL DEFAULT 0,
  estado_pago text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado_pago IN ('PENDIENTE','PAGADO')),
  pagado_en timestamptz,
  UNIQUE (periodo_id, colaborador_id)
);

CREATE TABLE lineas_rol (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rol_pago_id uuid NOT NULL REFERENCES roles_pago(id) ON DELETE CASCADE,
  tipo_linea text NOT NULL,
  clase text NOT NULL CHECK (clase IN ('INGRESO','DESCUENTO')),
  monto numeric(12,2) NOT NULL,
  descripcion text,
  es_provision boolean NOT NULL DEFAULT false,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE provisiones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  anio int NOT NULL,
  decimo_tercero numeric(12,2) NOT NULL DEFAULT 0,
  decimo_cuarto numeric(12,2) NOT NULL DEFAULT 0,
  fondos_reserva numeric(12,2) NOT NULL DEFAULT 0,
  utilidades numeric(12,2) NOT NULL DEFAULT 0,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (colaborador_id, anio)
);

CREATE TABLE prestamos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  monto_total numeric(12,2) NOT NULL,
  cuota_quincena numeric(12,2) NOT NULL,
  saldo_pendiente numeric(12,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  fecha_inicio date NOT NULL,
  notas text
);

CREATE TABLE facturas_proveedor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id),
  periodo_id uuid REFERENCES periodos(id),
  numero_factura text,
  fecha_factura date,
  monto_bruto numeric(12,2) NOT NULL,
  retencion_10pct numeric(12,2) NOT NULL,
  neto numeric(12,2) NOT NULL,
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PAGADA')),
  pagada_en timestamptz
);

CREATE TABLE parametros (
  clave text PRIMARY KEY,
  valor text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
INSERT INTO parametros (clave, valor) VALUES ('SBU','460.00') ON CONFLICT DO NOTHING;
```

> Nota de diseño: se añaden `periodos.quincena` (1|2, necesario para el anticipo) y la tabla `parametros` (SBU y futuros ajustes de config por ADMIN, cubre "parámetros IESS" de la pantalla Configuración). Ambos son necesarios para cálculos del spec §4.

- [ ] **Step 2: `server/db/schema.sql`** — bootstrap destructivo para dev

```sql
-- SOLO DESARROLLO: recrea todo. Producción usa migraciones.
DROP TABLE IF EXISTS lineas_rol, roles_pago, facturas_proveedor, prestamos,
  provisiones, contratos, periodos, colaboradores, usuarios, parametros, _migraciones CASCADE;
\i migrations/001_init.sql
```

- [ ] **Step 3: `server/src/db/pool.js`**

```js
import pg from 'pg';
import { DATABASE_URL, DATABASE_URL_TEST } from '../config.js';

const connectionString = process.env.NODE_ENV === 'test' ? DATABASE_URL_TEST : DATABASE_URL;
const pool = new pg.Pool({ connectionString });
export default pool;
```

- [ ] **Step 4: `server/src/db/migrate.js`**

```js
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations');

export async function runMigrations(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS _migraciones (
    nombre text PRIMARY KEY, aplicada_en timestamptz NOT NULL DEFAULT now())`);
  const { rows } = await pool.query('SELECT nombre FROM _migraciones');
  const aplicadas = new Set(rows.map((r) => r.nombre));
  const archivos = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = await readFile(join(migrationsDir, archivo), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migraciones (nombre) VALUES ($1)', [archivo]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }
}
```

- [ ] **Step 5: `server/tests/helpers/db.js`**

```js
import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

let migrated = false;
export async function ensureMigrated() {
  if (!migrated) { await runMigrations(pool); migrated = true; }
}

// Corre fn dentro de una transacción y siempre hace ROLLBACK (aísla el test).
export async function withRollback(fn) {
  await ensureMigrated();
  const client = await pool.connect();
  try { await client.query('BEGIN'); return await fn(client); }
  finally { await client.query('ROLLBACK'); client.release(); }
}
```

- [ ] **Step 6: Test — `server/tests/migrate.test.js`**

```js
import { describe, it, expect, beforeAll } from 'vitest';
import pool from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

describe('migraciones', () => {
  beforeAll(async () => { await runMigrations(pool); });

  it('crea las tablas del dominio', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`);
    const nombres = rows.map((r) => r.table_name);
    for (const t of ['colaboradores','contratos','periodos','roles_pago','lineas_rol',
      'provisiones','prestamos','facturas_proveedor','usuarios','parametros']) {
      expect(nombres).toContain(t);
    }
  });

  it('es idempotente (segunda corrida no falla)', async () => {
    await expect(runMigrations(pool)).resolves.not.toThrow();
  });
});
```

- [ ] **Step 7: Verificar (requiere Postgres de test corriendo)**

Run: `NODE_ENV=test DATABASE_URL_TEST=postgresql://localhost:5432/nomina_test npm -w server test tests/migrate.test.js`
Expected: PASS (2 tests). Si no hay Postgres local, documentar en README que `DATABASE_URL_TEST` debe apuntar a una BD vacía.

- [ ] **Step 8: Montar migraciones en el arranque — editar `server/src/index.js`**

Añadir antes de `listen`:
```js
import pool from './db/pool.js';
import { runMigrations } from './db/migrate.js';
// ...dentro del bloque de arranque directo:
await runMigrations(pool);
```

- [ ] **Step 9: Commit**

```bash
git add server/db server/src/db server/tests/helpers server/tests/migrate.test.js server/src/index.js
git commit -m "feat: schema, migraciones idempotentes y helper de rollback en tests"
```

---

## FASE 2 — Autenticación y autorización

### Task 2: Google SSO + middleware de roles

**Files:**
- Create: `server/src/auth/google.js`, `server/src/auth/middleware.js`, `server/src/routes/auth.js`
- Test: `server/tests/auth.test.js`

**Interfaces:**
- Produces:
  - `verifyGoogleToken(idToken) → { email, nombre }` (de `auth/google.js`) — lanza si el token es inválido o el dominio no coincide con `ALLOWED_EMAIL_DOMAIN`.
  - `requireAuth(req,res,next)` — lee `Authorization: Bearer <idToken>`, verifica, busca `usuarios` por email con `activo=true`, setea `req.usuario = { id, email, rol, colaborador_id }`, o responde 401/403.
  - `requireRole(rolesPermitidos)(req,res,next)` — 403 si `req.usuario.rol` no está en la lista.
  - `requireSelfOrRole(rolesPermitidos, getColaboradorId)(req,res,next)` — permite si el rol está en la lista, o si `req.usuario.colaborador_id === await getColaboradorId(req)`.
  - Para inyectar en tests sin llamar a Google: `requireAuth` usa `verifyGoogleToken` importado del mismo módulo; los tests lo mockean con `vi.mock`.

- [ ] **Step 1: `server/src/auth/google.js`**

```js
import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN } from '../config.js';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

export async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  const email = payload?.email;
  if (!email) throw new Error('token sin email');
  const dominio = email.split('@')[1];
  if (ALLOWED_EMAIL_DOMAIN && dominio !== ALLOWED_EMAIL_DOMAIN) {
    throw new Error('dominio no autorizado');
  }
  return { email, nombre: payload.name };
}
```

- [ ] **Step 2: `server/src/auth/middleware.js`**

```js
import pool from '../db/pool.js';
import { verifyGoogleToken } from './google.js';

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'falta token' });
  let datos;
  try { datos = await verifyGoogleToken(token); }
  catch { return res.status(401).json({ error: 'token inválido' }); }
  const { rows } = await pool.query(
    'SELECT id, email, rol, colaborador_id FROM usuarios WHERE email=$1 AND activo=true', [datos.email]);
  if (rows.length === 0) return res.status(403).json({ error: 'usuario no autorizado' });
  req.usuario = rows[0];
  next();
}

export function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario?.rol))
      return res.status(403).json({ error: 'rol insuficiente' });
    next();
  };
}

export function requireSelfOrRole(rolesPermitidos, getColaboradorId) {
  return async (req, res, next) => {
    if (rolesPermitidos.includes(req.usuario?.rol)) return next();
    const objetivo = await getColaboradorId(req);
    if (req.usuario?.colaborador_id && req.usuario.colaborador_id === objetivo) return next();
    return res.status(403).json({ error: 'acceso denegado' });
  };
}
```

- [ ] **Step 3: `server/src/routes/auth.js`** — endpoint `GET /api/auth/me`

```js
import { Router } from 'express';
import { requireAuth } from '../auth/middleware.js';

const router = Router();
router.get('/me', requireAuth, (req, res) => res.json(req.usuario));
export default router;
```

Montar en `createApp()`: `app.use('/api/auth', authRouter);`

- [ ] **Step 4: Escribir el test que falla — `server/tests/auth.test.js`**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async (t) => {
    if (t === 'valido') return { email: 'ana@bopelual.com', nombre: 'Ana' };
    throw new Error('inválido');
  })
}));

// Import DESPUÉS del mock
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;

describe('auth', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, nombre, rol) VALUES
      ('ana@bopelual.com','Ana','RRHH') ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('401 sin token', async () => {
    const res = await request(createApp()).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('401 con token inválido', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer malo');
    expect(res.status).toBe(401);
  });

  it('200 y devuelve el usuario con token válido', async () => {
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer valido');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('ana@bopelual.com');
    expect(res.body.rol).toBe('RRHH');
  });

  it('403 si el email no está en usuarios activos', async () => {
    await pool.query(`UPDATE usuarios SET activo=false WHERE email='ana@bopelual.com'`);
    const res = await request(createApp()).get('/api/auth/me').set('Authorization', 'Bearer valido');
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 5: Correr — verificar rojo→verde**

Run: `NODE_ENV=test npm -w server test tests/auth.test.js`
Expected: primero FAIL si falta montar el router; tras Step 3, PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/auth server/src/routes/auth.js server/tests/auth.test.js server/src/index.js
git commit -m "feat: auth Google SSO con middleware de roles y self-access"
```

---

## FASE 3 — Motor de cálculo (PURO, corazón del sistema)

### Task 3: Constantes de tasas y `round2`

**Files:**
- Create: `server/src/lib/tasas.js`, `server/src/lib/round.js`
- Test: `server/tests/round.test.js`

**Interfaces:**
- Produces: `TASAS = { IESS_PERSONAL:0.0945, IESS_PATRONAL:0.1215, FONDOS_RESERVA:0.0833, RETENCION_FUENTE:0.10, UTILIDADES:0.15 }` (de `tasas.js`). `round2(n) → number` (de `round.js`), redondeo a 2 decimales estable.

- [ ] **Step 1: `server/src/lib/tasas.js`**

```js
export const TASAS = Object.freeze({
  IESS_PERSONAL: 0.0945,
  IESS_PATRONAL: 0.1215,
  FONDOS_RESERVA: 0.0833,
  RETENCION_FUENTE: 0.10,
  UTILIDADES: 0.15
});
```

- [ ] **Step 2: Test — `server/tests/round.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { round2 } from '../src/lib/round.js';

describe('round2', () => {
  it('redondea a 2 decimales', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(9.454)).toBe(9.45);
    expect(round2(9.456)).toBe(9.46);
  });
  it('no arrastra error de float', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
```

- [ ] **Step 3: `server/src/lib/round.js`**

```js
export function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
```

- [ ] **Step 4: Correr**

Run: `npm -w server test tests/round.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/tasas.js server/src/lib/round.js server/tests/round.test.js
git commit -m "feat: constantes de tasas Ecuador y helper round2"
```

### Task 4: Cálculos individuales de Ecuador

**Files:**
- Create: `server/src/lib/calculo.js`
- Test: `server/tests/calculo.test.js`

**Interfaces:**
- Produces (todas puras, retornan `number` redondeado con `round2`):
  - `iessPersonal(sueldoBase) → number` (9.45%)
  - `iessPatronal(sueldoBase) → number` (12.15%, para reportes)
  - `fondosReserva(sueldoBase, mesesAfiliado) → number` (8.33% solo si `mesesAfiliado > 12`, si no `0`)
  - `decimoTercero(sueldoBase) → number` (`sueldoBase/12`)
  - `decimoCuarto(sbu) → number` (`sbu/12`)
  - `retencionProveedor(montoBruto) → { retencion, neto }` (retención 10%)
  - `cuotaPrestamo(cuota, saldoPendiente) → { aplicada, saldoNuevo, activo }` (`aplicada = min(cuota, saldo)`)
  - `anticipoQuincena(sueldoBase) → number` (50% del sueldo base)

- [ ] **Step 1: Escribir los tests que fallan — `server/tests/calculo.test.js`**

```js
import { describe, it, expect } from 'vitest';
import * as calc from '../src/lib/calculo.js';

describe('cálculos IESS', () => {
  it('aporte personal 9.45%', () => expect(calc.iessPersonal(1000)).toBe(94.5));
  it('aporte patronal 12.15%', () => expect(calc.iessPatronal(1000)).toBe(121.5));
});

describe('fondos de reserva', () => {
  it('cero antes del mes 13', () => expect(calc.fondosReserva(1000, 12)).toBe(0));
  it('8.33% a partir del mes 13', () => expect(calc.fondosReserva(1000, 13)).toBe(83.3));
});

describe('décimos', () => {
  it('décimo tercero = sueldo/12', () => expect(calc.decimoTercero(1200)).toBe(100));
  it('décimo cuarto = SBU/12', () => expect(calc.decimoCuarto(460)).toBe(38.33));
});

describe('retención proveedor 10%', () => {
  it('separa retención y neto', () => {
    expect(calc.retencionProveedor(500)).toEqual({ retencion: 50, neto: 450 });
  });
});

describe('cuota de préstamo', () => {
  it('aplica la cuota completa si hay saldo', () => {
    expect(calc.cuotaPrestamo(100, 500)).toEqual({ aplicada: 100, saldoNuevo: 400, activo: true });
  });
  it('no descuenta más que el saldo y desactiva al saldar', () => {
    expect(calc.cuotaPrestamo(100, 60)).toEqual({ aplicada: 60, saldoNuevo: 0, activo: false });
  });
});

describe('anticipo quincena', () => {
  it('50% del sueldo base', () => expect(calc.anticipoQuincena(1000)).toBe(500));
});
```

- [ ] **Step 2: Correr — verificar que fallan**

Run: `npm -w server test tests/calculo.test.js`
Expected: FAIL ("does not provide an export named ...").

- [ ] **Step 3: Implementar `server/src/lib/calculo.js`**

```js
import { TASAS } from './tasas.js';
import { round2 } from './round.js';

export const iessPersonal = (sueldoBase) => round2(sueldoBase * TASAS.IESS_PERSONAL);
export const iessPatronal = (sueldoBase) => round2(sueldoBase * TASAS.IESS_PATRONAL);

export const fondosReserva = (sueldoBase, mesesAfiliado) =>
  mesesAfiliado > 12 ? round2(sueldoBase * TASAS.FONDOS_RESERVA) : 0;

export const decimoTercero = (sueldoBase) => round2(sueldoBase / 12);
export const decimoCuarto = (sbu) => round2(sbu / 12);

export function retencionProveedor(montoBruto) {
  const retencion = round2(montoBruto * TASAS.RETENCION_FUENTE);
  return { retencion, neto: round2(montoBruto - retencion) };
}

export function cuotaPrestamo(cuota, saldoPendiente) {
  const aplicada = Math.min(cuota, saldoPendiente);
  const saldoNuevo = round2(saldoPendiente - aplicada);
  return { aplicada: round2(aplicada), saldoNuevo, activo: saldoNuevo > 0 };
}

export const anticipoQuincena = (sueldoBase) => round2(sueldoBase * 0.5);
```

- [ ] **Step 4: Correr — verde**

Run: `npm -w server test tests/calculo.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/calculo.js server/tests/calculo.test.js
git commit -m "feat: cálculos individuales IESS, provisiones, retención, préstamo, anticipo"
```

### Task 5: Totales del rol de pago (derivación del neto)

**Files:**
- Modify: `server/src/lib/calculo.js` (añadir `calcularTotales`)
- Test: `server/tests/calculo.test.js` (añadir bloque)

**Interfaces:**
- Produces: `calcularTotales(lineas) → { totalIngresos, totalDescuentos, totalProvisiones, neto }`.
  - `lineas` es `Array<{ clase:'INGRESO'|'DESCUENTO', monto:number, es_provision:boolean }>`.
  - `totalIngresos = Σ monto (clase INGRESO && !es_provision)`
  - `totalProvisiones = Σ monto (es_provision)`
  - `totalDescuentos = Σ monto (clase DESCUENTO)`
  - `neto = round2(totalIngresos − totalDescuentos)` (las provisiones NO entran al neto en efectivo)

- [ ] **Step 1: Añadir tests que fallan**

```js
import { calcularTotales } from '../src/lib/calculo.js';

describe('calcularTotales', () => {
  const lineas = [
    { clase: 'INGRESO', monto: 1000, es_provision: false }, // sueldo
    { clase: 'INGRESO', monto: 100, es_provision: true },   // provisión décimo (no cash)
    { clase: 'DESCUENTO', monto: 94.5, es_provision: false },// IESS
    { clase: 'DESCUENTO', monto: 50, es_provision: false }   // préstamo
  ];
  it('excluye provisiones del neto en efectivo', () => {
    expect(calcularTotales(lineas)).toEqual({
      totalIngresos: 1000, totalDescuentos: 144.5, totalProvisiones: 100, neto: 855.5
    });
  });
  it('maneja lista vacía', () => {
    expect(calcularTotales([])).toEqual({
      totalIngresos: 0, totalDescuentos: 0, totalProvisiones: 0, neto: 0 });
  });
});
```

- [ ] **Step 2: Correr — falla**

Run: `npm -w server test tests/calculo.test.js`
Expected: FAIL (export inexistente).

- [ ] **Step 3: Implementar `calcularTotales` en `calculo.js`**

```js
export function calcularTotales(lineas) {
  let totalIngresos = 0, totalDescuentos = 0, totalProvisiones = 0;
  for (const l of lineas) {
    if (l.es_provision) totalProvisiones += Number(l.monto);
    else if (l.clase === 'INGRESO') totalIngresos += Number(l.monto);
    else if (l.clase === 'DESCUENTO') totalDescuentos += Number(l.monto);
  }
  return {
    totalIngresos: round2(totalIngresos),
    totalDescuentos: round2(totalDescuentos),
    totalProvisiones: round2(totalProvisiones),
    neto: round2(totalIngresos - totalDescuentos)
  };
}
```

- [ ] **Step 4: Correr — verde**

Run: `npm -w server test tests/calculo.test.js`
Expected: PASS (13 tests totales).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/calculo.js server/tests/calculo.test.js
git commit -m "feat: calcularTotales deriva el neto excluyendo provisiones"
```

---

## FASE 4 — Ciclo de vida del período

### Task 6: Máquina de estados PURA del período

**Files:**
- Create: `server/src/lib/periodo-fsm.js`
- Test: `server/tests/periodo-fsm.test.js`

**Interfaces:**
- Produces:
  - `siguienteEstado(estadoActual, accion) → nuevoEstado` — `accion ∈ {'aprobar','cerrar'}`. Lanza `Error` con mensaje claro en transición inválida.
    - `BORRADOR --aprobar--> APROBADO`
    - `APROBADO --cerrar--> CERRADO`
    - cualquier otra combinación (incluido salir de `CERRADO`) lanza.
  - `puedeEditarLineas(estado) → boolean` — `true` solo si `estado === 'BORRADOR'`.

- [ ] **Step 1: Tests que fallan — `server/tests/periodo-fsm.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { siguienteEstado, puedeEditarLineas } from '../src/lib/periodo-fsm.js';

describe('siguienteEstado', () => {
  it('BORRADOR se aprueba', () => expect(siguienteEstado('BORRADOR', 'aprobar')).toBe('APROBADO'));
  it('APROBADO se cierra', () => expect(siguienteEstado('APROBADO', 'cerrar')).toBe('CERRADO'));
  it('no se puede cerrar un BORRADOR', () =>
    expect(() => siguienteEstado('BORRADOR', 'cerrar')).toThrow());
  it('no se puede aprobar dos veces', () =>
    expect(() => siguienteEstado('APROBADO', 'aprobar')).toThrow());
  it('CERRADO es irreversible', () => {
    expect(() => siguienteEstado('CERRADO', 'aprobar')).toThrow();
    expect(() => siguienteEstado('CERRADO', 'cerrar')).toThrow();
  });
});

describe('puedeEditarLineas', () => {
  it('solo en BORRADOR', () => {
    expect(puedeEditarLineas('BORRADOR')).toBe(true);
    expect(puedeEditarLineas('APROBADO')).toBe(false);
    expect(puedeEditarLineas('CERRADO')).toBe(false);
  });
});
```

- [ ] **Step 2: Correr — falla**

Run: `npm -w server test tests/periodo-fsm.test.js`
Expected: FAIL.

- [ ] **Step 3: Implementar `server/src/lib/periodo-fsm.js`**

```js
const TRANSICIONES = {
  BORRADOR: { aprobar: 'APROBADO' },
  APROBADO: { cerrar: 'CERRADO' },
  CERRADO: {}
};

export function siguienteEstado(estadoActual, accion) {
  const destino = TRANSICIONES[estadoActual]?.[accion];
  if (!destino) throw new Error(`Transición inválida: ${estadoActual} --${accion}-->`);
  return destino;
}

export function puedeEditarLineas(estado) {
  return estado === 'BORRADOR';
}
```

- [ ] **Step 4: Correr — verde**

Run: `npm -w server test tests/periodo-fsm.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/periodo-fsm.js server/tests/periodo-fsm.test.js
git commit -m "feat: máquina de estados del período (CERRADO irreversible)"
```

### Task 7: Servicio de períodos con BD (generar/aprobar/cerrar)

**Files:**
- Create: `server/src/services/periodos.js`, `server/src/services/roles.js`
- Test: `server/tests/periodos.test.js`

**Interfaces:**
- Produces (todas reciben un `client` de pg — el mismo dentro de una transacción):
  - `crearPeriodo(client, { nombre, fecha_inicio, fecha_fin, quincena, creado_por }) → periodo`
  - `generarRoles(client, periodoId, { sbu }) → { creados: number }` — por cada colaborador activo:
    - Busca contrato activo (`fecha_fin IS NULL`). Sin contrato activo → se omite (proveedores factura no entran aquí).
    - Crea `roles_pago`. Genera líneas automáticas:
      - `SUELDO_BASE` (INGRESO)
      - Si `quincena=2` y tipo IESS: `IESS_PERSONAL` (DESCUENTO), provisiones `PROVISION_DECIMO_TERCERO` y `PROVISION_DECIMO_CUARTO` (INGRESO, `es_provision=true`)
      - Si `quincena=1`: NO descuentos IESS; el sueldo de la línea se ajusta a `anticipoQuincena` (INGRESO)
      - Préstamos activos: línea `CUOTA_PRESTAMO` (DESCUENTO) con `cuotaPrestamo`, y actualiza `prestamos.saldo_pendiente/activo`
    - Recalcula totales con `recalcularTotales`.
  - `recalcularTotales(client, rolPagoId) → { total_ingresos, total_descuentos, neto }` (de `roles.js`) — lee líneas, aplica `calcularTotales`, persiste en `roles_pago`.
  - `transicionarPeriodo(client, periodoId, accion, usuarioId) → periodo` — usa `siguienteEstado`; en `cerrar` setea `cerrado_en=now()`; en `aprobar` setea `aprobado_por`.

- [ ] **Step 1: `server/src/services/roles.js`**

```js
import { calcularTotales } from '../lib/calculo.js';

export async function recalcularTotales(client, rolPagoId) {
  const { rows: lineas } = await client.query(
    'SELECT clase, monto, es_provision FROM lineas_rol WHERE rol_pago_id=$1', [rolPagoId]);
  const t = calcularTotales(lineas);
  await client.query(
    'UPDATE roles_pago SET total_ingresos=$1, total_descuentos=$2, neto=$3 WHERE id=$4',
    [t.totalIngresos, t.totalDescuentos, t.neto, rolPagoId]);
  return { total_ingresos: t.totalIngresos, total_descuentos: t.totalDescuentos, neto: t.neto };
}
```

- [ ] **Step 2: `server/src/services/periodos.js`**

```js
import { siguienteEstado } from '../lib/periodo-fsm.js';
import * as calc from '../lib/calculo.js';
import { recalcularTotales } from './roles.js';

export async function crearPeriodo(client, p) {
  const { rows } = await client.query(
    `INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, creado_por)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [p.nombre, p.fecha_inicio, p.fecha_fin, p.quincena, p.creado_por]);
  return rows[0];
}

async function insertarLinea(client, rolId, { tipo, clase, monto, es_provision = false, desc = null }) {
  await client.query(
    `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision)
     VALUES ($1,$2,$3,$4,$5,$6)`, [rolId, tipo, clase, monto, desc, es_provision]);
}

export async function generarRoles(client, periodoId, { sbu }) {
  const { rows: periodo } = await client.query('SELECT * FROM periodos WHERE id=$1', [periodoId]);
  const quincena = periodo[0].quincena;
  const { rows: colaboradores } = await client.query(
    `SELECT c.*, ct.sueldo_base
     FROM colaboradores c
     JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.activo=true`);
  let creados = 0;
  for (const col of colaboradores) {
    const { rows: rolRows } = await client.query(
      `INSERT INTO roles_pago (periodo_id, colaborador_id) VALUES ($1,$2) RETURNING id`,
      [periodoId, col.id]);
    const rolId = rolRows[0].id;

    if (quincena === 1) {
      await insertarLinea(client, rolId,
        { tipo: 'ANTICIPO_QUINCENA', clase: 'INGRESO', monto: calc.anticipoQuincena(col.sueldo_base),
          desc: 'Anticipo primera quincena' });
    } else {
      await insertarLinea(client, rolId,
        { tipo: 'SUELDO_BASE', clase: 'INGRESO', monto: col.sueldo_base });
      // Descuento del anticipo pagado en la 1ra quincena
      await insertarLinea(client, rolId,
        { tipo: 'ANTICIPO_QUINCENA', clase: 'DESCUENTO', monto: calc.anticipoQuincena(col.sueldo_base),
          desc: 'Anticipo ya pagado' });
      if (col.tipo === 'IESS') {
        await insertarLinea(client, rolId,
          { tipo: 'IESS_PERSONAL', clase: 'DESCUENTO', monto: calc.iessPersonal(col.sueldo_base) });
        await insertarLinea(client, rolId,
          { tipo: 'PROVISION_DECIMO_TERCERO', clase: 'INGRESO',
            monto: calc.decimoTercero(col.sueldo_base), es_provision: true });
        await insertarLinea(client, rolId,
          { tipo: 'PROVISION_DECIMO_CUARTO', clase: 'INGRESO',
            monto: calc.decimoCuarto(sbu), es_provision: true });
      }
    }

    // Préstamos activos → cuota
    const { rows: prestamos } = await client.query(
      'SELECT * FROM prestamos WHERE colaborador_id=$1 AND activo=true', [col.id]);
    for (const pr of prestamos) {
      const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
      if (r.aplicada > 0) {
        await insertarLinea(client, rolId,
          { tipo: 'CUOTA_PRESTAMO', clase: 'DESCUENTO', monto: r.aplicada, desc: 'Cuota de préstamo' });
        await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3',
          [r.saldoNuevo, r.activo, pr.id]);
      }
    }

    await recalcularTotales(client, rolId);
    creados++;
  }
  return { creados };
}

export async function transicionarPeriodo(client, periodoId, accion, usuarioId) {
  const { rows } = await client.query('SELECT estado FROM periodos WHERE id=$1', [periodoId]);
  if (rows.length === 0) throw new Error('período no existe');
  const nuevo = siguienteEstado(rows[0].estado, accion);
  const extra = accion === 'aprobar'
    ? ', aprobado_por=$3' : accion === 'cerrar' ? ', cerrado_en=now()' : '';
  const params = accion === 'aprobar' ? [nuevo, periodoId, usuarioId] : [nuevo, periodoId];
  const { rows: upd } = await client.query(
    `UPDATE periodos SET estado=$1${extra} WHERE id=$2 RETURNING *`, params);
  return upd[0];
}
```

- [ ] **Step 2b: Escribir tests — `server/tests/periodos.test.js`** (usa `withRollback`)

```js
import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import { crearPeriodo, generarRoles, transicionarPeriodo } from '../src/services/periodos.js';

async function semilla(client) {
  const { rows: u } = await client.query(
    `INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH') RETURNING id`);
  const { rows: c } = await client.query(
    `INSERT INTO colaboradores (tipo, nombre) VALUES ('IESS','Juan') RETURNING id`);
  await client.query(
    `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio) VALUES ($1, 1000, '2026-01-01')`,
    [c.rows?.[0]?.id ?? c[0].id]);
  return { usuarioId: u[0].id, colaboradorId: c[0].id };
}

describe('servicio de períodos', () => {
  it('genera rol de 2da quincena con IESS y provisiones', async () => {
    await withRollback(async (client) => {
      const { usuarioId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: '2da julio', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31',
        quincena: 2, creado_por: usuarioId });
      const res = await generarRoles(client, p.id, { sbu: 460 });
      expect(res.creados).toBe(1);
      const { rows } = await client.query(
        `SELECT rp.neto, rp.total_descuentos FROM roles_pago rp WHERE rp.periodo_id=$1`, [p.id]);
      // ingresos cash=1000; descuentos = IESS 94.5 + anticipo 500 = 594.5; neto=405.5
      expect(Number(rows[0].total_descuentos)).toBe(594.5);
      expect(Number(rows[0].neto)).toBe(405.5);
    });
  });

  it('1ra quincena solo genera anticipo (sin IESS)', async () => {
    await withRollback(async (client) => {
      const { usuarioId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: '1ra julio', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-15',
        quincena: 1, creado_por: usuarioId });
      await generarRoles(client, p.id, { sbu: 460 });
      const { rows } = await client.query(
        `SELECT tipo_linea FROM lineas_rol l
         JOIN roles_pago rp ON rp.id=l.rol_pago_id WHERE rp.periodo_id=$1`, [p.id]);
      const tipos = rows.map((r) => r.tipo_linea);
      expect(tipos).toContain('ANTICIPO_QUINCENA');
      expect(tipos).not.toContain('IESS_PERSONAL');
    });
  });

  it('aprobar luego cerrar; no permite re-transición desde CERRADO', async () => {
    await withRollback(async (client) => {
      const { usuarioId } = await semilla(client);
      const p = await crearPeriodo(client, {
        nombre: 'x', fecha_inicio: '2026-07-01', fecha_fin: '2026-07-15', quincena: 1, creado_por: usuarioId });
      const ap = await transicionarPeriodo(client, p.id, 'aprobar', usuarioId);
      expect(ap.estado).toBe('APROBADO');
      const ce = await transicionarPeriodo(client, p.id, 'cerrar', usuarioId);
      expect(ce.estado).toBe('CERRADO');
      expect(ce.cerrado_en).not.toBeNull();
      await expect(transicionarPeriodo(client, p.id, 'aprobar', usuarioId)).rejects.toThrow();
    });
  });
});
```

- [ ] **Step 3: Correr**

Run: `NODE_ENV=test npm -w server test tests/periodos.test.js`
Expected: PASS (3 tests). Ajustar el helper `semilla` si el shape de `rows` difiere.

- [ ] **Step 4: Commit**

```bash
git add server/src/services server/tests/periodos.test.js
git commit -m "feat: servicio de períodos genera roles, recalcula totales y transiciona estados"
```

---

## FASE 5 — CRUD Colaboradores y Contratos

### Task 8: Endpoints de colaboradores y contratos

**Files:**
- Create: `server/src/routes/colaboradores.js`, `server/src/routes/contratos.js`
- Modify: `server/src/index.js` (montar routers)
- Test: `server/tests/colaboradores.test.js`

**Interfaces (REST, todos bajo `requireAuth`):**
- `GET /api/colaboradores` (ADMIN, RRHH) — lista, query `?tipo=&activo=`. Response: `Array<colaborador>`.
- `POST /api/colaboradores` (ADMIN, RRHH) — body `{ tipo, cedula, nombre, email?, departamento?, cargo?, fecha_ingreso? }` → 201 `colaborador`.
- `GET /api/colaboradores/:id` (ADMIN, RRHH, o COLABORADOR dueño vía `requireSelfOrRole`) — incluye `contratos`, `roles_pago`, `prestamos`.
- `PATCH /api/colaboradores/:id` (ADMIN, RRHH) — campos editables → `colaborador`.
- `POST /api/colaboradores/:id/contratos` (ADMIN, RRHH) — body `{ sueldo_base, fecha_inicio, notas? }`; cierra el contrato activo previo (`fecha_fin = fecha_inicio`) y crea el nuevo → 201 `contrato`.

- [ ] **Step 1: `server/src/routes/colaboradores.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo, activo } = req.query;
  const cond = [], params = [];
  if (tipo) { params.push(tipo); cond.push(`tipo=$${params.length}`); }
  if (activo !== undefined) { params.push(activo === 'true'); cond.push(`activo=$${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM colaboradores ${where} ORDER BY nombre`, params);
  res.json(rows);
});

router.post('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso } = req.body;
  if (!tipo || !nombre) return res.status(400).json({ error: 'tipo y nombre requeridos' });
  const { rows } = await pool.query(
    `INSERT INTO colaboradores (tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tipo, cedula, nombre, email, departamento, cargo, fecha_ingreso]);
  res.status(201).json(rows[0]);
});

router.get('/:id',
  requireSelfOrRole(['ADMIN', 'RRHH'], (req) => req.params.id),
  async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM colaboradores WHERE id=$1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const [contratos, rolesPago, prestamos] = await Promise.all([
      pool.query('SELECT * FROM contratos WHERE colaborador_id=$1 ORDER BY fecha_inicio DESC', [req.params.id]),
      pool.query('SELECT * FROM roles_pago WHERE colaborador_id=$1', [req.params.id]),
      pool.query('SELECT * FROM prestamos WHERE colaborador_id=$1', [req.params.id])
    ]);
    res.json({ ...rows[0], contratos: contratos.rows, roles_pago: rolesPago.rows, prestamos: prestamos.rows });
  });

router.patch('/:id', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = ['nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula'];
  const set = [], params = [];
  for (const c of campos) if (c in req.body) { params.push(req.body[c]); set.push(`${c}=$${params.length}`); }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE colaboradores SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`, params);
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

router.post('/:id/contratos', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { sueldo_base, fecha_inicio, notas } = req.body;
  if (!sueldo_base || !fecha_inicio) return res.status(400).json({ error: 'sueldo_base y fecha_inicio requeridos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE contratos SET fecha_fin=$1 WHERE colaborador_id=$2 AND fecha_fin IS NULL`,
      [fecha_inicio, req.params.id]);
    const { rows } = await client.query(
      `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, notas)
       VALUES ($1,$2,$3,$4) RETURNING *`, [req.params.id, sueldo_base, fecha_inicio, notas]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

export default router;
```

- [ ] **Step 2: Montar en `createApp()`**

```js
import colaboradoresRouter from './routes/colaboradores.js';
app.use('/api/colaboradores', colaboradoresRouter);
```

- [ ] **Step 3: Test — `server/tests/colaboradores.test.js`**

Reutiliza el mock de `verifyGoogleToken` (patrón de Task 2). Test representativo:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('colaboradores', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('crea y lista un colaborador', async () => {
    const app = createApp();
    const crear = await auth(request(app).post('/api/colaboradores'))
      .send({ tipo: 'IESS', nombre: 'Prueba QA', cedula: `C${Date.now()}` });
    expect(crear.status).toBe(201);
    const lista = await auth(request(app).get('/api/colaboradores'));
    expect(lista.status).toBe(200);
    expect(lista.body.some((c) => c.id === crear.body.id)).toBe(true);
  });

  it('un nuevo contrato cierra el anterior', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores'))
      .send({ tipo: 'IESS', nombre: 'Contratos', cedula: `K${Date.now()}` })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`))
      .send({ sueldo_base: 1000, fecha_inicio: '2026-01-01' });
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`))
      .send({ sueldo_base: 1200, fecha_inicio: '2026-06-01' });
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS activos FROM contratos WHERE colaborador_id=$1 AND fecha_fin IS NULL', [col.id]);
    expect(rows[0].activos).toBe(1);
  });
});
```

> Nota: estos tests escriben en la BD de test real (no rollback) porque van vía HTTP. Usar cédulas únicas (`Date.now()`) para evitar colisiones. Alternativa: truncar tablas en `beforeEach`.

- [ ] **Step 4: Correr**

Run: `NODE_ENV=test npm -w server test tests/colaboradores.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/colaboradores.js server/src/index.js server/tests/colaboradores.test.js
git commit -m "feat: CRUD colaboradores + contratos con historial de sueldos"
```

---

## FASE 6 — Endpoints de períodos, roles y líneas

### Task 9: Rutas de períodos + roles_pago + líneas

**Files:**
- Create: `server/src/routes/periodos.js`, `server/src/routes/roles.js`
- Modify: `server/src/index.js`
- Test: `server/tests/periodos-api.test.js`

**Interfaces (bajo `requireAuth`):**
- `GET /api/periodos` (ADMIN, RRHH, GERENCIA) → lista con totales agregados (`SUM(neto)`).
- `POST /api/periodos` (ADMIN, RRHH) — body `{ nombre, fecha_inicio, fecha_fin, quincena }`; crea período en BORRADOR y llama `generarRoles` (lee `sbu` de `parametros`). Todo en una transacción → 201 `{ periodo, creados }`.
- `GET /api/periodos/:id` (ADMIN, RRHH, GERENCIA) → período + `roles_pago` con nombre de colaborador.
- `POST /api/periodos/:id/aprobar` (RRHH) → `transicionarPeriodo('aprobar')`. 409 si transición inválida.
- `POST /api/periodos/:id/cerrar` (RRHH) → `transicionarPeriodo('cerrar')`. 409 si inválida.
- `GET /api/roles/:id` (ADMIN, RRHH, o COLABORADOR dueño) → rol + `lineas_rol` + datos colaborador (para el comprobante imprimible).
- `POST /api/roles/:id/lineas` (ADMIN, RRHH) — body `{ tipo_linea, clase, monto, descripcion?, es_provision? }`; **rechaza con 409 si el período no está en BORRADOR** (`puedeEditarLineas`); tras insertar, `recalcularTotales`.
- `DELETE /api/roles/:rolId/lineas/:lineaId` (ADMIN, RRHH) — mismo guard BORRADOR; recalcula.

- [ ] **Step 1: `server/src/routes/periodos.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { crearPeriodo, generarRoles, transicionarPeriodo } from '../services/periodos.js';

const router = Router();
router.use(requireAuth);

async function getSbu(client) {
  const { rows } = await client.query(`SELECT valor FROM parametros WHERE clave='SBU'`);
  return Number(rows[0]?.valor ?? 460);
}

router.get('/', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, COALESCE(SUM(rp.neto),0) AS total_neto
     FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
     GROUP BY p.id ORDER BY p.fecha_inicio DESC`);
  res.json(rows);
});

router.post('/', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { nombre, fecha_inicio, fecha_fin, quincena } = req.body;
  if (!nombre || !fecha_inicio || !fecha_fin || !quincena)
    return res.status(400).json({ error: 'campos requeridos faltantes' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const periodo = await crearPeriodo(client, { nombre, fecha_inicio, fecha_fin, quincena, creado_por: req.usuario.id });
    const { creados } = await generarRoles(client, periodo.id, { sbu: await getSbu(client) });
    await client.query('COMMIT');
    res.status(201).json({ periodo, creados });
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

router.get('/:id', requireRole(['ADMIN', 'RRHH', 'GERENCIA']), async (req, res) => {
  const { rows: p } = await pool.query('SELECT * FROM periodos WHERE id=$1', [req.params.id]);
  if (p.length === 0) return res.status(404).json({ error: 'no encontrado' });
  const { rows: roles } = await pool.query(
    `SELECT rp.*, c.nombre AS colaborador_nombre, c.tipo AS colaborador_tipo
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 ORDER BY c.nombre`, [req.params.id]);
  res.json({ ...p[0], roles_pago: roles });
});

function accionHandler(accion) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const periodo = await transicionarPeriodo(client, req.params.id, accion, req.usuario.id);
      await client.query('COMMIT');
      res.json(periodo);
    } catch (e) {
      await client.query('ROLLBACK');
      const code = e.message.startsWith('Transición inválida') ? 409 : 500;
      res.status(code).json({ error: e.message });
    } finally { client.release(); }
  };
}
router.post('/:id/aprobar', requireRole(['RRHH']), accionHandler('aprobar'));
router.post('/:id/cerrar', requireRole(['RRHH']), accionHandler('cerrar'));

export default router;
```

- [ ] **Step 2: `server/src/routes/roles.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole, requireSelfOrRole } from '../auth/middleware.js';
import { puedeEditarLineas } from '../lib/periodo-fsm.js';
import { recalcularTotales } from '../services/roles.js';

const router = Router();
router.use(requireAuth);

async function colaboradorDelRol(req) {
  const { rows } = await pool.query('SELECT colaborador_id FROM roles_pago WHERE id=$1', [req.params.id]);
  return rows[0]?.colaborador_id;
}

router.get('/:id',
  requireSelfOrRole(['ADMIN', 'RRHH', 'GERENCIA'], colaboradorDelRol),
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT rp.*, c.nombre AS colaborador_nombre, c.cedula, c.cargo,
              p.nombre AS periodo_nombre, p.estado AS periodo_estado
       FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
       JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    const { rows: lineas } = await pool.query(
      'SELECT * FROM lineas_rol WHERE rol_pago_id=$1 ORDER BY clase, creado_en', [req.params.id]);
    res.json({ ...rows[0], lineas });
  });

async function estadoPeriodoDelRol(rolId) {
  const { rows } = await pool.query(
    `SELECT p.estado FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1`, [rolId]);
  return rows[0]?.estado;
}

router.post('/:id/lineas', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const estado = await estadoPeriodoDelRol(req.params.id);
  if (!estado) return res.status(404).json({ error: 'rol no encontrado' });
  if (!puedeEditarLineas(estado)) return res.status(409).json({ error: `período ${estado}: no editable` });
  const { tipo_linea, clase, monto, descripcion, es_provision } = req.body;
  if (!tipo_linea || !clase || monto == null) return res.status(400).json({ error: 'campos requeridos' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [req.params.id, tipo_linea, clase, monto, descripcion ?? null, es_provision ?? false]);
    const totales = await recalcularTotales(client, req.params.id);
    await client.query('COMMIT');
    res.status(201).json(totales);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

router.delete('/:rolId/lineas/:lineaId', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const estado = await estadoPeriodoDelRol(req.params.rolId);
  if (!puedeEditarLineas(estado)) return res.status(409).json({ error: `período ${estado}: no editable` });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM lineas_rol WHERE id=$1 AND rol_pago_id=$2',
      [req.params.lineaId, req.params.rolId]);
    const totales = await recalcularTotales(client, req.params.rolId);
    await client.query('COMMIT');
    res.json(totales);
  } catch (e) { await client.query('ROLLBACK'); res.status(500).json({ error: e.message }); }
  finally { client.release(); }
});

export default router;
```

- [ ] **Step 3: Montar routers en `createApp()`**

```js
import periodosRouter from './routes/periodos.js';
import rolesRouter from './routes/roles.js';
app.use('/api/periodos', periodosRouter);
app.use('/api/roles', rolesRouter);
```

- [ ] **Step 4: Test — `server/tests/periodos-api.test.js`** (test clave: no editar líneas si CERRADO)

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('API períodos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('crea período con roles y bloquea edición al cerrar', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores'))
      .send({ tipo: 'IESS', nombre: 'API test', cedula: `A${Date.now()}` })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`))
      .send({ sueldo_base: 1000, fecha_inicio: '2026-01-01' });

    const per = await auth(request(app).post('/api/periodos'))
      .send({ nombre: '2da julio', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2 });
    expect(per.status).toBe(201);
    expect(per.body.creados).toBeGreaterThanOrEqual(1);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    // Editable en BORRADOR
    const ok = await auth(request(app).post(`/api/roles/${rol.id}/lineas`))
      .send({ tipo_linea: 'BONO_DESEMPENO', clase: 'INGRESO', monto: 50 });
    expect(ok.status).toBe(201);

    // Cerrar (aprobar → cerrar)
    await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/aprobar`));
    await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/cerrar`));

    // Ya NO editable
    const bloqueado = await auth(request(app).post(`/api/roles/${rol.id}/lineas`))
      .send({ tipo_linea: 'MULTA', clase: 'DESCUENTO', monto: 10 });
    expect(bloqueado.status).toBe(409);
  });
});
```

- [ ] **Step 5: Correr**

Run: `NODE_ENV=test npm -w server test tests/periodos-api.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/periodos.js server/src/routes/roles.js server/src/index.js server/tests/periodos-api.test.js
git commit -m "feat: API de períodos, roles y líneas con guard de estado BORRADOR"
```

---

## FASE 7 — Préstamos y Facturas de proveedor

### Task 10: Endpoints de préstamos

**Files:**
- Create: `server/src/routes/prestamos.js`
- Modify: `server/src/index.js`
- Test: `server/tests/prestamos.test.js`

**Interfaces (ADMIN, RRHH; bajo `requireAuth`):**
- `GET /api/prestamos?activo=` → lista con nombre de colaborador.
- `POST /api/prestamos` — body `{ colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas? }`; `saldo_pendiente` se inicializa en `monto_total`, `activo=true` → 201.
- `GET /api/colaboradores/:id/prestamos` — (ya cubierto en detalle colaborador; opcional).
- `PATCH /api/prestamos/:id` — `{ cuota_quincena?, activo?, notas? }`.

- [ ] **Step 1: Implementar `server/src/routes/prestamos.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

router.get('/', async (req, res) => {
  const cond = req.query.activo !== undefined ? 'WHERE p.activo=$1' : '';
  const params = req.query.activo !== undefined ? [req.query.activo === 'true'] : [];
  const { rows } = await pool.query(
    `SELECT p.*, c.nombre AS colaborador_nombre FROM prestamos p
     JOIN colaboradores c ON c.id=p.colaborador_id ${cond} ORDER BY p.fecha_inicio DESC`, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas } = req.body;
  if (!colaborador_id || !monto_total || !cuota_quincena || !fecha_inicio)
    return res.status(400).json({ error: 'campos requeridos' });
  const { rows } = await pool.query(
    `INSERT INTO prestamos (colaborador_id, monto_total, cuota_quincena, saldo_pendiente, fecha_inicio, notas)
     VALUES ($1,$2,$3,$2,$4,$5) RETURNING *`,
    [colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas]);
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const campos = ['cuota_quincena', 'activo', 'notas'];
  const set = [], params = [];
  for (const c of campos) if (c in req.body) { params.push(req.body[c]); set.push(`${c}=$${params.length}`); }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE prestamos SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`, params);
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

export default router;
```

- [ ] **Step 2: Montar** `app.use('/api/prestamos', prestamosRouter);`

- [ ] **Step 3: Test — `server/tests/prestamos.test.js`** (verifica amortización vía generación de período)

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' })) }));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('préstamos', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('la cuota amortiza el saldo al generar el período', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores'))
      .send({ tipo: 'IESS', nombre: 'Prestamista', cedula: `P${Date.now()}` })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`))
      .send({ sueldo_base: 1000, fecha_inicio: '2026-01-01' });
    const pr = (await auth(request(app).post('/api/prestamos'))
      .send({ colaborador_id: col.id, monto_total: 300, cuota_quincena: 100, fecha_inicio: '2026-07-01' })).body;

    await auth(request(app).post('/api/periodos'))
      .send({ nombre: '2da julio', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2 });

    const { rows } = await pool.query('SELECT saldo_pendiente FROM prestamos WHERE id=$1', [pr.id]);
    expect(Number(rows[0].saldo_pendiente)).toBe(200);
  });
});
```

- [ ] **Step 4: Correr y commit**

Run: `NODE_ENV=test npm -w server test tests/prestamos.test.js`
Expected: PASS.
```bash
git add server/src/routes/prestamos.js server/src/index.js server/tests/prestamos.test.js
git commit -m "feat: préstamos con amortización automática al generar período"
```

### Task 11: Endpoints de facturas de proveedor

**Files:**
- Create: `server/src/routes/facturas.js`
- Modify: `server/src/index.js`
- Test: `server/tests/facturas.test.js`

**Interfaces (ADMIN, RRHH):**
- `GET /api/facturas?estado=&periodo_id=` → lista con nombre de colaborador.
- `POST /api/facturas` — body `{ colaborador_id, periodo_id?, numero_factura, fecha_factura, monto_bruto }`; el servidor calcula `retencion_10pct` y `neto` con `retencionProveedor` (NO confía en el cliente) → 201.
- `PATCH /api/facturas/:id` — `{ estado?, pagada_en? }`. Al marcar `PAGADA` setea `pagada_en=now()`.

- [ ] **Step 1: Implementar `server/src/routes/facturas.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { retencionProveedor } from '../lib/calculo.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

router.get('/', async (req, res) => {
  const cond = [], params = [];
  if (req.query.estado) { params.push(req.query.estado); cond.push(`f.estado=$${params.length}`); }
  if (req.query.periodo_id) { params.push(req.query.periodo_id); cond.push(`f.periodo_id=$${params.length}`); }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT f.*, c.nombre AS colaborador_nombre FROM facturas_proveedor f
     JOIN colaboradores c ON c.id=f.colaborador_id ${where} ORDER BY f.fecha_factura DESC`, params);
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { colaborador_id, periodo_id, numero_factura, fecha_factura, monto_bruto } = req.body;
  if (!colaborador_id || monto_bruto == null) return res.status(400).json({ error: 'campos requeridos' });
  const { retencion, neto } = retencionProveedor(Number(monto_bruto));
  const { rows } = await pool.query(
    `INSERT INTO facturas_proveedor
      (colaborador_id, periodo_id, numero_factura, fecha_factura, monto_bruto, retencion_10pct, neto)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [colaborador_id, periodo_id ?? null, numero_factura, fecha_factura, monto_bruto, retencion, neto]);
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { estado } = req.body;
  const pagada = estado === 'PAGADA';
  const { rows } = await pool.query(
    `UPDATE facturas_proveedor SET estado=COALESCE($1, estado),
       pagada_en=CASE WHEN $2 THEN now() ELSE pagada_en END WHERE id=$3 RETURNING *`,
    [estado ?? null, pagada, req.params.id]);
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrada' });
  res.json(rows[0]);
});

export default router;
```

- [ ] **Step 2: Montar** `app.use('/api/facturas', facturasRouter);`

- [ ] **Step 3: Test — `server/tests/facturas.test.js`**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' })) }));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('facturas', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });
  it('calcula retención 10% en el servidor', async () => {
    const app = createApp();
    const prov = (await auth(request(app).post('/api/colaboradores'))
      .send({ tipo: 'EXTERNO', nombre: 'Proveedor X', cedula: `R${Date.now()}` })).body;
    const f = await auth(request(app).post('/api/facturas'))
      .send({ colaborador_id: prov.id, numero_factura: '001-001-1', fecha_factura: '2026-07-10', monto_bruto: 1000 });
    expect(f.status).toBe(201);
    expect(Number(f.body.retencion_10pct)).toBe(100);
    expect(Number(f.body.neto)).toBe(900);
  });
});
```

- [ ] **Step 4: Correr y commit**

Run: `NODE_ENV=test npm -w server test tests/facturas.test.js`
Expected: PASS.
```bash
git add server/src/routes/facturas.js server/src/index.js server/tests/facturas.test.js
git commit -m "feat: facturas de proveedor con retención 10% calculada en servidor"
```

---

## FASE 8 — Provisiones, Reportes y Configuración

### Task 12: Reportes (CSV) y parámetros de configuración

**Files:**
- Create: `server/src/routes/reportes.js`, `server/src/routes/usuarios.js`
- Modify: `server/src/index.js`
- Test: `server/tests/reportes.test.js`

**Interfaces:**
- `GET /api/reportes/periodo/:id.csv` (ADMIN, RRHH, GERENCIA) → `text/csv` con columnas `colaborador,tipo,total_ingresos,total_descuentos,neto`. Header `Content-Disposition: attachment`.
- `GET /api/reportes/costo-departamento?anio=` (ADMIN, RRHH, GERENCIA) → JSON `[{ departamento, total_neto, aporte_patronal }]` (aporte patronal 12.15% sobre sueldos base activos, vía `iessPatronal`).
- `GET /api/usuarios` / `POST /api/usuarios` / `PATCH /api/usuarios/:id` (solo ADMIN) — gestión de usuarios y su rol.
- `GET /api/parametros` (ADMIN, RRHH) / `PUT /api/parametros/:clave` (solo ADMIN) — leer/editar SBU y otros.

- [ ] **Step 1: Implementar `server/src/routes/reportes.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { iessPatronal } from '../lib/calculo.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH', 'GERENCIA']));

function aCsv(filas, columnas) {
  const head = columnas.join(',');
  const cuerpo = filas.map((f) => columnas.map((c) => {
    const v = f[c] ?? '';
    return /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v;
  }).join(',')).join('\n');
  return `${head}\n${cuerpo}\n`;
}

router.get('/periodo/:id.csv', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.nombre AS colaborador, c.tipo, rp.total_ingresos, rp.total_descuentos, rp.neto
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1 ORDER BY c.nombre`, [req.params.id]);
  const csv = aCsv(rows, ['colaborador', 'tipo', 'total_ingresos', 'total_descuentos', 'neto']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="periodo-${req.params.id}.csv"`);
  res.send(csv);
});

router.get('/costo-departamento', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.departamento, ct.sueldo_base
     FROM colaboradores c JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.activo=true AND c.tipo='IESS'`);
  const mapa = {};
  for (const r of rows) {
    const dep = r.departamento || 'Sin depto';
    mapa[dep] ??= { departamento: dep, total_sueldos: 0, aporte_patronal: 0 };
    mapa[dep].total_sueldos += Number(r.sueldo_base);
    mapa[dep].aporte_patronal += iessPatronal(Number(r.sueldo_base));
  }
  res.json(Object.values(mapa));
});

export default router;
```

- [ ] **Step 2: Implementar `server/src/routes/usuarios.js`** (ADMIN + parámetros)

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/usuarios', requireRole(['ADMIN']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY email');
  res.json(rows);
});
router.post('/usuarios', requireRole(['ADMIN']), async (req, res) => {
  const { email, nombre, rol, colaborador_id } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO usuarios (email, nombre, rol, colaborador_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (email) DO UPDATE SET nombre=$2, rol=$3, colaborador_id=$4, activo=true RETURNING *`,
    [email, nombre, rol, colaborador_id ?? null]);
  res.status(201).json(rows[0]);
});
router.patch('/usuarios/:id', requireRole(['ADMIN']), async (req, res) => {
  const campos = ['nombre', 'rol', 'activo', 'colaborador_id'];
  const set = [], params = [];
  for (const c of campos) if (c in req.body) { params.push(req.body[c]); set.push(`${c}=$${params.length}`); }
  if (!set.length) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE usuarios SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`, params);
  res.json(rows[0]);
});

router.get('/parametros', requireRole(['ADMIN', 'RRHH']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM parametros ORDER BY clave');
  res.json(rows);
});
router.put('/parametros/:clave', requireRole(['ADMIN']), async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO parametros (clave, valor) VALUES ($1,$2)
     ON CONFLICT (clave) DO UPDATE SET valor=$2, actualizado_en=now() RETURNING *`,
    [req.params.clave, String(req.body.valor)]);
  res.json(rows[0]);
});

export default router;
```

- [ ] **Step 3: Montar routers**

```js
import reportesRouter from './routes/reportes.js';
import usuariosRouter from './routes/usuarios.js';
app.use('/api/reportes', reportesRouter);
app.use('/api', usuariosRouter);  // expone /api/usuarios y /api/parametros
```

- [ ] **Step 4: Test — `server/tests/reportes.test.js`**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'admin@bopelual.com', nombre: 'Admin' })) }));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('reportes', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });
  it('exporta CSV del período', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores'))
      .send({ tipo: 'IESS', nombre: 'CSV Col', cedula: `V${Date.now()}` })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`))
      .send({ sueldo_base: 1000, fecha_inicio: '2026-01-01' });
    const per = (await auth(request(app).post('/api/periodos'))
      .send({ nombre: '2da', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2 })).body;
    const res = await auth(request(app).get(`/api/reportes/periodo/${per.periodo.id}.csv`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('colaborador,tipo,total_ingresos');
    expect(res.text).toContain('CSV Col');
  });
});
```

- [ ] **Step 5: Correr y commit**

Run: `NODE_ENV=test npm -w server test tests/reportes.test.js`
Expected: PASS.
```bash
git add server/src/routes/reportes.js server/src/routes/usuarios.js server/src/index.js server/tests/reportes.test.js
git commit -m "feat: reportes CSV, costo por departamento, gestión de usuarios y parámetros"
```

> **Provisiones:** el acumulado por año (tabla `provisiones`) se alimenta desde las líneas `es_provision` al cerrar el período. Añadir en `transicionarPeriodo` (acción `cerrar`) un paso que sume las provisiones del período a `provisiones` (UPSERT por `colaborador_id, anio`). Cubrir con un test que cierre un período y verifique el incremento en `decimo_tercero`/`decimo_cuarto`. Utilidades quedan como campo manual (fuera de auto-cálculo en Fase 1, según spec §4 "Estimado según utilidad declarada").

### Task 12b: Acumulación de provisiones al cerrar

**Files:**
- Modify: `server/src/services/periodos.js` (`transicionarPeriodo`)
- Test: `server/tests/provisiones.test.js`

**Interfaces:**
- Al cerrar (`accion==='cerrar'`), para cada rol del período sumar sus líneas `es_provision` por tipo a la fila `provisiones(colaborador_id, anio=year(fecha_fin))`: `PROVISION_DECIMO_TERCERO → decimo_tercero`, `PROVISION_DECIMO_CUARTO → decimo_cuarto`, `PROVISION_FONDOS_RESERVA → fondos_reserva`.

- [ ] **Step 1: Escribir el test que falla** — cierra período con provisión décimo tercero de 83.33 y verifica `provisiones.decimo_tercero`.

```js
import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import { crearPeriodo, generarRoles, transicionarPeriodo } from '../src/services/periodos.js';

describe('acumulación de provisiones', () => {
  it('suma provisiones a la tabla anual al cerrar', async () => {
    await withRollback(async (client) => {
      const { rows: u } = await client.query(
        `INSERT INTO usuarios (email, rol) VALUES ('a@bopelual.com','RRHH') RETURNING id`);
      const { rows: c } = await client.query(
        `INSERT INTO colaboradores (tipo, nombre) VALUES ('IESS','P') RETURNING id`);
      await client.query(
        `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio) VALUES ($1,1200,'2026-01-01')`, [c[0].id]);
      const p = await crearPeriodo(client, {
        nombre: '2da', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: u[0].id });
      await generarRoles(client, p.id, { sbu: 460 });
      await transicionarPeriodo(client, p.id, 'aprobar', u[0].id);
      await transicionarPeriodo(client, p.id, 'cerrar', u[0].id);
      const { rows } = await client.query(
        'SELECT decimo_tercero FROM provisiones WHERE colaborador_id=$1 AND anio=2026', [c[0].id]);
      expect(Number(rows[0].decimo_tercero)).toBe(100); // 1200/12
    });
  });
});
```

- [ ] **Step 2: Correr — falla** (aún no se acumula). `NODE_ENV=test npm -w server test tests/provisiones.test.js` → FAIL.

- [ ] **Step 3: Implementar la acumulación en `transicionarPeriodo`** (bloque tras el UPDATE, solo si `accion==='cerrar'`)

```js
if (accion === 'cerrar') {
  const anio = new Date(upd[0].fecha_fin).getUTCFullYear();
  const mapa = {
    PROVISION_DECIMO_TERCERO: 'decimo_tercero',
    PROVISION_DECIMO_CUARTO: 'decimo_cuarto',
    PROVISION_FONDOS_RESERVA: 'fondos_reserva'
  };
  const { rows: provs } = await client.query(
    `SELECT rp.colaborador_id, l.tipo_linea, SUM(l.monto) AS total
     FROM lineas_rol l JOIN roles_pago rp ON rp.id=l.rol_pago_id
     WHERE rp.periodo_id=$1 AND l.es_provision=true GROUP BY rp.colaborador_id, l.tipo_linea`,
    [periodoId]);
  for (const pr of provs) {
    const col = mapa[pr.tipo_linea];
    if (!col) continue;
    await client.query(
      `INSERT INTO provisiones (colaborador_id, anio, ${col}) VALUES ($1,$2,$3)
       ON CONFLICT (colaborador_id, anio) DO UPDATE
         SET ${col}=provisiones.${col}+$3, actualizado_en=now()`,
      [pr.colaborador_id, anio, pr.total]);
  }
}
```

- [ ] **Step 4: Correr — verde** y commit.

```bash
git add server/src/services/periodos.js server/tests/provisiones.test.js
git commit -m "feat: acumula provisiones anuales al cerrar el período"
```

---

## FASE 9 — Cliente: shell, auth y componentes compartidos

### Task 13: AuthContext, api wrapper y Layout

**Files:**
- Create: `client/src/api.js`, `client/src/auth/AuthContext.jsx`, `client/src/components/{Layout,Card,KpiCard,PageTitle,Badge,RoleGate}.jsx`
- Modify: `client/src/App.jsx`
- Test: `client/tests/Badge.test.jsx`

**Interfaces:**
- `api.js`: exporta `api.get/post/patch/del(path, body?)` que adjunta `Authorization: Bearer <idToken>` desde `localStorage.getItem('idToken')`, parsea JSON, lanza en `!res.ok`.
- `AuthContext.jsx`: `useAuth() → { usuario, login(idToken), logout, cargando }`. Al montar, si hay token en `localStorage`, llama `GET /api/auth/me`.
- `Badge.jsx`: `<Badge estado="BORRADOR"|"APROBADO"|"CERRADO"|"PENDIENTE"|"PAGADO"|"PAGADA" />` → span con color por estado (amarillo/azul/verde/gris).
- `RoleGate.jsx`: `<RoleGate roles={['ADMIN']}>...</RoleGate>` renderiza hijos solo si `usuario.rol` está incluido.
- `Layout.jsx`: sidebar oscuro (escritorio) + bottom nav (móvil) con enlaces filtrados por rol; usa `lucide-react`.

- [ ] **Step 1: `client/src/api.js`**

```js
const BASE = '/api';
async function req(method, path, body) {
  const token = localStorage.getItem('idToken');
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}
export const api = {
  get: (p) => req('GET', p), post: (p, b) => req('POST', p, b),
  patch: (p, b) => req('PATCH', p, b), del: (p) => req('DELETE', p)
};
```

- [ ] **Step 2: `client/src/auth/AuthContext.jsx`**

```jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const Ctx = createContext(null);
export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  useEffect(() => {
    const token = localStorage.getItem('idToken');
    if (!token) { setCargando(false); return; }
    api.get('/auth/me').then(setUsuario).catch(() => localStorage.removeItem('idToken')).finally(() => setCargando(false));
  }, []);
  const login = async (idToken) => {
    localStorage.setItem('idToken', idToken);
    setUsuario(await api.get('/auth/me'));
  };
  const logout = () => { localStorage.removeItem('idToken'); setUsuario(null); };
  return <Ctx.Provider value={{ usuario, login, logout, cargando }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);
```

- [ ] **Step 3: `Badge.jsx` (con test primero)** — `client/tests/Badge.test.jsx`

```jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Badge from '../src/components/Badge.jsx';

describe('Badge', () => {
  it('muestra el estado y color CERRADO (verde)', () => {
    render(<Badge estado="CERRADO" />);
    const el = screen.getByText('CERRADO');
    expect(el.className).toMatch(/green/);
  });
  it('BORRADOR usa amarillo', () => {
    render(<Badge estado="BORRADOR" />);
    expect(screen.getByText('BORRADOR').className).toMatch(/yellow|amber/);
  });
});
```

`client/src/components/Badge.jsx`:
```jsx
const ESTILOS = {
  BORRADOR: 'bg-yellow-500/20 text-yellow-300',
  APROBADO: 'bg-blue-500/20 text-blue-300',
  CERRADO: 'bg-green-500/20 text-green-300',
  PENDIENTE: 'bg-slate-500/20 text-slate-300',
  PAGADO: 'bg-green-500/20 text-green-300',
  PAGADA: 'bg-green-500/20 text-green-300'
};
export default function Badge({ estado }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTILOS[estado] || ESTILOS.PENDIENTE}`}>{estado}</span>;
}
```

Run: `npm -w client test tests/Badge.test.jsx` → PASS (2 tests).

- [ ] **Step 4: `Card`, `KpiCard`, `PageTitle`, `RoleGate`**

```jsx
// Card.jsx
export default function Card({ children, className = '' }) {
  return <div className={`bg-brand-dark/60 border border-white/5 rounded-xl p-5 ${className}`}>{children}</div>;
}
```
```jsx
// KpiCard.jsx
export default function KpiCard({ titulo, valor, sub }) {
  return (
    <div className="bg-brand-dark/60 border border-white/5 rounded-xl p-5">
      <p className="text-xs uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className="mt-1 text-2xl font-display font-bold text-brand-yellow">{valor}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}
```
```jsx
// PageTitle.jsx
export default function PageTitle({ children, accion }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-display font-bold">{children}</h1>
      {accion}
    </div>
  );
}
```
```jsx
// RoleGate.jsx
import { useAuth } from '../auth/AuthContext.jsx';
export default function RoleGate({ roles, children }) {
  const { usuario } = useAuth();
  return usuario && roles.includes(usuario.rol) ? children : null;
}
```

- [ ] **Step 5: `Layout.jsx`** — sidebar + bottom nav filtrado por rol

```jsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, FileText, Landmark, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN','RRHH','COLABORADOR','GERENCIA'] },
  { to: '/colaboradores', icon: Users, label: 'Colaboradores', roles: ['ADMIN','RRHH'] },
  { to: '/periodos', icon: CalendarDays, label: 'Períodos', roles: ['ADMIN','RRHH','GERENCIA'] },
  { to: '/proveedores', icon: FileText, label: 'Proveedores', roles: ['ADMIN','RRHH'] },
  { to: '/prestamos', icon: Landmark, label: 'Préstamos', roles: ['ADMIN','RRHH'] },
  { to: '/reportes', icon: BarChart3, label: 'Reportes', roles: ['ADMIN','RRHH','GERENCIA'] },
  { to: '/configuracion', icon: Settings, label: 'Configuración', roles: ['ADMIN'] }
];

export default function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const items = NAV.filter((n) => usuario && n.roles.includes(usuario.rol));
  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:flex-col w-60 bg-brand-dark border-r border-white/5 p-4">
        <div className="font-display font-extrabold text-brand-yellow text-xl mb-8">BOPELUAL</div>
        <nav className="flex-1 space-y-1">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'bg-brand-yellow/15 text-brand-yellow' : 'text-slate-300 hover:bg-white/5'}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="text-xs text-slate-400 hover:text-slate-200 mt-4">Cerrar sesión</button>
      </aside>
      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8">{children}</main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-brand-dark border-t border-white/5 flex justify-around py-2">
        {items.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => `flex flex-col items-center text-[10px] ${isActive ? 'text-brand-yellow' : 'text-slate-400'}`}>
            <Icon size={20} /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add client/src/api.js client/src/auth client/src/components client/tests/Badge.test.jsx
git commit -m "feat: cliente — auth context, api wrapper, layout y componentes compartidos"
```

---

## FASE 10 — Pantallas

### Task 14: Login + rutas protegidas

**Files:**
- Create: `client/src/pages/Login.jsx`
- Modify: `client/src/App.jsx`, `client/src/main.jsx` (envolver en `AuthProvider`)

**Interfaces:**
- `App.jsx`: define rutas; si `!usuario` → `Login`. Usa Google Identity Services (`https://accounts.google.com/gsi/client`) cargado en `index.html`; callback entrega `credential` (idToken) → `login(credential)`.

- [ ] **Step 1: Añadir script GSI a `client/index.html`** dentro de `<head>`:
```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 2: `client/src/pages/Login.jsx`**

```jsx
import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const ref = useRef(null);
  useEffect(() => {
    if (!window.google) return;
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: (resp) => login(resp.credential)
    });
    window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large' });
  }, [login]);
  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="font-display font-extrabold text-3xl text-brand-yellow mb-2">Nómina BOPELUAL</h1>
        <p className="text-slate-400 mb-6 text-sm">Ingresa con tu cuenta corporativa</p>
        <div ref={ref} className="flex justify-center" />
      </div>
    </div>
  );
}
```

(Añadir `VITE_GOOGLE_CLIENT_ID` a `.env.example` del client.)

- [ ] **Step 3: `client/src/App.jsx` con rutas protegidas**

```jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Colaboradores from './pages/Colaboradores.jsx';
import ColaboradorDetalle from './pages/ColaboradorDetalle.jsx';
import Periodos from './pages/Periodos.jsx';
import PeriodoDetalle from './pages/PeriodoDetalle.jsx';
import RolPago from './pages/RolPago.jsx';
import Proveedores from './pages/Proveedores.jsx';
import Prestamos from './pages/Prestamos.jsx';
import Reportes from './pages/Reportes.jsx';
import Configuracion from './pages/Configuracion.jsx';

export default function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div className="min-h-screen grid place-items-center text-slate-400">Cargando…</div>;
  if (!usuario) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/colaboradores" element={<Colaboradores />} />
        <Route path="/colaboradores/:id" element={<ColaboradorDetalle />} />
        <Route path="/periodos" element={<Periodos />} />
        <Route path="/periodos/:id" element={<PeriodoDetalle />} />
        <Route path="/roles/:id" element={<RolPago />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/prestamos" element={<Prestamos />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
```

- [ ] **Step 4: Envolver `AuthProvider` en `main.jsx`** (rodear `<App/>` con `<AuthProvider>`).

- [ ] **Step 5: Commit** `git commit -m "feat: login Google SSO y rutas protegidas por sesión"`.

### Task 15: Pantallas de datos (Dashboard, Colaboradores, Períodos, RolPago, Proveedores, Préstamos, Reportes, Configuración)

Estas 8 pantallas comparten el mismo patrón: cargar datos con `useEffect`+`api.get`, mostrar en `Card`/tabla, formularios que llaman `api.post/patch`. Cada una es un archivo en `client/src/pages/`. Se implementan una por una; cada pantalla = 1 sub-commit. Contrato por pantalla:

- [ ] **Dashboard.jsx** (todos los roles) — `api.get('/periodos')` para KPIs: nómina del período más reciente (`total_neto`), # colaboradores activos (`api.get('/colaboradores?activo=true')`). Render con `KpiCard`. COLABORADOR ve solo un resumen de su último rol (`/colaboradores/:suId`).

- [ ] **Colaboradores.jsx** (ADMIN, RRHH) — tabla desde `/colaboradores` con filtros tipo/estado; botón "Nuevo" abre form (`POST /colaboradores`); fila enlaza a `/colaboradores/:id`. `Badge` para tipo.

- [ ] **ColaboradorDetalle.jsx** — `/colaboradores/:id`: ficha + tabla de contratos (form "Nuevo contrato" → `POST /colaboradores/:id/contratos`), lista de roles de pago (enlace a `/roles/:id`), préstamos activos.

- [ ] **Periodos.jsx** (ADMIN, RRHH, GERENCIA) — lista desde `/periodos` con `Badge` de estado y `total_neto`; RoleGate ADMIN/RRHH para "Nuevo período" (form nombre/fechas/quincena → `POST /periodos`, muestra `creados`).

- [ ] **PeriodoDetalle.jsx** — `/periodos/:id`: tabla de roles_pago (colaborador, neto, estado_pago); botones Aprobar/Cerrar (`POST /periodos/:id/aprobar|cerrar`) visibles solo en el estado correcto vía la FSM del backend (deshabilitar según `estado`); enlace a cada `/roles/:id`.

- [ ] **RolPago.jsx** — `/roles/:id`: comprobante imprimible. Cabecera colaborador+período; tabla de `lineas` (ingresos/descuentos/provisiones separados); totales; botón "Imprimir" (`window.print()` + CSS `@media print`). Si período en BORRADOR y rol ADMIN/RRHH: form para agregar/eliminar líneas (`POST/DELETE /roles/:id/lineas`), recalcula al vuelo.

- [ ] **Proveedores.jsx** (ADMIN, RRHH) — lista `/facturas`; form nueva factura (`POST /facturas`, muestra retención calculada por el servidor); acción marcar PAGADA (`PATCH /facturas/:id`).

- [ ] **Prestamos.jsx** (ADMIN, RRHH) — lista `/prestamos` con saldo y `Badge` activo/saldado; form nuevo préstamo (`POST /prestamos`); PATCH cuota/activo.

- [ ] **Reportes.jsx** (ADMIN, RRHH, GERENCIA) — selector de período → botón "Descargar CSV" (link a `/api/reportes/periodo/:id.csv` con el token; usar `fetch`+blob si requiere header); tabla costo por departamento desde `/reportes/costo-departamento`.

- [ ] **Configuracion.jsx** (ADMIN) — gestión de usuarios (`/usuarios` GET/POST/PATCH, asignar rol y vincular `colaborador_id`) y edición de parámetros (`/parametros`, editar SBU con `PUT /parametros/SBU`).

Cada pantalla:
- [ ] Implementar el archivo siguiendo el contrato.
- [ ] Verificar manualmente en `npm run dev` (o test de render mínimo si aplica).
- [ ] Commit `feat: pantalla <nombre>`.

- [ ] **Cierre Fase 10:** correr `npm -w client run build` (sin errores) y `npm test` (server+client verdes).

```bash
git add client/src/pages
git commit -m "feat: pantallas de nómina (dashboard, colaboradores, períodos, rol, proveedores, préstamos, reportes, config)"
```

---

## Verificación final

- [ ] `npm test` en la raíz → todos los tests de server y client en verde.
- [ ] `npm -w client run build` sin errores.
- [ ] Arrancar `npm run dev`, iniciar sesión con Google, crear un colaborador IESS con contrato, generar un período de 2da quincena, verificar IESS 9.45% y provisiones en el comprobante, aprobar y cerrar, confirmar que ya no se editan líneas.
- [ ] Registrar un préstamo y confirmar amortización en el siguiente período.
- [ ] Crear una factura de proveedor y confirmar retención 10%.
- [ ] Descargar el CSV del período.

---

## Auto-revisión contra el spec

**Cobertura del spec (§):**
- §2 Stack/estructura/roles/identidad visual → Tasks 0, 13 (tokens Tailwind, sidebar+bottom nav, roles en middleware).
- §3 Modelo de datos (9 tablas + usuarios) → Task 1 (schema completo; se añaden `periodos.quincena` y `parametros` justificados).
- §4 Cálculos Ecuador (IESS 9.45/12.15, fondos 8.33, décimos, retención 10%, quincenas) → Tasks 3-5, 7, 11.
- §5 Diez pantallas → Tasks 14-15 (Login + 10 páginas).
- §6 Ciclo de vida período (BORRADOR→APROBADO→CERRADO irreversible, generación de roles) → Tasks 6-7, 9.
- §7 Fuera de alcance → respetado (sin IESS en línea, firma, import Excel, contabilidad).
- §8 Decisiones clave → `lineas_rol` auditable (Task 1,5), CERRADO irreversible (Task 6,9), provisiones excluidas del neto (Task 5), proveedor ambas modalidades (factura Task 11 / planilla vía flujo IESS), repo/BD independientes (Task 0).

**Sin placeholders:** cada step de código muestra el código; comandos con salida esperada; tipos consistentes (`calcularTotales`, `siguienteEstado`, `puedeEditarLineas`, `recalcularTotales`, `transicionarPeriodo` usados con las mismas firmas en todas las tareas).

**Desviación consciente declarada al usuario:** las 8 pantallas de datos (Task 15) se especifican a nivel de contrato en vez de JSX línea por línea — comparten un patrón idéntico (cargar/mostrar/enviar) y ahí no vive el riesgo del sistema. Los componentes base y el patrón completo están en Tasks 13-14 como referencia. Utilidades queda como campo manual (spec §4 lo define como "estimado"), no auto-calculado en Fase 1.
```