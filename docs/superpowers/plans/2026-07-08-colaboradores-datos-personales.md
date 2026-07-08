# Colaboradores: datos personales y tipo de contrato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 new personal/HR fields to the collaborator profile (fecha de nacimiento, sexo, estado civil, dirección) and to the contract history (tipo de contrato), per the spec at `docs/superpowers/specs/2026-07-08-colaboradores-datos-personales-design.md`.

**Architecture:** One migration (`009_datos_personales.sql`) adds nullable columns to `colaboradores` and `contratos`. Backend routes in `server/src/routes/colaboradores.js` are extended to accept the new fields. Frontend `client/src/pages/ColaboradorDetalle.jsx` gets new form fields in `FichaTab` and `ContratosTab`.

**Tech Stack:** Node/Express + pg (server), React + Vite + Tailwind (client), Vitest + supertest (server tests).

## Global Constraints

- All new columns are nullable — must not break existing colaboradores/contratos rows.
- Enum values use MAYUSCULAS_SNAKE, matching existing conventions (`tipo` IESS/EXTERNO, `tipo_cuenta` AHORRO/CORRIENTE).
- Zero changes to `server/src/lib/calculo.js`, `server/src/services/periodos.js`, or `server/src/lib/txt-pichincha.js` — these fields are informational only, never enter payroll calculation or the bank TXT file.
- `tipo_contrato` lives on `contratos` (not `colaboradores`) because it can change when a contract is renewed/converted, same as `sueldo_base`.
- Migrations run automatically before the test suite (`server/tests/helpers/globalSetup.js` calls `runMigrations`) — no manual migration step needed to run tests.

---

### Task 1: Migration + PATCH /colaboradores/:id accepts personal data fields

**Files:**
- Create: `server/db/migrations/009_datos_personales.sql`
- Modify: `server/src/routes/colaboradores.js:92-114` (the `router.patch('/:id', ...)` handler)
- Test: `server/tests/colaboradores.test.js`

**Interfaces:**
- Produces: `colaboradores` table gains columns `fecha_nacimiento date`, `sexo text` (CHECK IN 'M','F'), `estado_civil text` (CHECK IN 'SOLTERO','CASADO','DIVORCIADO','VIUDO','UNION_LIBRE'), `direccion text`. `contratos` table gains `tipo_contrato text` (CHECK IN 'INDEFINIDO','PLAZO_FIJO','PASANTIA','PRESTACION_SERVICIOS') — used by Task 2.
- Consumes: nothing new (extends existing `PATCH /colaboradores/:id`).

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/colaboradores.test.js`, inside the existing `describe('colaboradores', ...)` block (after the `'un nuevo contrato cierra el anterior'` test, before the `'COLABORADOR no puede listar colaboradores'` test):

```js
  it('PATCH acepta y persiste datos personales nuevos', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Datos personales ${Date.now()}`, cedula: `DP${Date.now() % 1e8}`
      })
    ).body;

    const res = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({
      fecha_nacimiento: '1990-05-20',
      sexo: 'F',
      estado_civil: 'CASADO',
      direccion: 'Av. Siempre Viva 123'
    });

    expect(res.status).toBe(200);
    expect(res.body.fecha_nacimiento.slice(0, 10)).toBe('1990-05-20');
    expect(res.body.sexo).toBe('F');
    expect(res.body.estado_civil).toBe('CASADO');
    expect(res.body.direccion).toBe('Av. Siempre Viva 123');
  });

  it('PATCH rechaza un sexo fuera del catálogo con 400 (no se cuelga)', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Sexo invalido ${Date.now()}`, cedula: `SX${Date.now() % 1e8}`
      })
    ).body;

    const res = await auth(request(app).patch(`/api/colaboradores/${col.id}`)).send({ sexo: 'X' });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- colaboradores.test.js`
Expected: Both new tests FAIL. The first ("PATCH acepta y persiste...") fails fast with a Postgres "column does not exist" error, since `fecha_nacimiento`/`sexo`/`estado_civil`/`direccion` don't exist in `colaboradores` yet. The second ("PATCH rechaza un sexo fuera del catálogo...") **times out after 5000ms** (Vitest's default `testTimeout` in this project) and is reported as a FAIL with an "Unhandled Rejection" in the output — this is expected and confirmed empirically: the current route has no try/catch, so a query that violates a CHECK constraint (verified with `tipo_cuenta: 'INVALIDO'` against the existing `colaboradores_tipo_cuenta_check`) leaves the request promise rejected and unhandled; Vitest catches it without crashing the worker, but the test never gets a response and hits the timeout. Do not increase the timeout to "fix" this — Step 4 below fixes the actual cause.

- [ ] **Step 3: Write the migration**

Create `server/db/migrations/009_datos_personales.sql`:

```sql
-- Datos personales adicionales pedidos por RRHH para el expediente del
-- colaborador, y tipo de contrato en el historial de contratos (puede
-- cambiar al renovar/convertir, igual que sueldo_base).
ALTER TABLE colaboradores
  ADD COLUMN fecha_nacimiento date,
  ADD COLUMN sexo text CHECK (sexo IN ('M','F')),
  ADD COLUMN estado_civil text CHECK (estado_civil IN ('SOLTERO','CASADO','DIVORCIADO','VIUDO','UNION_LIBRE')),
  ADD COLUMN direccion text;

