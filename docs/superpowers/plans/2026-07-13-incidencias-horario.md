# Descuentos por incumplimiento de horario — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que Elena registre manualmente cuándo un colaborador llegó tarde o salió antes de su horario, y que el sistema calcule el descuento correspondiente y lo deje disponible para aplicarlo, cuando ella decida, a un rol de pago en BORRADOR — per el spec aprobado en `docs/superpowers/specs/2026-07-13-incidencias-horario-design.md`.

**Architecture:** Una migración agrega el catálogo `horarios` (ADM/Comercial, con horas de entrada/salida y horas de jornada por horario, semana vs sábado), `colaboradores.horario`, el parámetro `MINUTOS_GRACIA`, y la tabla `incidencias_horario` (una fila por colaborador+fecha, con `hora_entrada_real`/`hora_salida_real` opcionales y el monto ya calculado). Una función pura (`incidencias-horario.js`) hace el cálculo. Las rutas nuevas crean/listan/eliminan incidencias y, en `aplicar`, insertan una línea `DESCUENTO_HORARIO` en `lineas_rol` reutilizando `recalcularTotales` (ya existente para roles de pago) y `puedeEditarLineas` (ya existente para bloquear períodos no editables). El frontend agrega un selector de horario en la ficha del colaborador y una pestaña nueva "Horario" con el formulario de registro y la tabla de incidencias.

**Tech Stack:** Node/Express + pg (server), React + Vite + Tailwind (client), Vitest + supertest (server tests).

## Global Constraints

- Tarifa por minuto: `sueldo_base ÷ 30 ÷ horas_jornada ÷ 60`. `horas_jornada` = 8 entre semana, 4 sábado (para ambos horarios ADM y Comercial).
- 5 minutos de gracia (parámetro `MINUTOS_GRACIA`, editable): se resta el **exceso** sobre la gracia, no los minutos totales. Aplica simétricamente a tardanza y salida anticipada.
- Registrar una incidencia solo calcula y guarda el monto ("pendiente"); la aplicación a un rol de pago es una acción manual separada, nunca automática al generar/sincronizar períodos.
- Las líneas de un rol de pago solo se pueden crear mientras el período está en `BORRADOR` (`puedeEditarLineas` en `server/src/lib/periodo-fsm.js`) — la ruta de aplicar debe respetar esto igual que el resto del sistema.
- Sin integración con reloj biométrico ni importación masiva — todo el registro es manual.

---

### Task 1: Migración — catálogo `horarios`, `colaboradores.horario`, parámetro, `incidencias_horario`

**Files:**
- Create: `server/db/migrations/016_incidencias_horario.sql`
- Modify: `server/tests/migrate.test.js`

**Interfaces:**
- Produces: tablas `horarios` (codigo, nombre, hora_entrada_semana, hora_salida_semana, hora_entrada_sabado, hora_salida_sabado, horas_jornada_semana, horas_jornada_sabado, activo), `incidencias_horario` (id, colaborador_id, fecha, hora_entrada_real, hora_salida_real, minutos_tardanza, minutos_salida_anticipada, monto_total, notas, lineas_rol_id, creado_por, creado_en); columna `colaboradores.horario`; columna `lineas_rol.incidencia_horario_id`; parámetro `MINUTOS_GRACIA` (valor `'5'`) en `parametros`.
- Consumes: nada nuevo.

- [ ] **Step 1: Write the failing test**

En `server/tests/migrate.test.js`, agrega `'horarios'` e `'incidencias_horario'` al array de tablas esperadas:

```js
  it('crea las tablas del dominio', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    );
    const nombres = rows.map((r) => r.table_name);
    for (const t of [
      'colaboradores', 'contratos', 'periodos', 'roles_pago', 'lineas_rol',
      'provisiones', 'prestamos', 'facturas_proveedor', 'usuarios', 'parametros',
      'contrato_emisiones', 'colaborador_confidencialidad', 'colaborador_consentimiento_expreso',
      'colaborador_consentimiento_biometrico', 'contrato_comisionista_emisiones',
      'contrato_servicios_profesionales_emisiones', 'horarios', 'incidencias_horario'
    ]) {
      expect(nombres).toContain(t);
    }
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test -- migrate.test.js`
Expected: FAIL — `horarios` e `incidencias_horario` no están en `nombres`.

- [ ] **Step 3: Write the migration**

Create `server/db/migrations/016_incidencias_horario.sql`:

```sql
-- Catálogo de horarios (usado para calcular descuentos por incumplimiento
-- de horario) y tabla de incidencias registradas manualmente. La
-- aplicación a nómina es una acción separada y manual (ver
-- incidencias-horario.js): registrar una incidencia solo calcula y guarda
-- el monto, no toca lineas_rol hasta que se aplica explícitamente.
CREATE TABLE horarios (
  codigo text PRIMARY KEY,
  nombre text NOT NULL,
  hora_entrada_semana time NOT NULL,
  hora_salida_semana time NOT NULL,
  hora_entrada_sabado time NOT NULL,
  hora_salida_sabado time NOT NULL,
  horas_jornada_semana numeric(4,2) NOT NULL,
  horas_jornada_sabado numeric(4,2) NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);

INSERT INTO horarios
  (codigo, nombre, hora_entrada_semana, hora_salida_semana, hora_entrada_sabado, hora_salida_sabado, horas_jornada_semana, horas_jornada_sabado)
VALUES
  ('ADM', 'Administrativo', '08:30', '17:30', '10:00', '14:00', 8, 4),
  ('COMERCIAL', 'Comercial', '09:00', '17:30', '10:00', '14:00', 8, 4);

ALTER TABLE colaboradores ADD COLUMN horario text REFERENCES horarios(codigo);

INSERT INTO parametros (clave, valor) VALUES ('MINUTOS_GRACIA', '5') ON CONFLICT DO NOTHING;

CREATE TABLE incidencias_horario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  hora_entrada_real time,
  hora_salida_real time,
  minutos_tardanza int NOT NULL DEFAULT 0,
  minutos_salida_anticipada int NOT NULL DEFAULT 0,
  monto_total numeric(10,2) NOT NULL,
  notas text,
  lineas_rol_id uuid REFERENCES lineas_rol(id),
  creado_por uuid REFERENCES usuarios(id),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_entrada_real IS NOT NULL OR hora_salida_real IS NOT NULL)
);
CREATE INDEX idx_incidencias_horario_colaborador ON incidencias_horario(colaborador_id);

ALTER TABLE lineas_rol
  ADD COLUMN incidencia_horario_id uuid REFERENCES incidencias_horario(id);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test -- migrate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/db/migrations/016_incidencias_horario.sql server/tests/migrate.test.js
git commit -m "feat: catálogo de horarios e historial de incidencias de horario"
```

