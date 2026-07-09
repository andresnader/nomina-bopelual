# Descuentos: fecha de vencimiento automática — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `fecha_vencimiento` to recurring discounts (`descuentos_recurrentes`), so the system deactivates them automatically once a payroll period starting after that date is generated or synced — no cron, per the approved spec at `docs/superpowers/specs/2026-07-09-descuentos-fecha-vencimiento-design.md`.

**Architecture:** One migration adds a nullable `fecha_vencimiento date` column. `aplicarDescuentosPendientes` (the shared function called from period generation and both sync paths) gains a 4th parameter, `periodoFechaInicio`, and runs a deactivation UPDATE before its existing apply logic. `POST`/`PATCH /descuentos` accept the new field. The UI form, table, and edit modal in `Descuentos.jsx` expose it.

**Tech Stack:** Node/Express + pg (server), React + Vite + Tailwind (client), Vitest + supertest (server tests).

## Global Constraints

- `fecha_vencimiento` is nullable — `NULL` means indefinite, same convention as `cuotas_restantes`.
- Deactivation is lazy: it happens the next time a period touches the discount (via `generarRoles`, `sincronizarPeriodo`, or `POST /roles/:id/sincronizar`) — never via a background job. This project has no scheduled-task infrastructure; do not add one.
- The expiration check compares against a period's `fecha_inicio`, not `fecha_fin`: a discount still valid when the period started applies in full for that period, even if it expires mid-period. The comparison that excludes a discount is `fecha_vencimiento < periodoFechaInicio` (strictly less-than — equal means still valid).
- Zero changes to `aplicarPrestamosPendientes` or loan logic — this plan only touches `descuentos_recurrentes`.
- Enum/field naming matches existing conventions in this codebase (snake_case column names, MAYUSCULAS_SNAKE for enum-like text values — not applicable here since `fecha_vencimiento` is a plain `date`, not an enum).

---

### Task 1: Migration + lazy expiration in `aplicarDescuentosPendientes`

**Files:**
- Create: `server/db/migrations/010_descuento_fecha_vencimiento.sql`
- Modify: `server/src/services/periodos.js` (the `aplicarDescuentosPendientes` function, and its 2 call sites in `generarRoles` and `sincronizarPeriodo`)
- Modify: `server/src/routes/roles.js` (the `POST /:id/sincronizar` handler — its `SELECT` and its call to `aplicarDescuentosPendientes`)
- Test: `server/tests/descuentos.test.js`