ALTER TABLE contratos
  ADD COLUMN tipo_contrato text CHECK (tipo_contrato IN ('INDEFINIDO','PLAZO_FIJO','PASANTIA','PRESTACION_SERVICIOS'));
```

- [ ] **Step 4: Update the PATCH route**

Replace the full `router.patch('/:id', ...)` handler in `server/src/routes/colaboradores.js` (lines 92-114) with:

```js
router.patch('/:id', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const campos = [
    'nombre', 'email', 'departamento', 'cargo', 'activo', 'cedula', 'fecha_ingreso',
    'empresa', 'centro_costo', 'cargas_personales', 'forma_pago',
    'banco', 'codigo_banco', 'tipo_cuenta', 'cuenta_bancaria', 'pct_anticipo',
    'fecha_nacimiento', 'sexo', 'estado_civil', 'direccion'
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
  params.push(req.params.id);
  try {
    const { rows } = await pool.query(
      `UPDATE colaboradores SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
```

This adds the 4 new fields to the updatable list, and wraps the query in try/catch so a CHECK-constraint violation (e.g. an invalid `sexo`) returns a clean 400 instead of leaving the request unhandled — this route previously had no error handling at all.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm -w server test -- colaboradores.test.js`
Expected: PASS — all tests in the file green.

- [ ] **Step 6: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS — all test files green (92+ tests, no regressions).

- [ ] **Step 7: Commit**

```bash
git add server/db/migrations/009_datos_personales.sql server/src/routes/colaboradores.js server/tests/colaboradores.test.js
git commit -m "feat: campos de datos personales en colaboradores (fecha_nacimiento, sexo, estado_civil, direccion)"
```

---

### Task 2: POST /colaboradores/:id/contratos accepts tipo_contrato

**Files:**
- Modify: `server/src/routes/colaboradores.js:117-142` (the `router.post('/:id/contratos', ...)` handler)
- Test: `server/tests/colaboradores.test.js`

**Interfaces:**
- Consumes: `contratos.tipo_contrato` column from Task 1's migration.
- Produces: `POST /colaboradores/:id/contratos` response body includes `tipo_contrato` when provided.

- [ ] **Step 1: Write the failing test**

Add to `server/tests/colaboradores.test.js`, right after the `'un nuevo contrato cierra el anterior'` test:

```js
  it('POST contratos acepta tipo_contrato', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Tipo contrato ${Date.now()}`, cedula: `TC${Date.now() % 1e8}`
      })
    ).body;

    const res = await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01', tipo_contrato: 'INDEFINIDO'
    });

    expect(res.status).toBe(201);
    expect(res.body.tipo_contrato).toBe('INDEFINIDO');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test -- colaboradores.test.js`
Expected: FAIL — `res.body.tipo_contrato` is `undefined` because the INSERT doesn't select/write that column yet.

- [ ] **Step 3: Update the POST /:id/contratos route**

Replace the full `router.post('/:id/contratos', ...)` handler in `server/src/routes/colaboradores.js` (lines 117-142) with:

```js
router.post('/:id/contratos', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const { sueldo_base, fecha_inicio, notas, tipo_contrato } = req.body;
  if (!sueldo_base || !fecha_inicio) {
    return res.status(400).json({ error: 'sueldo_base y fecha_inicio requeridos' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE contratos SET fecha_fin=$1 WHERE colaborador_id=$2 AND fecha_fin IS NULL`,
      [fecha_inicio, req.params.id]
    );
    const { rows } = await client.query(
      `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio, notas, tipo_contrato)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, sueldo_base, fecha_inicio, notas, tipo_contrato ?? null]
    );
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm -w server test -- colaboradores.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/colaboradores.js server/tests/colaboradores.test.js
git commit -m "feat: tipo_contrato en el historial de contratos del colaborador"
```

---

### Task 3: FichaTab — new personal data fields in the collaborator profile form

**Files:**
- Modify: `client/src/pages/ColaboradorDetalle.jsx:18-113` (the `FichaTab` component)

**Interfaces:**
- Consumes: `PATCH /colaboradores/:id` (Task 1) now accepts `fecha_nacimiento`, `sexo`, `estado_civil`, `direccion`.

This page has no existing unit tests (only small isolated components like `Badge`/`Toast`/`Modal` are unit-tested in this repo — see `client/tests/`), so this task is verified by build + manual check, matching existing convention.

- [ ] **Step 1: Add the new fields to form state and the save payload**

In `client/src/pages/ColaboradorDetalle.jsx`, replace the `FichaTab` function's `useState` call and `guardar` function (lines 23-45) with:

```jsx
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

  const guardar = async (e) => {
    e.preventDefault();
    try {
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
      onGuardado();
    } catch (err) {
      onError(err.message);
    }
  };
```

- [ ] **Step 2: Add the form fields to the "Datos personales y laborales" card**

In the same file, in the `<Card>` with `<h2>Datos personales y laborales</h2>` (currently lines 54-82), add these labels right after the `Cargo` field and before `Fecha de ingreso`:

```jsx
          <label className="text-sm text-slate-600">Fecha de nacimiento {campo('fecha_nacimiento', { type: 'date' })}</label>
          <label className="text-sm text-slate-600">Sexo
            <select className="input w-full" value={form.sexo} onChange={(e) => setForm({ ...form, sexo: e.target.value })}>
              <option value="">—</option>
              <option value="F">Femenino</option>
              <option value="M">Masculino</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Estado civil
            <select className="input w-full" value={form.estado_civil} onChange={(e) => setForm({ ...form, estado_civil: e.target.value })}>
              <option value="">—</option>
              <option value="SOLTERO">Soltero/a</option>
              <option value="CASADO">Casado/a</option>
              <option value="DIVORCIADO">Divorciado/a</option>
              <option value="VIUDO">Viudo/a</option>
              <option value="UNION_LIBRE">Unión libre</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Dirección de domicilio {campo('direccion')}</label>
```

(Full resulting field order in that grid: Nombre, Cédula/RUC, Email, Departamento, Cargo, Fecha de nacimiento, Sexo, Estado civil, Dirección de domicilio, Fecha de ingreso, Empresa, Centro de costo, Cargas personales, Anticipo 1ra quincena.)

- [ ] **Step 3: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 4: Manual verification**

Start the dev stack (`npm -w server run dev` and `npm -w client run dev`, or however this project is normally run locally — see `run` skill if unsure), open a collaborator's profile (Ficha tab), and confirm:
1. The 4 new fields render with the correct labels and controls (date picker, 2 selects, text input).
2. Filling them in and clicking "Guardar ficha" persists — reloading the page shows the saved values.
3. Leaving them blank and saving does not error (they're optional).

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ColaboradorDetalle.jsx
git commit -m "feat: campos de datos personales en la ficha del colaborador"
```

---

### Task 4: ContratosTab — tipo_contrato in the contract form and history table

**Files:**
- Modify: `client/src/pages/ColaboradorDetalle.jsx:16, 115-164` (module-level constant + `ContratosTab` component)

**Interfaces:**
- Consumes: `POST /colaboradores/:id/contratos` (Task 2) now accepts `tipo_contrato`; `contratos` rows returned by `GET /colaboradores/:id` (already includes all columns via `SELECT *`) now include `tipo_contrato`.

- [ ] **Step 1: Add a label map for tipo_contrato**

In `client/src/pages/ColaboradorDetalle.jsx`, right after the `TABS_BASE` constant (line 16), add:

```jsx
const TIPO_CONTRATO_LABEL = {
  INDEFINIDO: 'Indefinido',
  PLAZO_FIJO: 'Plazo fijo / Ocasional',
  PASANTIA: 'Prácticas / Pasantía',
  PRESTACION_SERVICIOS: 'Prestación de servicios',
};
```

- [ ] **Step 2: Add tipo_contrato to the new-contract form and history table**

Replace the whole `ContratosTab` function (currently lines 115-164) with:

```jsx
function ContratosTab({ col, onCambio, onError }) {
  const [contrato, setContrato] = useState({ sueldo_base: '', fecha_inicio: '', notas: '', tipo_contrato: '' });

  const nuevoContrato = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/contratos`, {
        ...contrato,
        tipo_contrato: contrato.tipo_contrato || null,
      });
      setContrato({ sueldo_base: '', fecha_inicio: '', notas: '', tipo_contrato: '' });
      onCambio();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nuevo contrato / aumento</h2>
        <form onSubmit={nuevoContrato} className="grid md:grid-cols-5 gap-2">
          <input required type="number" step="0.01" placeholder="Sueldo base" className="input w-full"
            value={contrato.sueldo_base} onChange={(e) => setContrato({ ...contrato, sueldo_base: e.target.value })} />
          <input required type="date" className="input w-full"
            value={contrato.fecha_inicio} onChange={(e) => setContrato({ ...contrato, fecha_inicio: e.target.value })} />
          <select className="input w-full" value={contrato.tipo_contrato}
            onChange={(e) => setContrato({ ...contrato, tipo_contrato: e.target.value })}>
            <option value="">Tipo de contrato —</option>
            <option value="INDEFINIDO">Indefinido</option>
            <option value="PLAZO_FIJO">Plazo fijo / Ocasional</option>
            <option value="PASANTIA">Prácticas / Pasantía</option>
            <option value="PRESTACION_SERVICIOS">Prestación de servicios</option>
          </select>
          <input placeholder="Notas (motivo)" className="input w-full"
            value={contrato.notas} onChange={(e) => setContrato({ ...contrato, notas: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
        </form>
      </Card>
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
                <td className="p-3">{TIPO_CONTRATO_LABEL[c.tipo_contrato] ?? '—'}</td>
                <td className="p-3 text-slate-500">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 4: Manual verification**

Open a collaborator's profile, go to the "Contratos" tab, register a new contract with a "Tipo de contrato" selected, and confirm:
1. The select shows all 4 options plus the blank default.
2. After registering, the history table shows a "Tipo" column with the readable label (not the raw enum value).
3. Registering a contract without selecting a type still works and shows "—" in that column.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ColaboradorDetalle.jsx
git commit -m "feat: tipo de contrato en el formulario e historial de contratos"
```

---

## Final Check

- [ ] Run `npm -w server test` — full suite green.
- [ ] Run `npm -w client run build` — compiles clean.
- [ ] Push the branch: `git push`.
