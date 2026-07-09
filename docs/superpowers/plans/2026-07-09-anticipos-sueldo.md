# Anticipos de sueldo (extensión de Préstamos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each collaborator a dedicated "Anticipos" flow (saldo, abonos, precancelación) by extending the existing Préstamos system with a `tipo` discriminator (`PRESTAMO`/`ANTICIPO`), per the approved spec at `docs/superpowers/specs/2026-07-09-anticipos-sueldo-design.md`.

**Architecture:** One migration adds `prestamos.tipo` (default `'PRESTAMO'`, zero impact on existing rows) and deactivates the old generic `ANTICIPO_SUELDO` discount type. Backend routes (`GET`/`POST /prestamos`) accept a `tipo` filter/field. `aplicarPrestamosPendientes` (shared payroll-generation function) picks the generated line's `tipo_linea`/`descripcion` based on the préstamo's `tipo`. Frontend: the global Préstamos page gets a type filter, and the collaborator ficha gets a new "Anticipos" tab that reuses `PrestamosTab`'s pattern with `tipo=ANTICIPO` hardcoded.

**Tech Stack:** Node/Express + pg (server), React + Vite + Tailwind (client), Vitest + supertest (server tests).

## Global Constraints

- `prestamos.tipo` defaults to `'PRESTAMO'` — every existing préstamo and every existing test that doesn't pass `tipo` must keep behaving exactly as today.
- `aplicarPrestamosPendientes`'s existing regression test (`server/tests/prestamos.test.js`, "la cuota amortiza el saldo al generar el período") must keep passing unchanged — this is payroll-critical shared code.
- `abonos_prestamo` is untouched — abonos work identically for both types.
- No changes to `descuentos_recurrentes` or `aplicarDescuentosPendientes` — deactivating the old `ANTICIPO_SUELDO` catalog entry only stops new ones from being created; it does not touch existing rows.

---

### Task 1: Migration + `prestamos` routes accept `tipo`

**Files:**
- Create: `server/db/migrations/013_prestamos_tipo.sql`
- Modify: `server/src/routes/prestamos.js` (`GET /` and `POST /`)
- Modify: `server/src/lib/tipos-descuento.js` (remove `ANTICIPO_SUELDO` from `TIPOS_FALLBACK`)
- Test: `server/tests/prestamos.test.js`

**Interfaces:**
- Produces: `prestamos.tipo` column (`'PRESTAMO'` | `'ANTICIPO'`, default `'PRESTAMO'`). `GET /prestamos?tipo=X` filters; `POST /prestamos` accepts `tipo` in the body (optional, defaults to `'PRESTAMO'` server-side if omitted — matches existing callers that never send it).
- Consumes: nothing new.

- [ ] **Step 1: Write the failing tests**

Add to `server/tests/prestamos.test.js`, right after the `crearPrestamo` helper function (before the `'lista paginada...'` test):