**Interfaces:**
- Produces: `descuentos_recurrentes.fecha_vencimiento` column (nullable `date`). `aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena, periodoFechaInicio)` — new required 4th parameter; return shape (`{ agregadas, actualizadas }`) is unchanged.
- Consumes: nothing new from other tasks (Task 2 adds the ability to *set* this field via the API; this task makes the *scheduling logic* respect it regardless of how it was set — you can set it directly via SQL in this task's tests).

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/descuentos.test.js`, inside the existing `describe('descuentos recurrentes', ...)` block, right after the `'se aplican al generar el período...'` test:

```js
  it('un descuento vencido antes de que empiece el período no se aplica y queda desactivado', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const desc = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
      })
    ).body;
    await pool.query('UPDATE descuentos_recurrentes SET fecha_vencimiento=$1 WHERE id=$2', ['2026-08-01', desc.id]);

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `vencido test ${Date.now()}`,
      fecha_inicio: '2026-09-16', fecha_fin: '2026-09-30', quincena: 2
    });
    expect(per.status).toBe(201);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(lineas.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(false);

    const { rows } = await pool.query('SELECT activo FROM descuentos_recurrentes WHERE id=$1', [desc.id]);
    expect(rows[0].activo).toBe(false);
  });

  it('un descuento que vence el mismo día que empieza el período todavía se aplica', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const desc = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
      })
    ).body;
    await pool.query('UPDATE descuentos_recurrentes SET fecha_vencimiento=$1 WHERE id=$2', ['2026-10-16', desc.id]);

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `vence hoy test ${Date.now()}`,
      fecha_inicio: '2026-10-16', fecha_fin: '2026-10-31', quincena: 2
    });
    expect(per.status).toBe(201);

    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(lineas.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(true);

    const { rows } = await pool.query('SELECT activo FROM descuentos_recurrentes WHERE id=$1', [desc.id]);
    expect(rows[0].activo).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- descuentos.test.js`
Expected: FAIL — both new tests error because the `fecha_vencimiento` column doesn't exist yet on `descuentos_recurrentes` (the `UPDATE ... SET fecha_vencimiento=...` in the test setup itself will throw a Postgres "column does not exist" error).

- [ ] **Step 3: Write the migration**

Create `server/db/migrations/010_descuento_fecha_vencimiento.sql`:

```sql
-- Fecha límite opcional de un descuento recurrente. NULL = indefinido,
-- mismo criterio que cuotas_restantes. La desactivación es perezosa: se
-- aplica la primera vez que un período con fecha_inicio posterior la toca
-- (ver aplicarDescuentosPendientes en services/periodos.js).
ALTER TABLE descuentos_recurrentes
  ADD COLUMN fecha_vencimiento date;
```

- [ ] **Step 4: Update `aplicarDescuentosPendientes`**

In `server/src/services/periodos.js`, replace the function signature and add the deactivation step. Current function (lines 57-97):

```js
export async function aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena) {
  const { rows: descuentos } = await client.query(
    `SELECT d.* FROM descuentos_recurrentes d
     WHERE d.colaborador_id=$1 AND d.activo=true AND d.aplicar_en IN (0,$2)`,
    [colaboradorId, quincena]
  );
  let agregadas = 0;
  let actualizadas = 0;
  for (const d of descuentos) {
    const { rows: existentes } = await client.query(
      'SELECT id, tipo_linea, monto, descripcion FROM lineas_rol WHERE rol_pago_id=$1 AND descuento_recurrente_id=$2',
      [rolId, d.id]
    );
    if (existentes.length === 0) {
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, descuento_recurrente_id)
         VALUES ($1,$2,'DESCUENTO',$3,$4,false,$5)`,
        [rolId, d.tipo_linea, Number(d.monto), d.notas, d.id]
      );
      if (d.cuotas_restantes != null) {
        const restantes = d.cuotas_restantes - 1;
        await client.query(
          'UPDATE descuentos_recurrentes SET cuotas_restantes=$1, activo=$2 WHERE id=$3',
          [restantes, restantes > 0, d.id]
        );
      }
      agregadas++;
    } else {
      const linea = existentes[0];
      const montoNuevo = Number(d.monto);
      if (linea.tipo_linea !== d.tipo_linea || Number(linea.monto) !== montoNuevo || linea.descripcion !== d.notas) {
        await client.query(
          'UPDATE lineas_rol SET tipo_linea=$1, monto=$2, descripcion=$3 WHERE id=$4',
          [d.tipo_linea, montoNuevo, d.notas, linea.id]
        );
        actualizadas++;
      }
    }
  }
  return { agregadas, actualizadas };
}
```

Replace it with:

```js
export async function aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena, periodoFechaInicio) {
  // Desactivación perezosa: si este período ya empieza después de la fecha
  // de vencimiento, el descuento deja de aplicarse desde aquí en adelante.
  // La consulta de abajo ya filtra activo=true, así que no hace falta
  // excluirlo también ahí.
  await client.query(
    `UPDATE descuentos_recurrentes
     SET activo=false
     WHERE colaborador_id=$1 AND activo=true
       AND fecha_vencimiento IS NOT NULL AND fecha_vencimiento < $2`,
    [colaboradorId, periodoFechaInicio]
  );

  const { rows: descuentos } = await client.query(
    `SELECT d.* FROM descuentos_recurrentes d
     WHERE d.colaborador_id=$1 AND d.activo=true AND d.aplicar_en IN (0,$2)`,
    [colaboradorId, quincena]
  );
  let agregadas = 0;
  let actualizadas = 0;
  for (const d of descuentos) {
    const { rows: existentes } = await client.query(
      'SELECT id, tipo_linea, monto, descripcion FROM lineas_rol WHERE rol_pago_id=$1 AND descuento_recurrente_id=$2',
      [rolId, d.id]
    );
    if (existentes.length === 0) {
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, descuento_recurrente_id)
         VALUES ($1,$2,'DESCUENTO',$3,$4,false,$5)`,
        [rolId, d.tipo_linea, Number(d.monto), d.notas, d.id]
      );
      if (d.cuotas_restantes != null) {
        const restantes = d.cuotas_restantes - 1;
        await client.query(
          'UPDATE descuentos_recurrentes SET cuotas_restantes=$1, activo=$2 WHERE id=$3',
          [restantes, restantes > 0, d.id]
        );
      }
      agregadas++;
    } else {
      const linea = existentes[0];
      const montoNuevo = Number(d.monto);
      if (linea.tipo_linea !== d.tipo_linea || Number(linea.monto) !== montoNuevo || linea.descripcion !== d.notas) {
        await client.query(
          'UPDATE lineas_rol SET tipo_linea=$1, monto=$2, descripcion=$3 WHERE id=$4',
          [d.tipo_linea, montoNuevo, d.notas, linea.id]
        );
        actualizadas++;
      }
    }
  }
  return { agregadas, actualizadas };
}
```

- [ ] **Step 5: Update the two call sites in `periodos.js`**

In `generarRoles` (same file), find this line (currently line 160):

```js
    await aplicarDescuentosPendientes(client, rolId, col.id, quincena);