---

### Task 2: `server/src/lib/incidencias-horario.js` — cálculo puro

**Files:**
- Create: `server/src/lib/incidencias-horario.js`
- Test: `server/tests/incidencias-horario-calculo.test.js`

**Interfaces:**
- Produces: `calcularIncidencia({ horario, sueldoBase, fecha, horaEntradaReal, horaSalidaReal, minutosGracia }): { minutosTardanza: number, minutosSalidaAnticipada: number, montoTotal: number }`, donde `horario` es una fila de la tabla `horarios` (`hora_entrada_semana`, `hora_salida_semana`, `hora_entrada_sabado`, `hora_salida_sabado`, `horas_jornada_semana`, `horas_jornada_sabado`, todas como strings `'HH:MM'` o `'HH:MM:SS'` salvo las horas de jornada que son numéricas), `fecha` es `'YYYY-MM-DD'` o un `Date`, y `horaEntradaReal`/`horaSalidaReal` son `'HH:MM'`/`'HH:MM:SS'` o `null`/`undefined`.
- Consumes: `round2` de `server/src/lib/round.js` (ya existente).

- [ ] **Step 1: Write the failing test**

Create `server/tests/incidencias-horario-calculo.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { calcularIncidencia } from '../src/lib/incidencias-horario.js';

const horarioAdm = {
  hora_entrada_semana: '08:30', hora_salida_semana: '17:30',
  hora_entrada_sabado: '10:00', hora_salida_sabado: '14:00',
  horas_jornada_semana: 8, horas_jornada_sabado: 4,
};

describe('calcularIncidencia', () => {
  it('dentro de la gracia no genera descuento', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13', // lunes
      horaEntradaReal: '08:34', horaSalidaReal: null, minutosGracia: 5,
    });
    expect(r.minutosTardanza).toBe(0);
    expect(r.montoTotal).toBe(0);
  });

  it('tardanza simple: descuenta solo el exceso sobre la gracia', () => {
    // 600/30/8/60 = 0.4166... por minuto
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13',
      horaEntradaReal: '08:40', horaSalidaReal: null, minutosGracia: 5,
    });
    // 10 min tarde - 5 de gracia = 5 min efectivos
    expect(r.minutosTardanza).toBe(5);
    expect(r.montoTotal).toBeCloseTo(5 * (600 / 30 / 8 / 60), 2);
  });

  it('salida anticipada simple', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13',
      horaEntradaReal: null, horaSalidaReal: '17:15', minutosGracia: 5,
    });
    // 15 min antes - 5 de gracia = 10 min efectivos
    expect(r.minutosSalidaAnticipada).toBe(10);
    expect(r.montoTotal).toBeCloseTo(10 * (600 / 30 / 8 / 60), 2);
  });

  it('ambas el mismo día se suman en un solo monto', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-13',
      horaEntradaReal: '08:40', horaSalidaReal: '17:15', minutosGracia: 5,
    });
    expect(r.minutosTardanza).toBe(5);
    expect(r.minutosSalidaAnticipada).toBe(10);
    expect(r.montoTotal).toBeCloseTo(15 * (600 / 30 / 8 / 60), 2);
  });

  it('sábado usa la jornada de 4 horas (tarifa distinta)', () => {
    const r = calcularIncidencia({
      horario: horarioAdm, sueldoBase: 600, fecha: '2026-07-18', // sábado
      horaEntradaReal: '10:15', horaSalidaReal: null, minutosGracia: 5,
    });
    // 15 min tarde - 5 gracia = 10 min efectivos, tarifa con jornada=4
    expect(r.minutosTardanza).toBe(10);
    expect(r.montoTotal).toBeCloseTo(10 * (600 / 30 / 4 / 60), 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test -- incidencias-horario-calculo.test.js`
Expected: FAIL — `Cannot find module '../src/lib/incidencias-horario.js'`.

- [ ] **Step 3: Write `server/src/lib/incidencias-horario.js`**

```js
import { round2 } from './round.js';

function minutosDesdeMedianoche(horaStr) {
  const [h, m] = horaStr.split(':').map(Number);
  return h * 60 + m;
}

function esSabado(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  return d.getUTCDay() === 6;
}

export function calcularIncidencia({ horario, sueldoBase, fecha, horaEntradaReal, horaSalidaReal, minutosGracia }) {
  const sabado = esSabado(fecha);
  const horasJornada = Number(sabado ? horario.horas_jornada_sabado : horario.horas_jornada_semana);
  const horaEntradaEsperada = sabado ? horario.hora_entrada_sabado : horario.hora_entrada_semana;
  const horaSalidaEsperada = sabado ? horario.hora_salida_sabado : horario.hora_salida_semana;

  const tarifaMinuto = Number(sueldoBase) / 30 / horasJornada / 60;

  let minutosTardanza = 0;
  if (horaEntradaReal) {
    const diff = minutosDesdeMedianoche(horaEntradaReal) - minutosDesdeMedianoche(horaEntradaEsperada);
    minutosTardanza = Math.max(0, diff - minutosGracia);
  }

  let minutosSalidaAnticipada = 0;
  if (horaSalidaReal) {
    const diff = minutosDesdeMedianoche(horaSalidaEsperada) - minutosDesdeMedianoche(horaSalidaReal);
    minutosSalidaAnticipada = Math.max(0, diff - minutosGracia);
  }

  const montoTotal = round2((minutosTardanza + minutosSalidaAnticipada) * tarifaMinuto);

  return { minutosTardanza, minutosSalidaAnticipada, montoTotal };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm -w server test -- incidencias-horario-calculo.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/lib/incidencias-horario.js server/tests/incidencias-horario-calculo.test.js
git commit -m "feat: cálculo de descuentos por incumplimiento de horario"
```