```js
  it('POST acepta tipo=ANTICIPO y GET filtra por tipo', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Anticipo ${Date.now()}`, cedula: `AN${Date.now() % 1e8}`
      })
    ).body;

    const anticipo = await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 200, cuota_quincena: 50, fecha_inicio: '2026-07-01', tipo: 'ANTICIPO'
    });
    expect(anticipo.status).toBe(201);
    expect(anticipo.body.tipo).toBe('ANTICIPO');

    const soloPrestamo = await crearPrestamo(app);

    const filtroAnticipos = await auth(request(app).get(`/api/prestamos?tipo=ANTICIPO&colaborador_id=${col.id}`));
    expect(filtroAnticipos.body.data.every((p) => p.tipo === 'ANTICIPO')).toBe(true);
    expect(filtroAnticipos.body.data.some((p) => p.id === anticipo.body.id)).toBe(true);

    const filtroPrestamos = await auth(request(app).get(`/api/prestamos?tipo=PRESTAMO&colaborador_id=${soloPrestamo.colaborador_id}`));
    expect(filtroPrestamos.body.data.some((p) => p.id === soloPrestamo.id)).toBe(true);
    expect(filtroPrestamos.body.data.some((p) => p.id === anticipo.body.id)).toBe(false);
  });

  it('POST sin tipo sigue creando PRESTAMO por defecto (compatibilidad)', async () => {
    const app = createApp();
    const pr = await crearPrestamo(app);
    expect(pr.tipo).toBe('PRESTAMO');
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm -w server test -- prestamos.test.js`
Expected: FAIL — `anticipo.body.tipo` is `undefined` because the column doesn't exist yet (Postgres "column does not exist" surfaces as a 500 from the route's existing try/catch in `POST /`), and the `tipo` query filter has no effect since `GET /` doesn't know about it yet.

- [ ] **Step 3: Write the migration**

Create `server/db/migrations/013_prestamos_tipo.sql`:

```sql
-- Discrimina préstamos de anticipos de sueldo: mismo motor (saldo, abonos,
-- precancelación), pero el rol de pago debe reflejar la diferencia (ver
-- aplicarPrestamosPendientes en services/periodos.js). DEFAULT 'PRESTAMO'
-- deja todos los préstamos existentes intactos.
ALTER TABLE prestamos
  ADD COLUMN tipo text NOT NULL DEFAULT 'PRESTAMO' CHECK (tipo IN ('PRESTAMO','ANTICIPO'));

-- El tipo de descuento genérico ANTICIPO_SUELDO queda reemplazado por este
-- flujo dedicado; se desactiva para que no se sigan creando por esa vía.
UPDATE servicios_descuento SET activo=false WHERE codigo='ANTICIPO_SUELDO';
```

- [ ] **Step 4: Update `GET /` and `POST /` in `server/src/routes/prestamos.js`**

Current `GET /` (lines 13-57 — reproduced here for the parts that change):

```js
router.get('/', async (req, res) => {
  const { colaborador_id, q, activo, sort, order, page, per_page } = req.query;
  const cond = [];
  const params = [];

  if (colaborador_id) {
    params.push(colaborador_id);
    cond.push(`p.colaborador_id=$${params.length}`);
  }
  if (activo !== undefined) {
    params.push(activo === 'true');
    cond.push(`p.activo=$${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    cond.push(`c.nombre ILIKE $${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
```

Replace with (adds the `tipo` filter):

```js
router.get('/', async (req, res) => {
  const { colaborador_id, q, activo, tipo, sort, order, page, per_page } = req.query;
  const cond = [];
  const params = [];

  if (colaborador_id) {
    params.push(colaborador_id);
    cond.push(`p.colaborador_id=$${params.length}`);
  }
  if (activo !== undefined) {
    params.push(activo === 'true');
    cond.push(`p.activo=$${params.length}`);
  }
  if (tipo) {
    params.push(tipo);
    cond.push(`p.tipo=$${params.length}`);
  }
  if (q) {
    params.push(`%${q}%`);
    cond.push(`c.nombre ILIKE $${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
```

Current `POST /` (lines 75-93):

```js
router.post('/', async (req, res) => {
  const { colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas } = req.body;
  if (!colaborador_id || !monto_total || !cuota_quincena || !fecha_inicio) {
    return res.status(400).json({ error: 'campos requeridos' });
  }
  if (Number(monto_total) <= 0 || Number(cuota_quincena) <= 0) {
    return res.status(400).json({ error: 'monto y cuota deben ser mayores a 0' });
  }
  if (Number(cuota_quincena) > Number(monto_total)) {
    return res.status(400).json({ error: 'la cuota no puede superar el monto total' });
  }
  // saldo_pendiente arranca en monto_total (=$2).
  const { rows } = await pool.query(
    `INSERT INTO prestamos (colaborador_id, monto_total, cuota_quincena, saldo_pendiente, fecha_inicio, notas)
     VALUES ($1,$2,$3,$2,$4,$5) RETURNING *`,
    [colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas]
  );
  res.status(201).json(rows[0]);
});
```

Replace with (adds `tipo`, defaulting to `'PRESTAMO'`):

```js
router.post('/', async (req, res) => {
  const { colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas, tipo } = req.body;
  if (!colaborador_id || !monto_total || !cuota_quincena || !fecha_inicio) {
    return res.status(400).json({ error: 'campos requeridos' });
  }
  if (Number(monto_total) <= 0 || Number(cuota_quincena) <= 0) {
    return res.status(400).json({ error: 'monto y cuota deben ser mayores a 0' });
  }
  if (Number(cuota_quincena) > Number(monto_total)) {
    return res.status(400).json({ error: 'la cuota no puede superar el monto total' });
  }
  // saldo_pendiente arranca en monto_total (=$2).
  const { rows } = await pool.query(
    `INSERT INTO prestamos (colaborador_id, monto_total, cuota_quincena, saldo_pendiente, fecha_inicio, notas, tipo)
     VALUES ($1,$2,$3,$2,$4,$5,$6) RETURNING *`,
    [colaborador_id, monto_total, cuota_quincena, fecha_inicio, notas, tipo || 'PRESTAMO']
  );
  res.status(201).json(rows[0]);
});
```

- [ ] **Step 5: Remove `ANTICIPO_SUELDO` from the fallback catalog**

In `server/src/lib/tipos-descuento.js`, find this line in `TIPOS_FALLBACK`:

```js
  { tipo: 'ANTICIPO_SUELDO', label: 'Anticipo de sueldo' },
```

Delete it (the array continues with `PRESTAMO_HIPOTECARIO` etc. unchanged).

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm -w server test -- prestamos.test.js`
Expected: PASS — all tests in the file green, including the two new ones and the pre-existing `'la cuota amortiza el saldo al generar el período'` test (unaffected — it doesn't send `tipo`, and creates a `PRESTAMO` by default).

- [ ] **Step 7: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS — no regressions, especially in any test that touches `descuentos` (since `ANTICIPO_SUELDO` is now inactive in the catalog, any test that tried to create a NEW discount of that type would now get 400 — check there is no such test; the existing suite only ever creates discounts of types like `ALIMENTACION`/`SALUDSA`/`COMISARIATO`).

- [ ] **Step 8: Commit**

```bash
git add server/db/migrations/013_prestamos_tipo.sql server/src/routes/prestamos.js server/src/lib/tipos-descuento.js server/tests/prestamos.test.js
git commit -m "feat: préstamos gana tipo PRESTAMO/ANTICIPO, desactiva el descuento genérico ANTICIPO_SUELDO"
```

---

### Task 2: `aplicarPrestamosPendientes` reflects `tipo` in the generated payroll line

**Files:**
- Modify: `server/src/services/periodos.js` (`aplicarPrestamosPendientes`)
- Test: `server/tests/prestamos.test.js`

**Interfaces:**
- Consumes: `prestamos.tipo` from Task 1.
- Produces: no signature change — `aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin)` keeps the same parameters and return value (a count of lines added). Only the *content* of the inserted `lineas_rol` row changes based on the préstamo's `tipo`.

This is the highest-risk task in this plan: it touches shared payroll-generation code exercised by `generarRoles`, `sincronizarPeriodo`, and `POST /roles/:id/sincronizar` — all three call this same function, so a correct change here fixes all three call sites at once (no call-site changes needed, unlike the `fecha_vencimiento` work earlier on this branch).

- [ ] **Step 1: Write the failing test**

Add to `server/tests/prestamos.test.js`, right after the existing `'la cuota amortiza el saldo al generar el período'` test:

```js
  it('un préstamo tipo=ANTICIPO genera ANTICIPO_SUELDO en vez de CUOTA_PRESTAMO', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `AnticipoNomina ${Date.now()}`, cedula: `AL${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const anticipo = (
      await auth(request(app).post('/api/prestamos')).send({
        colaborador_id: col.id, monto_total: 200, cuota_quincena: 50, fecha_inicio: '2026-11-01', tipo: 'ANTICIPO'
      })
    ).body;

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `anticipo nomina test ${Date.now()}`, fecha_inicio: '2026-11-16', fecha_fin: '2026-11-30', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;

    const linea = lineas.find((l) => l.prestamo_id === anticipo.id);
    expect(linea.tipo_linea).toBe('ANTICIPO_SUELDO');
    expect(linea.descripcion).toBe('Cuota de anticipo');
    expect(lineas.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(false);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w server test -- prestamos.test.js`
Expected: FAIL — `linea.tipo_linea` is `'CUOTA_PRESTAMO'` (the current unconditional value), not `'ANTICIPO_SUELDO'`.

- [ ] **Step 3: Update `aplicarPrestamosPendientes`**

In `server/src/services/periodos.js`, current function (lines 26-51):

```js
export async function aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin) {
  const { rows: prestamos } = await client.query(
      `SELECT p.* FROM prestamos p
     WHERE p.colaborador_id=$1 AND p.activo=true AND p.fecha_inicio <= $2::date
       AND NOT EXISTS (
         SELECT 1 FROM lineas_rol l WHERE l.rol_pago_id=$3 AND l.prestamo_id=p.id
       )`,
    [colaboradorId, periodoFechaFin, rolId]
  );
  let agregadas = 0;
  for (const pr of prestamos) {
    const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
    if (r.aplicada > 0) {
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, prestamo_id)
         VALUES ($1,'CUOTA_PRESTAMO','DESCUENTO',$2,'Cuota de préstamo',false,$3)`,
        [rolId, r.aplicada, pr.id]
      );
      await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3', [
        r.saldoNuevo, r.activo, pr.id
      ]);
      agregadas++;
    }
  }
  return agregadas;
}
```

Replace with (branches `tipo_linea`/`descripcion` on `pr.tipo`):

```js
export async function aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin) {
  const { rows: prestamos } = await client.query(
      `SELECT p.* FROM prestamos p
     WHERE p.colaborador_id=$1 AND p.activo=true AND p.fecha_inicio <= $2::date
       AND NOT EXISTS (
         SELECT 1 FROM lineas_rol l WHERE l.rol_pago_id=$3 AND l.prestamo_id=p.id
       )`,
    [colaboradorId, periodoFechaFin, rolId]
  );
  let agregadas = 0;
  for (const pr of prestamos) {
    const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
    if (r.aplicada > 0) {
      const esAnticipo = pr.tipo === 'ANTICIPO';
      const tipoLinea = esAnticipo ? 'ANTICIPO_SUELDO' : 'CUOTA_PRESTAMO';
      const descripcion = esAnticipo ? 'Cuota de anticipo' : 'Cuota de préstamo';
      await client.query(
        `INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion, es_provision, prestamo_id)
         VALUES ($1,$2,'DESCUENTO',$3,$4,false,$5)`,
        [rolId, tipoLinea, r.aplicada, descripcion, pr.id]
      );
      await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3', [
        r.saldoNuevo, r.activo, pr.id
      ]);
      agregadas++;
    }
  }
  return agregadas;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm -w server test -- prestamos.test.js`
Expected: PASS — including the pre-existing `'la cuota amortiza el saldo al generar el período'` test, which creates a préstamo without `tipo` (defaults to `'PRESTAMO'`) and must still see `saldo_pendiente` decrement exactly as before; that test doesn't assert on `tipo_linea`, so this change is invisible to it.

- [ ] **Step 5: Run the full server suite to check for regressions**

Run: `npm -w server test`
Expected: PASS — pay special attention to `periodos.test.js`, `periodos-api.test.js`, and `sincronizar.test.js`, which all exercise `generarRoles`/`sincronizarPeriodo`/`POST /roles/:id/sincronizar` (the 3 callers of this function) and must be unaffected since none of them create a préstamo with `tipo='ANTICIPO'`.

- [ ] **Step 6: Commit**

```bash
git add server/src/services/periodos.js server/tests/prestamos.test.js
git commit -m "feat: aplicarPrestamosPendientes genera ANTICIPO_SUELDO para préstamos tipo=ANTICIPO"
```

---

### Task 3: `Prestamos.jsx` (global page) — tipo filter, form selector, table badge

**Files:**
- Modify: `client/src/pages/Prestamos.jsx`

**Interfaces:**
- Consumes: `GET /prestamos?tipo=` and `POST /prestamos` with `tipo` (Task 1).

No unit tests exist for this page (matches repo convention — verified by `npm -w client run build` + manual checklist).

- [ ] **Step 1: Add a type filter alongside the existing Activos/Pagados filter**

Current (lines 12-17):

```jsx
const VACIO = { colaborador_id: '', monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' };
const FILTROS = [
  { valor: '', label: 'Todos' },
  { valor: 'true', label: 'Activos' },
  { valor: 'false', label: 'Pagados' },
];
```

Replace with (adds `tipo` to `VACIO` and a new `FILTROS_TIPO` constant):

```jsx
const VACIO = { colaborador_id: '', monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '', tipo: 'PRESTAMO' };
const FILTROS = [
  { valor: '', label: 'Todos' },
  { valor: 'true', label: 'Activos' },
  { valor: 'false', label: 'Pagados' },
];
const FILTROS_TIPO = [
  { valor: '', label: 'Todos' },
  { valor: 'PRESTAMO', label: 'Préstamos' },
  { valor: 'ANTICIPO', label: 'Anticipos' },
];
```

- [ ] **Step 2: Add `filtroTipo` state and include it in the `cargar` query**

Current (lines 153-166):

```jsx
  const [filtroActivo, setFiltroActivo] = useState('true');
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState(null);
  const [modalAbono, setModalAbono] = useState(null); // { prestamo, montoInicial }
  const [modalCuota, setModalCuota] = useState(null); // prestamo
  const toast = useToast();
  const confirm = useConfirm();

  const cargar = () => {
    const params = new URLSearchParams({ page: pagina, per_page: 10 });
    if (q) params.set('q', q);
    if (filtroActivo) params.set('activo', filtroActivo);
    api.get(`/prestamos?${params}`).then(setRespuesta).catch((e) => toast.error(e.message));
  };

  useEffect(() => { cargar(); }, [q, filtroActivo, pagina]);
```

Replace with:

```jsx
  const [filtroActivo, setFiltroActivo] = useState('true');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState(null);
  const [modalAbono, setModalAbono] = useState(null); // { prestamo, montoInicial }
  const [modalCuota, setModalCuota] = useState(null); // prestamo
  const toast = useToast();
  const confirm = useConfirm();

  const cargar = () => {
    const params = new URLSearchParams({ page: pagina, per_page: 10 });
    if (q) params.set('q', q);
    if (filtroActivo) params.set('activo', filtroActivo);
    if (filtroTipo) params.set('tipo', filtroTipo);
    api.get(`/prestamos?${params}`).then(setRespuesta).catch((e) => toast.error(e.message));
  };

  useEffect(() => { cargar(); }, [q, filtroActivo, filtroTipo, pagina]);
```

- [ ] **Step 3: Send `tipo` on create**

Current `crear` (lines 173-183):

```jsx
  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/prestamos', { ...form, monto_total: Number(form.monto_total), cuota_quincena: Number(form.cuota_quincena) });
      setForm(VACIO);
      toast.success('Préstamo registrado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };
```

Replace with (message reflects the type registered):

```jsx
  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/prestamos', { ...form, monto_total: Number(form.monto_total), cuota_quincena: Number(form.cuota_quincena) });
      setForm(VACIO);
      toast.success(form.tipo === 'ANTICIPO' ? 'Anticipo registrado.' : 'Préstamo registrado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };
```

- [ ] **Step 4: Add the type selector to the create form, and the type filter to the table toolbar**

Current create form (lines 216-238):

```jsx
      <Card className="mb-4">
        <h2 className="font-semibold mb-3">Nuevo préstamo</h2>
        <form onSubmit={crear} className="grid md:grid-cols-5 gap-2">
          <select required value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })} className="input w-full">
            <option value="">Colaborador…</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input required type="number" step="0.01" min="0.01" placeholder="Monto total" value={form.monto_total}
            onChange={(e) => setForm({ ...form, monto_total: e.target.value })} className="input w-full" />
          <input required type="number" step="0.01" min="0.01" placeholder="Cuota por quincena" value={form.cuota_quincena}
            onChange={(e) => setForm({ ...form, cuota_quincena: e.target.value })} className="input w-full" />
          <input required type="date" value={form.fecha_inicio}
            onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="input w-full" />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })} className="input w-full md:col-span-5" />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          La fecha es la <strong>primera quincena de descuento</strong>: el préstamo empezará a descontarse recién en el
          período que la incluya, no antes.
        </p>
      </Card>