```

Replace with:

```js
    await aplicarDescuentosPendientes(client, rolId, col.id, quincena, periodoRows[0].fecha_inicio);
```

In `sincronizarPeriodo` (same file), find this line (currently line 186):

```js
    const descuentos = await aplicarDescuentosPendientes(client, rol.id, rol.colaborador_id, periodoRows[0].quincena);
```

Replace with:

```js
    const descuentos = await aplicarDescuentosPendientes(client, rol.id, rol.colaborador_id, periodoRows[0].quincena, periodoRows[0].fecha_inicio);
```

- [ ] **Step 6: Update the third call site in `server/src/routes/roles.js`**

Find the `POST /:id/sincronizar` handler (currently lines 92-120). Its `SELECT` (currently lines 96-100):

```js
    const { rows } = await client.query(
      `SELECT rp.colaborador_id, p.estado, p.fecha_fin, p.quincena
       FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1 FOR UPDATE`,
      [req.params.id]
    );
```

Replace with (adds `p.fecha_inicio`):

```js
    const { rows } = await client.query(
      `SELECT rp.colaborador_id, p.estado, p.fecha_inicio, p.fecha_fin, p.quincena
       FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1 FOR UPDATE`,
      [req.params.id]
    );
```

And its call to `aplicarDescuentosPendientes` (currently line 110):

```js
    const { agregadas: agregadosDescuentos, actualizadas } = await aplicarDescuentosPendientes(client, req.params.id, rows[0].colaborador_id, rows[0].quincena);