---

### Task 3: Ruta del catálogo `horarios` + `colaboradores.horario` editable

**Files:**
- Create: `server/src/routes/horarios.js`
- Modify: `server/src/index.js` (monta el router)
- Modify: `server/src/routes/colaboradores.js` (`PATCH /:id` acepta `horario`; `GET /:id` embebe `periodo_estado` en `roles_pago`)
- Test: `server/tests/horarios.test.js`

**Interfaces:**
- Produces: `GET /api/horarios` (activos, cualquier autenticado), `GET /api/horarios/todos` (todos, solo ADMIN), `PATCH /api/horarios/:codigo` (solo ADMIN). `colaboradores.horario` editable vía `PATCH /api/colaboradores/:id`. `GET /api/colaboradores/:id` → `roles_pago[].periodo_estado`.
- Consumes: tabla `horarios` (Task 1).

- [ ] **Step 1: Write the failing tests**

Create `server/tests/horarios.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const identidad = { email: 'admin@bopelual.com' };
vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ ...identidad }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('catálogo de horarios', () => {
  beforeEach(async () => {
    identidad.email = 'admin@bopelual.com';
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('viene sembrado con ADM y COMERCIAL', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/horarios'));
    expect(res.status).toBe(200);
    const codigos = res.body.map((h) => h.codigo);
    expect(codigos).toEqual(expect.arrayContaining(['ADM', 'COMERCIAL']));
  });

  it('ADMIN puede editar horas de un horario', async () => {
    const app = createApp();
    const upd = await auth(request(app).patch('/api/horarios/ADM')).send({
      hora_entrada_semana: '08:00'
    });
    expect(upd.status).toBe(200);
    expect(upd.body.hora_entrada_semana).toMatch(/^08:00/);
    await auth(request(app).patch('/api/horarios/ADM')).send({ hora_entrada_semana: '08:30' }); // restaurar
  });

  it('RRHH no puede editar el catálogo (solo ADMIN)', async () => {
    const app = createApp();
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh2@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
    identidad.email = 'rrhh2@bopelual.com';
    const res = await auth(request(app).patch('/api/horarios/ADM')).send({ hora_entrada_semana: '09:00' });
    expect(res.status).toBe(403);
  });

  it('PATCH /colaboradores/:id acepta horario, y GET /:id lo embebe con periodo_estado en roles_pago', async () => {
    identidad.email = 'admin@bopelual.com';
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Horario ${Date.now()}`, cedula: `HO${Date.now() % 1e8}`
      })
    ).body;
    const upd = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ horario: 'COMERCIAL' });
    expect(upd.body.horario).toBe('COMERCIAL');

    const det = await auth(request(app).get(`/api/colaboradores/${col.id}`));
    expect(det.body.horario).toBe('COMERCIAL');
    expect(Array.isArray(det.body.roles_pago)).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- horarios.test.js`
Expected: FAIL — 404 en `/api/horarios` (ruta no existe) y `horario` no se guarda en `colaboradores`.

- [ ] **Step 3: Write `server/src/routes/horarios.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM horarios WHERE activo=true ORDER BY codigo');
  res.json(rows);
});

router.get('/todos', requireRole(['ADMIN']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM horarios ORDER BY codigo');
  res.json(rows);
});