```

Replace with (adds the tipo `<select>` as the first field, grid goes to 6 columns):

```jsx
      <Card className="mb-4">
        <h2 className="font-semibold mb-3">Nuevo préstamo / anticipo</h2>
        <form onSubmit={crear} className="grid md:grid-cols-6 gap-2">
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="input w-full">
            <option value="PRESTAMO">Préstamo</option>
            <option value="ANTICIPO">Anticipo</option>
          </select>
          <select required value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })} className="input w-full">
            <option value="">Colaborador…</option>
            {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
          <input required type="number" step="0.01" min="0.01" placeholder="Monto total" value={form.monto_total}
            onChange={(e) => setForm({ ...form, monto_total: e.target.value })} className="input w-full" />
          <input required type="number" step="0.01" min="0.01" placeholder="Cuota por quincena" value={form.cuota_quincena}
            onChange={(e) => setForm({ ...form, cuota_quincena: e.target.value })} className="input w-full" />
          <input required type="date" value={form.fecha_inicio}
            onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="input w-full" />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" value={form.notas}
            onChange={(e) => setForm({ ...form, notas: e.target.value })} className="input w-full md:col-span-6" />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          La fecha es la <strong>primera quincena de descuento</strong>: empezará a descontarse recién en el
          período que la incluya, no antes.
        </p>
      </Card>
```

Current table toolbar (lines 240-252):

```jsx
      <Card className="p-0 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input placeholder="Buscar colaborador…" className="input flex-1 min-w-40"
            value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} />
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {FILTROS.map((f) => (
              <button key={f.valor} onClick={() => { setFiltroActivo(f.valor); setPagina(1); }}
                className={`px-3 py-2 text-sm ${filtroActivo === f.valor ? 'bg-gold-400 text-brand-900 font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
```

Replace with (adds a second filter-button group for `tipo`):

```jsx
      <Card className="p-0 overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 p-4">
          <input placeholder="Buscar colaborador…" className="input flex-1 min-w-40"
            value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} />
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {FILTROS.map((f) => (
              <button key={f.valor} onClick={() => { setFiltroActivo(f.valor); setPagina(1); }}
                className={`px-3 py-2 text-sm ${filtroActivo === f.valor ? 'bg-gold-400 text-brand-900 font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border border-slate-300 overflow-hidden">
            {FILTROS_TIPO.map((f) => (
              <button key={f.valor} onClick={() => { setFiltroTipo(f.valor); setPagina(1); }}
                className={`px-3 py-2 text-sm ${filtroTipo === f.valor ? 'bg-gold-400 text-brand-900 font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
```

- [ ] **Step 5: Add a type badge to the table**

Current colaborador cell (lines 270-275):

```jsx
                  <td className="p-3">
                    <Link to={`/colaboradores/${p.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                      {p.colaborador_nombre}
                    </Link>
                    {!p.activo && <span className="badge bg-emerald-100 text-emerald-700 ml-2">PAGADO</span>}
                  </td>
```

Replace with (adds a tipo badge before the PAGADO badge):

```jsx
                  <td className="p-3">
                    <Link to={`/colaboradores/${p.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                      {p.colaborador_nombre}
                    </Link>
                    <span className={`badge ml-2 ${p.tipo === 'ANTICIPO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {p.tipo === 'ANTICIPO' ? 'ANTICIPO' : 'PRÉSTAMO'}
                    </span>
                    {!p.activo && <span className="badge bg-emerald-100 text-emerald-700 ml-2">PAGADO</span>}
                  </td>
```

- [ ] **Step 6: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 7: Manual verification**

Open the Préstamos page and confirm:
1. The "Tipo" filter (Todos/Préstamos/Anticipos) works alongside the existing Activos/Pagados filter.
2. Registering with "Anticipo" selected shows the ANTICIPO badge in the table row afterward.
3. Existing préstamos (created before this change, `tipo=PRESTAMO` by default) still show correctly with the PRÉSTAMO badge.

- [ ] **Step 8: Commit**

```bash
git add client/src/pages/Prestamos.jsx
git commit -m "feat: filtro y selector de tipo (préstamo/anticipo) en la pantalla de Préstamos"
```

---

### Task 4: `ColaboradorDetalle.jsx` — new "Anticipos" tab

**Files:**
- Modify: `client/src/pages/ColaboradorDetalle.jsx`

**Interfaces:**
- Consumes: `GET /prestamos?colaborador_id=X&tipo=ANTICIPO` and `POST /prestamos` with `tipo=ANTICIPO` (Task 1); `AbonoModal`/`CuotaModal` already exported from `client/src/pages/Prestamos.jsx` and already imported into this file (line 10).

No unit tests exist for this page (matches repo convention — verified by `npm -w client run build` + manual checklist).

- [ ] **Step 0: Filter `PrestamosTab` to `tipo=PRESTAMO` (true separation from Anticipos)**

Self-review finding: without this step, an `ANTICIPO`-type record created via
the new `AnticiposTab` would ALSO show up in the existing `PrestamosTab`
(which today loads all préstamos for the collaborator with no `tipo`
filter) — contradicting the approved design's "pestaña Anticipos
**separada** de Préstamos." Find `PrestamosTab`'s `cargar` function
(currently):

```jsx
  const cargar = () => api.get(`/prestamos?colaborador_id=${col.id}&per_page=100`)
    .then((r) => setPrestamos(r.data || r)).catch((e) => onError(e.message));
```

Replace with (adds `&tipo=PRESTAMO`):

```jsx
  const cargar = () => api.get(`/prestamos?colaborador_id=${col.id}&tipo=PRESTAMO&per_page=100`)
    .then((r) => setPrestamos(r.data || r)).catch((e) => onError(e.message));
```

Also find `PrestamosTab`'s `crear` function's POST body (currently):

```jsx
      await api.post('/prestamos', {
        colaborador_id: col.id, monto_total: Number(form.monto_total),
        cuota_quincena: Number(form.cuota_quincena), fecha_inicio: form.fecha_inicio, notas: form.notas || null,
      });
```

Replace with (explicit `tipo: 'PRESTAMO'`, so a new préstamo created from
this tab is never ambiguous even though the backend already defaults to
`'PRESTAMO'` — explicit here matches the explicit `tipo: 'ANTICIPO'` this
task adds to `AnticiposTab` below, for symmetry):

```jsx
      await api.post('/prestamos', {
        colaborador_id: col.id, tipo: 'PRESTAMO', monto_total: Number(form.monto_total),
        cuota_quincena: Number(form.cuota_quincena), fecha_inicio: form.fecha_inicio, notas: form.notas || null,
      });
```

- [ ] **Step 1: Add "Anticipos" to the tab list**

Current (line 16):

```jsx
const TABS_BASE = ['Ficha', 'Contratos', 'Descuentos', 'Préstamos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];
```

Replace with (inserts "Anticipos" right after "Préstamos"):

```jsx
const TABS_BASE = ['Ficha', 'Contratos', 'Descuentos', 'Préstamos', 'Anticipos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];
```

- [ ] **Step 2: Add the `AnticiposTab` component**

Add this new function immediately after the closing `}` of `PrestamosTab` (which currently ends right before `function AusenciasTab({ col, onError }) {`). `AnticiposTab` is `PrestamosTab` with `tipo=ANTICIPO` hardcoded in both the load query and the create payload, and with copy that says "anticipo" instead of "préstamo":

```jsx
function AnticiposTab({ col, onError }) {
  const [anticipos, setAnticipos] = useState([]);
  const [form, setForm] = useState({ monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' });
  const [modalAbono, setModalAbono] = useState(null);
  const [modalCuota, setModalCuota] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();

  const cargar = () => api.get(`/prestamos?colaborador_id=${col.id}&tipo=ANTICIPO&per_page=100`)
    .then((r) => setAnticipos(r.data || r)).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/prestamos', {
        colaborador_id: col.id, tipo: 'ANTICIPO', monto_total: Number(form.monto_total),
        cuota_quincena: Number(form.cuota_quincena), fecha_inicio: form.fecha_inicio, notas: form.notas || null,
      });
      setForm({ monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' });
      toast.success('Anticipo registrado.');
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const eliminar = async (p) => {
    if (Number(p.saldo_pendiente) !== Number(p.monto_total)) {
      return onError('No se puede eliminar: el anticipo ya tiene pagos aplicados.');
    }
    const ok = await confirm({
      title: 'Eliminar anticipo',
      message: `¿Eliminar anticipo de ${money(p.monto_total)}?`,
      confirmLabel: 'Eliminar', danger: true,
    });
    if (!ok) return;
    try { await api.del(`/prestamos/${p.id}`); toast.success('Anticipo eliminado.'); cargar(); }
    catch (err) { onError(err.message); }
  };

  const totalActivo = anticipos.filter((p) => p.activo).reduce((s, p) => s + Number(p.saldo_pendiente), 0);
  const cuotaActiva = anticipos.filter((p) => p.activo).reduce((s, p) => s + Number(p.cuota_quincena), 0);

  return (
    <div className="grid gap-4">
      {totalActivo > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <Card><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Saldo pendiente</p>
            <p className="text-2xl font-display font-bold mt-1">{money(totalActivo)}</p></Card>
          <Card><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Descuento por quincena</p>
            <p className="text-2xl font-display font-bold mt-1">{money(cuotaActiva)}</p></Card>
        </div>
      )}
      <Card>
        <h2 className="font-semibold mb-3">Nuevo anticipo</h2>
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <input required type="number" step="0.01" min="0.01" placeholder="Monto total" className="input w-full"
            value={form.monto_total} onChange={(e) => setForm({ ...form, monto_total: e.target.value })} />
          <input required type="number" step="0.01" min="0.01" placeholder="Cuota por quincena" className="input w-full"
            value={form.cuota_quincena} onChange={(e) => setForm({ ...form, cuota_quincena: e.target.value })} />
          <input required type="date" className="input w-full"
            value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
          <input placeholder="Notas (opcional)" className="input w-full md:col-span-4"
            value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
        </form>
        <p className="text-xs text-slate-500 mt-2">
          La fecha es la <strong>primera quincena de descuento</strong>.
        </p>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3">1ra desc.</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {anticipos.map((p) => (
              <tr key={p.id} className={`border-b border-slate-200 hover:bg-slate-50 ${!p.activo && 'opacity-50'}`}>
                <td className="p-3 text-right">{money(p.monto_total)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {money(p.cuota_quincena)}
                  {p.activo && (
                    <button onClick={() => setModalCuota(p)} className="text-slate-400 hover:text-gold-600 ml-1 align-middle" title="Editar cuota">
                      <Pencil size={13} />
                    </button>
                  )}
                </td>
                <td className="p-3 text-right font-semibold">{money(p.saldo_pendiente)}</td>
                <td className="p-3 whitespace-nowrap">{fecha(p.fecha_inicio)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {p.activo && (
                    <>
                      <button onClick={() => setModalAbono({ prestamo: p, montoInicial: '' })}
                        className="btn btn-secondary !px-2.5 !py-1 text-xs">Abonar</button>
                      <button onClick={() => setModalAbono({ prestamo: p, montoInicial: p.saldo_pendiente })}
                        className="btn btn-secondary !px-2.5 !py-1 text-xs ml-1">Precancelar</button>
                    </>
                  )}
                  {Number(p.saldo_pendiente) === Number(p.monto_total) && (
                    <button onClick={() => eliminar(p)} className="text-slate-400 hover:text-red-600 ml-2 align-middle" title="Eliminar">
                      <Trash2 size={15} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {anticipos.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin anticipos registrados.</td></tr>}
          </tbody>
        </table>
      </Card>

      <AbonoModal prestamo={modalAbono?.prestamo} montoInicial={modalAbono?.montoInicial}
        open={!!modalAbono} onClose={() => setModalAbono(null)} onGuardado={cargar} />
      <CuotaModal prestamo={modalCuota} open={!!modalCuota} onClose={() => setModalCuota(null)} onGuardado={cargar} />
    </div>
  );
}
```

- [ ] **Step 3: Render the tab**

Find this line (currently, after Task 1-3 of the earlier `colaboradores-datos-personales` plan and this plan's own Task 1-3, it should still read exactly this — search by content, not line number):

```jsx
      {tab === 'Préstamos' && <PrestamosTab col={col} onError={setError} />}
```

Add right after it:

```jsx
      {tab === 'Préstamos' && <PrestamosTab col={col} onError={setError} />}
      {tab === 'Anticipos' && <AnticiposTab col={col} onError={setError} />}
```

- [ ] **Step 4: Build the client to confirm it compiles**

Run: `npm -w client run build`
Expected: `✓ built in <time>` with no errors.

- [ ] **Step 5: Manual verification**

Open a collaborator's profile, go to the new "Anticipos" tab, and confirm:
1. It's empty initially ("Sin anticipos registrados").
2. Registering one creates it with `tipo=ANTICIPO` — it shows up in this "Anticipos" tab and in the global Préstamos page (filterable), but does NOT show up in this same collaborator's "Préstamos" tab (Task 4 Step 0 filtered that tab to `tipo=PRESTAMO` only) — true separation between the two tabs, per the approved design.
3. Abonar/precancelar/editar cuota/eliminar all work identically to how they work in the Préstamos tab.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ColaboradorDetalle.jsx
git commit -m "feat: pestaña Anticipos en la ficha del colaborador"
```

---

## Final Check

- [ ] Run `npm -w server test` — full suite green.
- [ ] Run `npm -w client run build` — compiles clean.
- [ ] Push the branch: `git push`.