```

Replace with:

```js
    const { agregadas: agregadosDescuentos, actualizadas } = await aplicarDescuentosPendientes(client, req.params.id, rows[0].colaborador_id, rows[0].quincena, rows[0].fecha_inicio);
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm -w server test -- descuentos.test.js`
Expected: PASS — all tests in the file green.

- [ ] **Step 8: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS — every test file green, no regressions (this touches `generarRoles`, `sincronizarPeriodo`, and `/roles/:id/sincronizar`, all of which have their own existing tests in `periodos.test.js`, `periodos-api.test.js`, and `sincronizar.test.js` — these must still pass unchanged, since `periodoFechaInicio` is always available at every call site and no existing discount has a non-null `fecha_vencimiento`).

- [ ] **Step 9: Commit**

```bash
git add server/db/migrations/010_descuento_fecha_vencimiento.sql server/src/services/periodos.js server/src/routes/roles.js server/tests/descuentos.test.js
git commit -m "feat: fecha de vencimiento automática para descuentos recurrentes"
```

---

### Task 2: `POST`/`PATCH /descuentos` accept `fecha_vencimiento`

**Files:**
- Modify: `server/src/routes/descuentos.js` (the `router.post('/', ...)` and `router.patch('/:id', ...)` handlers)
- Test: `server/tests/descuentos.test.js`

**Interfaces:**
- Consumes: `descuentos_recurrentes.fecha_vencimiento` column from Task 1's migration.
- Produces: `POST /descuentos` and `PATCH /descuentos/:id` response bodies include `fecha_vencimiento` when provided.

This task also fixes a pre-existing gap while touching this exact route: `PATCH /descuentos/:id` currently has no try/catch, so any query failure (e.g. a malformed date string in the new `fecha_vencimiento` field) leaves the request hanging until Vitest's test timeout instead of returning a clean error — the same bug already found and fixed on `PATCH /colaboradores/:id` in a previous task on this branch. Fix it the same way here.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/descuentos.test.js`, after the two tests added in Task 1:

```js
  it('POST y PATCH aceptan fecha_vencimiento', async () => {
    const app = createApp();
    const col = await crearColaborador(app);

    const creado = await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 12, fecha_vencimiento: '2026-12-31'
    });
    expect(creado.status).toBe(201);
    expect(creado.body.fecha_vencimiento.slice(0, 10)).toBe('2026-12-31');

    const editado = await auth(request(app).patch(`/api/descuentos/${creado.body.id}`)).send({
      fecha_vencimiento: '2027-01-15'
    });
    expect(editado.status).toBe(200);
    expect(editado.body.fecha_vencimiento.slice(0, 10)).toBe('2027-01-15');
  });

  it('PATCH con una fecha inválida responde 400 (no se cuelga)', async () => {
    const app = createApp();
    const col = await crearColaborador(app);
    const creado = (
      await auth(request(app).post('/api/descuentos')).send({
        colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 12
      })
    ).body;

    const res = await auth(request(app).patch(`/api/descuentos/${creado.id}`)).send({
      fecha_vencimiento: 'no-es-una-fecha'
    });
    expect(res.status).toBe(400);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- descuentos.test.js`