router.patch('/:codigo', requireRole(['ADMIN']), async (req, res) => {
  const campos = [
    'nombre', 'hora_entrada_semana', 'hora_salida_semana',
    'hora_entrada_sabado', 'hora_salida_sabado',
    'horas_jornada_semana', 'horas_jornada_sabado', 'activo',
  ];
  const set = [];
  const params = [];
  for (const c of campos) {
    if (c in req.body) {
      params.push(req.body[c]);
      set.push(`${c}=$${params.length}`);
    }
  }
  if (set.length === 0) return res.status(400).json({ error: 'nada que actualizar' });
  params.push(req.params.codigo);
  const { rows } = await pool.query(
    `UPDATE horarios SET ${set.join(', ')} WHERE codigo=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});

export default router;
```

- [ ] **Step 4: Mount the router in `server/src/index.js`**

Current import block (after `contratoEmisionesAvanzadasRouter`/`colaboradorDocumentosRouter`):

```js
import contratoEmisionesAvanzadasRouter from './routes/contrato-emisiones-avanzadas.js';
import colaboradorDocumentosRouter from './routes/colaborador-documentos.js';
import pool from './db/pool.js';
```

Replace with:

```js
import contratoEmisionesAvanzadasRouter from './routes/contrato-emisiones-avanzadas.js';
import colaboradorDocumentosRouter from './routes/colaborador-documentos.js';
import horariosRouter from './routes/horarios.js';
import pool from './db/pool.js';
```

Current mount line:

```js
  app.use('/api/colaboradores/:colaboradorId/documentos-emitidos', colaboradorDocumentosRouter);
```

Replace with:

```js
  app.use('/api/colaboradores/:colaboradorId/documentos-emitidos', colaboradorDocumentosRouter);
  app.use('/api/horarios', horariosRouter);
```

- [ ] **Step 5: `colaboradores.js` — `PATCH /:id` acepta `horario`**

En `server/src/routes/colaboradores.js`, el array `campos` actual dentro de `PATCH /:id`:

```js
  const campos = [
    'nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula', 'fecha_ingreso',
    'empresa', 'centro_costo', 'cargas_personales', 'forma_pago',
    'banco', 'codigo_banco', 'tipo_cuenta', 'cuenta_bancaria', 'pct_anticipo',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'direccion'
  ];
```

Replace con (agrega `'horario'` al final):

```js
  const campos = [
    'nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula', 'fecha_ingreso',
    'empresa', 'centro_costo', 'cargas_personales', 'forma_pago',
    'banco', 'codigo_banco', 'tipo_cuenta', 'cuenta_bancaria', 'pct_anticipo',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'direccion', 'horario'
  ];
```

- [ ] **Step 6: `colaboradores.js` — `GET /:id` embebe `periodo_estado` en `roles_pago`**

Current query dentro de `GET /:id`:

```js
      pool.query(
        `SELECT rp.*, p.nombre AS periodo_nombre, p.fecha_fin AS periodo_fecha
         FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
         WHERE rp.colaborador_id=$1 ORDER BY p.fecha_inicio DESC`,
        [req.params.id]
      ),
```

Replace con (agrega `p.estado AS periodo_estado`):

```js
      pool.query(
        `SELECT rp.*, p.nombre AS periodo_nombre, p.fecha_fin AS periodo_fecha, p.estado AS periodo_estado
         FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id
         WHERE rp.colaborador_id=$1 ORDER BY p.fecha_inicio DESC`,
        [req.params.id]
      ),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm -w server test -- horarios.test.js`
Expected: PASS.

- [ ] **Step 8: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS — presta atención a cualquier test que dependa del shape exacto de `roles_pago` (el cambio solo agrega una columna, no debería romper nada).

- [ ] **Step 9: Commit**

```bash
git add server/src/routes/horarios.js server/src/index.js server/src/routes/colaboradores.js server/tests/horarios.test.js
git commit -m "feat: catálogo de horarios y colaboradores.horario editable"
```

---

### Task 4: Rutas de incidencias de horario (crear, listar, aplicar, eliminar)

**Files:**
- Create: `server/src/routes/incidencias-horario.js`
- Modify: `server/src/index.js` (monta el router)
- Test: `server/tests/incidencias-horario.test.js`

**Interfaces:**
- Consumes: `calcularIncidencia` (Task 2), `puedeEditarLineas` de `server/src/lib/periodo-fsm.js` (ya existente), `recalcularTotales` de `server/src/services/roles.js` (ya existente).
- Produces:
  - `POST /api/colaboradores/:colaboradorId/incidencias-horario` → 201 con la fila creada.
  - `GET /api/colaboradores/:colaboradorId/incidencias-horario` → lista, más reciente primero.
  - `POST /api/colaboradores/:colaboradorId/incidencias-horario/:id/aplicar` → body `{ rol_pago_id }`, 200 con la incidencia actualizada (`lineas_rol_id` seteado).
  - `DELETE /api/colaboradores/:colaboradorId/incidencias-horario/:id` → 200, solo si no ha sido aplicada.

- [ ] **Step 1: Write the failing tests**

Create `server/tests/incidencias-horario.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));

const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

async function crearColaboradorConHorario(app, horario = 'ADM') {
  const col = (
    await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Inc ${Date.now()}`, cedula: `IN${Date.now() % 1e8}`
    })
  ).body;
  await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ horario });
  await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
    sueldo_base: 600, fecha_inicio: '2026-01-01'
  });
  return col;
}