Expected: The first new test fails because `fecha_vencimiento` isn't in either route's accepted fields yet (the POST ignores it and `creado.body.fecha_vencimiento` is `undefined`; the PATCH's `campos` allowlist doesn't include it so `set.length === 0` and the request returns 400 "nada que actualizar" instead of 200). The second new test **times out after 5000ms** (Vitest's default `testTimeout` in this project) because the current route has no try/catch — this is the same pre-existing hang bug already confirmed empirically on `PATCH /colaboradores/:id` earlier on this branch. Do not "fix" this by raising the timeout — Step 4 below fixes the actual cause.

- [ ] **Step 3: Update `POST /`**

In `server/src/routes/descuentos.js`, replace the `router.post('/', ...)` handler (currently lines 34-52):

```js
router.post('/', async (req, res) => {
  const { colaborador_id, tipo_linea, monto, aplicar_en = 0, cuotas_restantes, notas } = req.body;
  if (!colaborador_id || !tipo_linea || !monto) {
    return res.status(400).json({ error: 'colaborador_id, tipo_linea y monto requeridos' });
  }
  if (!(await esTipoDescuentoValido(tipo_linea))) {
    return res.status(400).json({ error: `tipo_linea desconocido: ${tipo_linea}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, cuotas_restantes, notas)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [colaborador_id, tipo_linea, monto, aplicar_en, cuotas_restantes ?? null, notas ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
```

with:

```js
router.post('/', async (req, res) => {
  const { colaborador_id, tipo_linea, monto, aplicar_en = 0, cuotas_restantes, notas, fecha_vencimiento } = req.body;
  if (!colaborador_id || !tipo_linea || !monto) {
    return res.status(400).json({ error: 'colaborador_id, tipo_linea y monto requeridos' });
  }
  if (!(await esTipoDescuentoValido(tipo_linea))) {
    return res.status(400).json({ error: `tipo_linea desconocido: ${tipo_linea}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO descuentos_recurrentes (colaborador_id, tipo_linea, monto, aplicar_en, cuotas_restantes, notas, fecha_vencimiento)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [colaborador_id, tipo_linea, monto, aplicar_en, cuotas_restantes ?? null, notas ?? null, fecha_vencimiento ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
```

- [ ] **Step 4: Update `PATCH /:id`**

Replace the `router.patch('/:id', ...)` handler (currently lines 54-72):

```js
router.patch('/:id', async (req, res) => {
  const campos = ['tipo_linea', 'monto', 'aplicar_en', 'cuotas_restantes', 'activo', 'notas'];
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
  const { rows } = await pool.query(
    `UPDATE descuentos_recurrentes SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
    params
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
  res.json(rows[0]);
});
```

with (adds `fecha_vencimiento` to `campos`, and wraps the query in try/catch):

```js
router.patch('/:id', async (req, res) => {
  const campos = ['tipo_linea', 'monto', 'aplicar_en', 'cuotas_restantes', 'activo', 'notas', 'fecha_vencimiento'];
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
      `UPDATE descuentos_recurrentes SET ${set.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ error: 'no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm -w server test -- descuentos.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/descuentos.js server/tests/descuentos.test.js
git commit -m "feat: POST y PATCH de descuentos aceptan fecha_vencimiento"
```

---

### Task 3: `Descuentos.jsx` — fecha de vencimiento in the form, table, and edit modal

**Files:**
- Modify: `client/src/pages/Descuentos.jsx` (`FormDescuento` and `TablaDescuentos`)

**Interfaces:**
- Consumes: `POST /descuentos` and `PATCH /descuentos/:id` (Task 2) now accept `fecha_vencimiento`.

This file has no existing unit tests (page components aren't unit-tested in this repo — see `client/tests/` for what is). Verified by `npm -w client run build` compiling clean, plus a manual verification checklist.

- [ ] **Step 1: Add the field to `FormDescuento`**

In `client/src/pages/Descuentos.jsx`, update `FormDescuento`'s state and submit handler (currently lines 17 and 23-37):

Current:

```jsx
  const [form, setForm] = useState({ colaborador_id: colaboradorId || '', tipo_linea: 'ALIMENTACION', monto: '', aplicar_en: 0, cuotas_restantes: '', notas: '' });
```

Replace with:

```jsx
  const [form, setForm] = useState({ colaborador_id: colaboradorId || '', tipo_linea: 'ALIMENTACION', monto: '', aplicar_en: 0, cuotas_restantes: '', fecha_vencimiento: '', notas: '' });
```

Current `crear` function:

```jsx
  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/descuentos', {
        ...form,
        colaborador_id: colaboradorId || form.colaborador_id,
        aplicar_en: Number(form.aplicar_en),
        cuotas_restantes: form.cuotas_restantes ? Number(form.cuotas_restantes) : null,
      });
      setForm({ ...form, monto: '', cuotas_restantes: '', notas: '' });
      onCreado();
    } catch (err) {
      onError(err.message);
    }
  };
```

Replace with:

```jsx
  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/descuentos', {
        ...form,
        colaborador_id: colaboradorId || form.colaborador_id,
        aplicar_en: Number(form.aplicar_en),
        cuotas_restantes: form.cuotas_restantes ? Number(form.cuotas_restantes) : null,
        fecha_vencimiento: form.fecha_vencimiento || null,
      });
      setForm({ ...form, monto: '', cuotas_restantes: '', fecha_vencimiento: '', notas: '' });
      onCreado();
    } catch (err) {
      onError(err.message);
    }
  };
```

Then add the date input to the JSX, right after the "Cuotas (opcional)" input (currently lines 58-59):

Current:

```jsx
      <input type="number" min="1" placeholder="Cuotas (opcional)" className="input w-full"
        value={form.cuotas_restantes} onChange={(e) => setForm({ ...form, cuotas_restantes: e.target.value })} />
      <button className="btn btn-primary">Agregar</button>
```

Replace with:

```jsx
      <input type="number" min="1" placeholder="Cuotas (opcional)" className="input w-full"
        value={form.cuotas_restantes} onChange={(e) => setForm({ ...form, cuotas_restantes: e.target.value })} />
      <input type="date" title="Vence el (opcional)" className="input w-full"
        value={form.fecha_vencimiento} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} />
      <button className="btn btn-primary">Agregar</button>
```

The form's grid is `md:grid-cols-6` and already has 6 fields plus the button in the flexible-width "Notas" row — adding one more field means the grid will simply wrap an extra item onto a new row on narrower viewports, matching how this form already behaves when the `colaborador_id` selector is present (`!colaboradorId` branch adds a `md:col-span-2` item conditionally, so the grid already handles a variable number of items).

- [ ] **Step 2: Add the column and edit-modal field to `TablaDescuentos`**

In the same file, `TablaDescuentos`'s `guardarEdicion` function (currently lines 103-120):

Current:

```jsx
  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/descuentos/${editando.id}`, {
        tipo_linea: editando.tipo_linea,
        monto: Number(editando.monto),
        aplicar_en: Number(editando.aplicar_en),
        cuotas_restantes: editando.cuotas_restantes === '' ? null : Number(editando.cuotas_restantes),
        notas: editando.notas || null,
        activo: editando.activo,
      });
      toast.success('Descuento actualizado.');
      setEditando(null);
      onCambio();
    } catch (err) {
      toast.error(err.message);
    }
  };
```

Replace with:

```jsx
  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/descuentos/${editando.id}`, {
        tipo_linea: editando.tipo_linea,
        monto: Number(editando.monto),
        aplicar_en: Number(editando.aplicar_en),
        cuotas_restantes: editando.cuotas_restantes === '' ? null : Number(editando.cuotas_restantes),
        fecha_vencimiento: editando.fecha_vencimiento || null,
        notas: editando.notas || null,
        activo: editando.activo,
      });
      toast.success('Descuento actualizado.');
      setEditando(null);
      onCambio();
    } catch (err) {
      toast.error(err.message);
    }
  };
```

Add a "Vence" column header (currently lines 126-134, the `<thead>`):

Current:

```jsx
        <thead className="text-slate-500 text-left">
          <tr className="border-b border-slate-200">
            {conColaborador && <th className="p-3">Colaborador</th>}
            <th className="p-3">Concepto</th>
            <th className="p-3 text-right">Monto</th>
            <th className="p-3">Aplica en</th>
            <th className="p-3 text-right">Cuotas rest.</th>
            <th className="p-3">Estado</th>
            <th className="p-3"></th>
          </tr>
        </thead>
```

Replace with:

```jsx
        <thead className="text-slate-500 text-left">
          <tr className="border-b border-slate-200">
            {conColaborador && <th className="p-3">Colaborador</th>}
            <th className="p-3">Concepto</th>
            <th className="p-3 text-right">Monto</th>
            <th className="p-3">Aplica en</th>
            <th className="p-3 text-right">Cuotas rest.</th>
            <th className="p-3">Vence</th>
            <th className="p-3">Estado</th>
            <th className="p-3"></th>
          </tr>
        </thead>
```

Add the corresponding cell (currently line 149, right after the "Cuotas rest." cell):

Current:

```jsx
              <td className="p-3 text-right">{d.cuotas_restantes ?? '∞'}</td>
```

Replace with:

```jsx
              <td className="p-3 text-right">{d.cuotas_restantes ?? '∞'}</td>
              <td className="p-3">{d.fecha_vencimiento ? fecha(d.fecha_vencimiento) : '∞'}</td>
```

This requires importing `fecha` alongside `money` at the top of the file. Current import (line 8):

```jsx
import { money } from '../utils.js';
```

Replace with:

```jsx
import { money, fecha } from '../utils.js';
```

Also update the empty-state `colSpan` (currently line 168, `colSpan={7}`) to `colSpan={8}` since one column was added:

Current:

```jsx
            <tr><td colSpan={7} className="p-4 text-slate-500">Sin descuentos registrados.</td></tr>
```

Replace with:

```jsx
            <tr><td colSpan={8} className="p-4 text-slate-500">Sin descuentos registrados.</td></tr>
```

Finally, update the "editar" button's initial state (currently line 157) and add the date field to the edit modal form:

Current:

```jsx
                <button onClick={() => setEditando({ ...d, monto: String(d.monto), cuotas_restantes: d.cuotas_restantes ?? '' })}
                  className="text-slate-400 hover:text-gold-600 p-1.5" title="Editar">
```

Replace with:

```jsx
                <button onClick={() => setEditando({ ...d, monto: String(d.monto), cuotas_restantes: d.cuotas_restantes ?? '', fecha_vencimiento: d.fecha_vencimiento?.slice(0, 10) ?? '' })}
                  className="text-slate-400 hover:text-gold-600 p-1.5" title="Editar">
```

And in the edit modal's form (currently lines 183-194, the `grid-cols-2` div with Monto/Cuotas):

Current:

```jsx
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-slate-600">Monto
              <input required type="number" step="0.01" min="0.01" className="input w-full mt-1"
                value={editando?.monto ?? ''}
                onChange={(e) => setEditando({ ...editando, monto: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600">Cuotas restantes (opcional)
              <input type="number" min="1" className="input w-full mt-1"
                value={editando?.cuotas_restantes ?? ''}
                onChange={(e) => setEditando({ ...editando, cuotas_restantes: e.target.value })} />
            </label>
          </div>
```

Replace with:

```jsx
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm text-slate-600">Monto
              <input required type="number" step="0.01" min="0.01" className="input w-full mt-1"
                value={editando?.monto ?? ''}
                onChange={(e) => setEditando({ ...editando, monto: e.target.value })} />
            </label>
            <label className="text-sm text-slate-600">Cuotas restantes (opcional)
              <input type="number" min="1" className="input w-full mt-1"
                value={editando?.cuotas_restantes ?? ''}
                onChange={(e) => setEditando({ ...editando, cuotas_restantes: e.target.value })} />
            </label>
          </div>
          <label className="text-sm text-slate-600">Vence el (opcional)
            <input type="date" className="input w-full mt-1"
              value={editando?.fecha_vencimiento ?? ''}
              onChange={(e) => setEditando({ ...editando, fecha_vencimiento: e.target.value })} />
          </label>
```

- [ ] **Step 3: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 4: Manual verification**

Open the Descuentos page (and the Descuentos tab in a collaborator's profile, since `FormDescuento`/`TablaDescuentos` are shared there too — see `client/src/pages/ColaboradorDetalle.jsx`'s `DescuentosTab`), and confirm:
1. "Nuevo descuento" form has the date field, optional (empty submits fine).
2. The table shows a "Vence" column with the date or `∞`.
3. The edit modal (pencil icon) shows and saves the date correctly, including clearing it back to indefinite.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Descuentos.jsx
git commit -m "feat: fecha de vencimiento en el formulario, tabla y edición de descuentos"
```

---

## Final Check

- [ ] Run `npm -w server test` — full suite green.
- [ ] Run `npm -w client run build` — compiles clean.
- [ ] Push the branch: `git push`.