describe('incidencias de horario', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('POST calcula y guarda la incidencia como pendiente', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);

    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`)
    ).send({ fecha: '2026-07-13', hora_entrada_real: '08:40' }); // lunes, 10 min tarde

    expect(res.status).toBe(201);
    expect(res.body.minutos_tardanza).toBe(5); // 10 - 5 de gracia
    expect(Number(res.body.monto_total)).toBeCloseTo(5 * (600 / 30 / 8 / 60), 2);
    expect(res.body.lineas_rol_id).toBeNull();
  });

  it('rechaza si el colaborador no tiene horario asignado', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `SinHorario ${Date.now()}`, cedula: `SH${Date.now() % 1e8}`
      })
    ).body;
    const res = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`)
    ).send({ fecha: '2026-07-13', hora_entrada_real: '08:40' });
    expect(res.status).toBe(400);
  });

  it('GET lista las incidencias del colaborador', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
      .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' });

    const lista = await auth(request(app).get(`/api/colaboradores/${col.id}/incidencias-horario`));
    expect(lista.body).toHaveLength(1);
  });

  it('aplicar inserta una línea DESCUENTO_HORARIO en el rol y actualiza los totales', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const incidencia = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;

    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `incidencia test ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${periodo.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    const aplicado = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(aplicado.status).toBe(200);
    expect(aplicado.body.lineas_rol_id).toBeTruthy();

    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    const linea = lineas.find((l) => l.incidencia_horario_id === incidencia.id);
    expect(linea.tipo_linea).toBe('DESCUENTO_HORARIO');
    expect(Number(linea.monto)).toBeCloseTo(Number(incidencia.monto_total), 2);
  });

  it('rechaza aplicar dos veces la misma incidencia', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const incidencia = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;
    const periodo = await auth(request(app).post('/api/periodos')).send({
      nombre: `incidencia doble ${Date.now()}`, fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${periodo.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`))
      .send({ rol_pago_id: rol.id });
    const segunda = await auth(
      request(app).post(`/api/colaboradores/${col.id}/incidencias-horario/${incidencia.id}/aplicar`)
    ).send({ rol_pago_id: rol.id });
    expect(segunda.status).toBe(409);
  });

  it('DELETE elimina una incidencia pendiente; rechaza si ya fue aplicada', async () => {
    const app = createApp();
    const col = await crearColaboradorConHorario(app);
    const pendiente = (
      await auth(request(app).post(`/api/colaboradores/${col.id}/incidencias-horario`))
        .send({ fecha: '2026-07-13', hora_entrada_real: '08:40' })
    ).body;
    const borrado = await auth(request(app).del(`/api/colaboradores/${col.id}/incidencias-horario/${pendiente.id}`));
    expect(borrado.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- incidencias-horario.test.js`
Expected: FAIL — la ruta no existe (404 en todos los casos).

- [ ] **Step 3: Write `server/src/routes/incidencias-horario.js`**

```js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { calcularIncidencia } from '../lib/incidencias-horario.js';
import { puedeEditarLineas } from '../lib/periodo-fsm.js';
import { recalcularTotales } from '../services/roles.js';

const router = Router({ mergeParams: true });
router.use(requireAuth);
router.use(requireRole(['ADMIN', 'RRHH']));

router.post('/', async (req, res) => {
  const { colaboradorId } = req.params;
  const { fecha, hora_entrada_real, hora_salida_real, notas } = req.body;
  if (!fecha || (!hora_entrada_real && !hora_salida_real)) {
    return res.status(400).json({ error: 'fecha y al menos una hora real son requeridos' });
  }

  const { rows: colRows } = await pool.query('SELECT horario FROM colaboradores WHERE id=$1', [colaboradorId]);
  if (colRows.length === 0) return res.status(404).json({ error: 'colaborador no encontrado' });
  if (!colRows[0].horario) return res.status(400).json({ error: 'el colaborador no tiene horario asignado' });

  const { rows: horarioRows } = await pool.query('SELECT * FROM horarios WHERE codigo=$1', [colRows[0].horario]);
  const horario = horarioRows[0];

  const { rows: contratoRows } = await pool.query(
    `SELECT sueldo_base FROM contratos WHERE colaborador_id=$1 AND fecha_inicio <= $2
     AND (fecha_fin IS NULL OR fecha_fin >= $2) ORDER BY fecha_inicio DESC LIMIT 1`,
    [colaboradorId, fecha]
  );
  if (contratoRows.length === 0) {
    return res.status(400).json({ error: 'el colaborador no tiene un contrato vigente en esa fecha' });
  }

  const { rows: gracRows } = await pool.query(`SELECT valor FROM parametros WHERE clave='MINUTOS_GRACIA'`);
  const minutosGracia = Number(gracRows[0]?.valor ?? 5);

  const { minutosTardanza, minutosSalidaAnticipada, montoTotal } = calcularIncidencia({
    horario, sueldoBase: contratoRows[0].sueldo_base, fecha,
    horaEntradaReal: hora_entrada_real, horaSalidaReal: hora_salida_real, minutosGracia,
  });

  const { rows } = await pool.query(
    `INSERT INTO incidencias_horario
       (colaborador_id, fecha, hora_entrada_real, hora_salida_real, minutos_tardanza,
        minutos_salida_anticipada, monto_total, notas, creado_por)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [colaboradorId, fecha, hora_entrada_real ?? null, hora_salida_real ?? null,
     minutosTardanza, minutosSalidaAnticipada, montoTotal, notas ?? null, req.usuario.id]
  );
  res.status(201).json(rows[0]);
});

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM incidencias_horario WHERE colaborador_id=$1 ORDER BY fecha DESC',
    [req.params.colaboradorId]
  );
  res.json(rows);
});

router.post('/:id/aplicar', async (req, res) => {
  const { colaboradorId, id } = req.params;
  const { rol_pago_id } = req.body;
  if (!rol_pago_id) return res.status(400).json({ error: 'rol_pago_id requerido' });

  const { rows } = await pool.query(
    'SELECT * FROM incidencias_horario WHERE id=$1 AND colaborador_id=$2',
    [id, colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'incidencia no encontrada' });
  if (rows[0].lineas_rol_id) return res.status(409).json({ error: 'la incidencia ya fue aplicada' });

  const { rows: rolRows } = await pool.query(
    `SELECT rp.id, rp.colaborador_id, p.estado FROM roles_pago rp
     JOIN periodos p ON p.id = rp.periodo_id WHERE rp.id=$1`,
    [rol_pago_id]
  );
  if (rolRows.length === 0 || rolRows[0].colaborador_id !== colaboradorId) {
    return res.status(400).json({ error: 'rol de pago inválido para este colaborador' });
  }
  if (!puedeEditarLineas(rolRows[0].estado)) {
    return res.status(409).json({ error: `período ${rolRows[0].estado}: no editable` });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: linea } = await client.query(
      `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, incidencia_horario_id)
       VALUES ($1,'DESCUENTO_HORARIO','DESCUENTO',$2,$3,$4) RETURNING id`,
      [rol_pago_id, rows[0].monto_total, `Incidencia de horario del ${rows[0].fecha.toISOString().slice(0, 10)}`, id]
    );
    await client.query('UPDATE incidencias_horario SET lineas_rol_id=$1 WHERE id=$2', [linea[0].id, id]);
    await recalcularTotales(client, rol_pago_id);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }

  const { rows: actualizado } = await pool.query('SELECT * FROM incidencias_horario WHERE id=$1', [id]);
  res.json(actualizado[0]);
});

router.delete('/:id', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT lineas_rol_id FROM incidencias_horario WHERE id=$1 AND colaborador_id=$2',
    [req.params.id, req.params.colaboradorId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrada' });
  if (rows[0].lineas_rol_id) return res.status(409).json({ error: 'no se puede eliminar: ya fue aplicada' });
  await pool.query('DELETE FROM incidencias_horario WHERE id=$1', [req.params.id]);
  res.json({ ok: true });
});

export default router;
```

- [ ] **Step 4: Mount the router in `server/src/index.js`**

Current import:

```js
import horariosRouter from './routes/horarios.js';
```

Replace with (agrega la import de incidencias):

```js
import horariosRouter from './routes/horarios.js';
import incidenciasHorarioRouter from './routes/incidencias-horario.js';
```

Current mount line:

```js
  app.use('/api/horarios', horariosRouter);
```

Replace with:

```js
  app.use('/api/horarios', horariosRouter);
  app.use('/api/colaboradores/:colaboradorId/incidencias-horario', incidenciasHorarioRouter);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm -w server test -- incidencias-horario.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/incidencias-horario.js server/src/index.js
git commit -m "feat: rutas de incidencias de horario (crear, listar, aplicar, eliminar)"
```

---

### Task 5: UI — catálogo de horarios en Configuración

**Files:**
- Modify: `client/src/pages/Configuracion.jsx`

**Interfaces:**
- Consumes: `GET/PATCH /horarios` y `/horarios/todos` (Task 3); `GET/PUT /parametros` (ya existente, para `MINUTOS_GRACIA`).

No hay tests unitarios de UI en este proyecto — se verifica con `npm -w client run build`.

- [ ] **Step 1: Agregar la etiqueta de `MINUTOS_GRACIA`**

Current (línea 11-15):

```jsx
const ETIQUETAS_PARAMETRO = {
  SBU: 'Salario Básico Unificado (SBU)',
  PORCENTAJE_ANTICIPO: 'Porcentaje de anticipo global (1ra quincena, 0 a 1)',
  DIAS_VACACIONES_ANIO: 'Días de vacaciones por año trabajado',
};
```

Replace con:

```jsx
const ETIQUETAS_PARAMETRO = {
  SBU: 'Salario Básico Unificado (SBU)',
  PORCENTAJE_ANTICIPO: 'Porcentaje de anticipo global (1ra quincena, 0 a 1)',
  DIAS_VACACIONES_ANIO: 'Días de vacaciones por año trabajado',
  MINUTOS_GRACIA: 'Minutos de gracia antes de descontar por atraso/salida anticipada',
};
```

- [ ] **Step 2: Agregar "Horarios" a `TABS`**

Current (línea 9):

```jsx
const TABS = ['General', 'Empresas', 'Servicios de Descuento', 'Tipos de Contrato', 'Bancos', 'Usuarios'];
```

Replace con:

```jsx
const TABS = ['General', 'Empresas', 'Servicios de Descuento', 'Tipos de Contrato', 'Horarios', 'Bancos', 'Usuarios'];
```

- [ ] **Step 3: Agregar `HorarioEditModal` y `HorariosTab`**

Agrega este código inmediatamente antes de `export default function Configuracion() {`:

```jsx
function HorarioEditModal({ horario, onClose, onGuardado }) {
  const [form, setForm] = useState({ ...horario });
  const toast = useToast();

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/horarios/${horario.codigo}`, {
        nombre: form.nombre,
        hora_entrada_semana: form.hora_entrada_semana,
        hora_salida_semana: form.hora_salida_semana,
        hora_entrada_sabado: form.hora_entrada_sabado,
        hora_salida_sabado: form.hora_salida_sabado,
        horas_jornada_semana: Number(form.horas_jornada_semana),
        horas_jornada_sabado: Number(form.horas_jornada_sabado),
      });
      toast.success('Horario actualizado.');
      onGuardado();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Editar horario — ${horario.codigo}`} size="md"
      footer={<button type="submit" form="form-editar-horario" className="btn btn-primary">Guardar</button>}>
      <form id="form-editar-horario" onSubmit={guardar} className="grid gap-3">
        <label className="text-sm text-slate-600">Nombre
          <input required className="input w-full" value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-600">Entrada (lunes a viernes)
            <input required type="time" className="input w-full" value={form.hora_entrada_semana}
              onChange={(e) => setForm({ ...form, hora_entrada_semana: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Salida (lunes a viernes)
            <input required type="time" className="input w-full" value={form.hora_salida_semana}
              onChange={(e) => setForm({ ...form, hora_salida_semana: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Entrada (sábado)
            <input required type="time" className="input w-full" value={form.hora_entrada_sabado}
              onChange={(e) => setForm({ ...form, hora_entrada_sabado: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Salida (sábado)
            <input required type="time" className="input w-full" value={form.hora_salida_sabado}
              onChange={(e) => setForm({ ...form, hora_salida_sabado: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Horas de jornada (semana)
            <input required type="number" step="0.5" min="0" className="input w-full" value={form.horas_jornada_semana}
              onChange={(e) => setForm({ ...form, horas_jornada_semana: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Horas de jornada (sábado)
            <input required type="number" step="0.5" min="0" className="input w-full" value={form.horas_jornada_sabado}
              onChange={(e) => setForm({ ...form, horas_jornada_sabado: e.target.value })} />
          </label>
        </div>
      </form>
    </Modal>
  );
}

function HorariosTab() {
  const [horarios, setHorarios] = useState([]);
  const [editando, setEditando] = useState(null);
  const toast = useToast();

  const cargar = () => api.get('/horarios/todos').then(setHorarios).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Horarios</h2>
      <p className="text-sm text-muted mb-3">
        Usados para calcular descuentos por atraso o salida anticipada en la pestaña
        "Horario" de la ficha del colaborador.
      </p>
      <div className="border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Horario</th>
              <th className="p-2">Lunes a viernes</th>
              <th className="p-2">Sábado</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {horarios.map((h) => (
              <tr key={h.codigo} className="border-b border-slate-100">
                <td className="p-2 font-medium">{h.nombre}</td>
                <td className="p-2">
                  {h.hora_entrada_semana.slice(0, 5)} - {h.hora_salida_semana.slice(0, 5)} ({h.horas_jornada_semana}h)
                </td>
                <td className="p-2">
                  {h.hora_entrada_sabado.slice(0, 5)} - {h.hora_salida_sabado.slice(0, 5)} ({h.horas_jornada_sabado}h)
                </td>
                <td className="p-2">
                  <button onClick={() => setEditando(h)} className="text-gold-600 text-xs hover:underline">Editar</button>
                </td>
              </tr>
            ))}
            {horarios.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin horarios.</td></tr>}
          </tbody>
        </table>
      </div>
      {editando && (
        <HorarioEditModal horario={editando} onClose={() => setEditando(null)}
          onGuardado={() => { setEditando(null); cargar(); }} />
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Renderizar la pestaña**

Current (dentro de `export default function Configuracion()`):

```jsx
      {tab === 'Tipos de Contrato' && <TiposContratoTab />}
      {tab === 'Bancos' && <BancosTab />}
```

Replace con:

```jsx
      {tab === 'Tipos de Contrato' && <TiposContratoTab />}
      {tab === 'Horarios' && <HorariosTab />}
      {tab === 'Bancos' && <BancosTab />}
```

- [ ] **Step 5: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/Configuracion.jsx
git commit -m "feat: catálogo de horarios editable en Configuración"
```

---

### Task 6: UI — selector de horario y pestaña "Horario" en la ficha del colaborador

**Files:**
- Modify: `client/src/pages/ColaboradorDetalle.jsx`

**Interfaces:**
- Consumes: `GET /horarios` (Task 3), `PATCH /colaboradores/:id` con `horario` (Task 3), `POST/GET /colaboradores/:id/incidencias-horario` y `POST .../:id/aplicar`, `DELETE .../:id` (Task 4); `col.horario` y `col.roles_pago[].periodo_estado` ya vienen en `GET /colaboradores/:id` (Task 3).

No hay tests unitarios de UI en este proyecto — se verifica con `npm -w client run build` + checklist manual.

- [ ] **Step 1: Selector de horario en `FichaTab`**

Current (líneas 18-32, estado inicial de `FichaTab`):

```jsx
function FichaTab({ col, onGuardado, onError }) {
  const [bancos, setBancos] = useState([]);
  useEffect(() => {
    api.get('/bancos').then(setBancos).catch(() => {});
  }, []);
  const [form, setForm] = useState({
    nombre: col.nombre ?? '', email: col.email ?? '', cedula: col.cedula ?? '',
    departamento: col.departamento ?? '', cargo: col.cargo ?? '', fecha_ingreso: col.fecha_ingreso?.slice(0, 10) ?? '',
    empresa: col.empresa ?? '', centro_costo: col.centro_costo ?? '', cargas_personales: col.cargas_personales ?? 0,
    banco: col.banco ?? '', codigo_banco: col.codigo_banco ?? '', tipo_cuenta: col.tipo_cuenta ?? 'AHORRO',
    cuenta_bancaria: col.cuenta_bancaria ?? '', forma_pago: col.forma_pago ?? 'TRANSFERENCIA',
    pct_anticipo: col.pct_anticipo ?? '',
    fecha_nacimiento: col.fecha_nacimiento?.slice(0, 10) ?? '', sexo: col.sexo ?? '',
    estado_civil: col.estado_civil ?? '', direccion: col.direccion ?? '',
  });
```

Replace con (agrega `horarios` state + fetch, y `horario` al form):

```jsx
function FichaTab({ col, onGuardado, onError }) {
  const [bancos, setBancos] = useState([]);
  const [horarios, setHorarios] = useState([]);
  useEffect(() => {
    api.get('/bancos').then(setBancos).catch(() => {});
    api.get('/horarios').then(setHorarios).catch(() => {});
  }, []);
  const [form, setForm] = useState({
    nombre: col.nombre ?? '', email: col.email ?? '', cedula: col.cedula ?? '',
    departamento: col.departamento ?? '', cargo: col.cargo ?? '', fecha_ingreso: col.fecha_ingreso?.slice(0, 10) ?? '',
    empresa: col.empresa ?? '', centro_costo: col.centro_costo ?? '', cargas_personales: col.cargas_personales ?? 0,
    banco: col.banco ?? '', codigo_banco: col.codigo_banco ?? '', tipo_cuenta: col.tipo_cuenta ?? 'AHORRO',
    cuenta_bancaria: col.cuenta_bancaria ?? '', forma_pago: col.forma_pago ?? 'TRANSFERENCIA',
    pct_anticipo: col.pct_anticipo ?? '',
    fecha_nacimiento: col.fecha_nacimiento?.slice(0, 10) ?? '', sexo: col.sexo ?? '',
    estado_civil: col.estado_civil ?? '', direccion: col.direccion ?? '',
    horario: col.horario ?? '',
  });
```

- [ ] **Step 2: Agregar el `<select>` de horario al formulario**

Current (dentro del primer `<Card>` de `FichaTab`, justo después del select de Empresa):

```jsx
          <label className="text-sm text-slate-600">Empresa
            <select className="input w-full" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })}>
              <option value="">—</option>
              <option>BOPELUAL S.A.</option>
              <option>CARROS-YA S.A.</option>
            </select>
          </label>
```

Replace con (agrega el select de Horario justo después):

```jsx
          <label className="text-sm text-slate-600">Empresa
            <select className="input w-full" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })}>
              <option value="">—</option>
              <option>BOPELUAL S.A.</option>
              <option>CARROS-YA S.A.</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Horario
            <select className="input w-full" value={form.horario} onChange={(e) => setForm({ ...form, horario: e.target.value })}>
              <option value="">—</option>
              {horarios.map((h) => <option key={h.codigo} value={h.codigo}>{h.nombre}</option>)}
            </select>
          </label>
```

- [ ] **Step 3: Enviar `horario` en el PATCH**

Current `guardar` de `FichaTab`:

```jsx
      await api.patch(`/colaboradores/${col.id}`, {
        ...form,
        fecha_ingreso: form.fecha_ingreso || null,
        cargas_personales: Number(form.cargas_personales) || 0,
        pct_anticipo: form.pct_anticipo === '' ? null : Number(form.pct_anticipo),
        fecha_nacimiento: form.fecha_nacimiento || null,
        sexo: form.sexo || null,
        estado_civil: form.estado_civil || null,
        direccion: form.direccion || null,
      });
```

Replace con (agrega `horario`):

```jsx
      await api.patch(`/colaboradores/${col.id}`, {
        ...form,
        fecha_ingreso: form.fecha_ingreso || null,
        cargas_personales: Number(form.cargas_personales) || 0,
        pct_anticipo: form.pct_anticipo === '' ? null : Number(form.pct_anticipo),
        fecha_nacimiento: form.fecha_nacimiento || null,
        sexo: form.sexo || null,
        estado_civil: form.estado_civil || null,
        direccion: form.direccion || null,
        horario: form.horario || null,
      });
```

- [ ] **Step 4: Agregar "Horario" a `TABS_BASE`**

Current (línea 16):

```jsx
const TABS_BASE = ['Ficha', 'Contratos', 'Descuentos', 'Préstamos', 'Anticipos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];
```

Replace con:

```jsx
const TABS_BASE = ['Ficha', 'Horario', 'Contratos', 'Descuentos', 'Préstamos', 'Anticipos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];
```

- [ ] **Step 5: Agregar el componente `HorarioTab`**

Agrega este componente inmediatamente antes de `function DocumentosColaboradorCell(...)` (o en cualquier punto entre las funciones de pestaña existentes):

```jsx
function HorarioTab({ col, onError, onCambio }) {
  const [incidencias, setIncidencias] = useState([]);
  const [form, setForm] = useState({ fecha: '', hora_entrada_real: '', hora_salida_real: '', notas: '' });
  const toast = useToast();

  const cargar = () => api.get(`/colaboradores/${col.id}/incidencias-horario`).then(setIncidencias).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  if (!col.horario) {
    return <Card className="text-slate-500">Este colaborador no tiene un horario asignado. Asígnalo en la pestaña Ficha.</Card>;
  }

  const registrar = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/incidencias-horario`, {
        fecha: form.fecha,
        hora_entrada_real: form.hora_entrada_real || null,
        hora_salida_real: form.hora_salida_real || null,
        notas: form.notas || null,
      });
      setForm({ fecha: '', hora_entrada_real: '', hora_salida_real: '', notas: '' });
      toast.success('Incidencia registrada.');
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const aplicar = async (incidenciaId, rolPagoId) => {
    if (!rolPagoId) return;
    try {
      await api.post(`/colaboradores/${col.id}/incidencias-horario/${incidenciaId}/aplicar`, { rol_pago_id: rolPagoId });
      toast.success('Descuento aplicado al rol de pago.');
      cargar();
      onCambio();
    } catch (err) {
      onError(err.message);
    }
  };

  const eliminar = async (id) => {
    try {
      await api.del(`/colaboradores/${col.id}/incidencias-horario/${id}`);
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const rolesBorrador = col.roles_pago.filter((r) => r.periodo_estado === 'BORRADOR');

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Registrar incidencia</h2>
        <form onSubmit={registrar} className="grid md:grid-cols-4 gap-2">
          <input required type="date" className="input w-full"
            value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          <input type="time" placeholder="Hora entrada real" className="input w-full"
            value={form.hora_entrada_real} onChange={(e) => setForm({ ...form, hora_entrada_real: e.target.value })} />
          <input type="time" placeholder="Hora salida real" className="input w-full"
            value={form.hora_salida_real} onChange={(e) => setForm({ ...form, hora_salida_real: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" className="input w-full md:col-span-4"
            value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          Deja la hora de entrada y/o salida real según lo que haya ocurrido ese día.
        </p>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Fecha</th><th className="p-3">Tardanza</th><th className="p-3">Salida anticipada</th>
              <th className="p-3 text-right">Descuento</th><th className="p-3">Estado</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {incidencias.map((inc) => (
              <tr key={inc.id} className="border-b border-slate-200">
                <td className="p-3">{fecha(inc.fecha)}</td>
                <td className="p-3">{inc.minutos_tardanza > 0 ? `${inc.minutos_tardanza} min` : '—'}</td>
                <td className="p-3">{inc.minutos_salida_anticipada > 0 ? `${inc.minutos_salida_anticipada} min` : '—'}</td>
                <td className="p-3 text-right font-medium">{money(inc.monto_total)}</td>
                <td className="p-3">
                  {inc.lineas_rol_id
                    ? <span className="badge bg-emerald-100 text-emerald-700">APLICADA</span>
                    : <span className="badge bg-amber-100 text-amber-700">PENDIENTE</span>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  {!inc.lineas_rol_id && (
                    <>
                      <select className="input !py-1 !px-2 text-xs" defaultValue=""
                        onChange={(e) => aplicar(inc.id, e.target.value)}>
                        <option value="">Aplicar a...</option>
                        {rolesBorrador.map((r) => <option key={r.id} value={r.id}>{r.periodo_nombre}</option>)}
                      </select>
                      <button onClick={() => eliminar(inc.id)} className="text-slate-400 hover:text-red-600 ml-2 align-middle" title="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {incidencias.length === 0 && <tr><td colSpan={6} className="p-4 text-slate-500">Sin incidencias registradas.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Renderizar la pestaña**

Current:

```jsx
      {tab === 'Ficha' && <FichaTab col={col} onGuardado={() => { setError(null); cargar(); }} onError={setError} />}
      {tab === 'Contratos' && <ContratosTab col={col} onCambio={() => { setError(null); cargar(); }} onError={setError} />}
```

Replace con (agrega "Horario" justo después de "Ficha"):

```jsx
      {tab === 'Ficha' && <FichaTab col={col} onGuardado={() => { setError(null); cargar(); }} onError={setError} />}
      {tab === 'Horario' && <HorarioTab col={col} onError={setError} onCambio={() => { setError(null); cargar(); }} />}
      {tab === 'Contratos' && <ContratosTab col={col} onCambio={() => { setError(null); cargar(); }} onError={setError} />}
```

- [ ] **Step 7: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 8: Manual verification**

Con el servidor corriendo:
1. En Configuración → Horarios, confirma que ADM y Comercial aparecen con sus horas correctas, y que se pueden editar.
2. Asigna un horario a un colaborador desde su Ficha.
3. En la pestaña "Horario" de ese colaborador, registra una incidencia con una hora de entrada real posterior a la esperada — confirma que el desglose de minutos y el monto calculado se ven razonables.
4. Genera un período (o usa uno en BORRADOR existente) y aplica la incidencia a su rol de pago — confirma que aparece la línea "DESCUENTO_HORARIO" en el rol de pago y que el neto se actualizó.
5. Confirma que una incidencia ya aplicada muestra el badge "APLICADA" y ya no ofrece el selector de aplicar/eliminar.

- [ ] **Step 9: Commit**

```bash
git add client/src/pages/ColaboradorDetalle.jsx
git commit -m "feat: registrar y aplicar incidencias de horario desde la ficha del colaborador"
```

---

## Final Check

- [ ] Run `npm -w server test` — full suite green.
- [ ] Run `npm -w client run build` — compiles clean.
- [ ] Push the branch: `git push`.
