# Mejoras de Calidad de Vida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Toast/Modal UX system used everywhere native dialogs exist today, fix the ambiguous préstamo date and the CARROS-YA retention behavior, let a BORRADOR period pick up recurring discounts/loans created after it was generated, add HR-relevant KPIs and richer reports, and reorganize Configuración into tabs.

**Architecture:** Backend (Express + pg, ESM) gains one migration (007) adding origin-tracking columns to `lineas_rol`, a `config_empresas` table, and an `empresa` column on `facturas_proveedor`; two new/extended route modules (`empresas.js`, extended `facturas.js`/`reportes.js`); and two functions extracted out of `generarRoles` into reusable, testable pieces. Frontend gains two new foundational components (`Toast.jsx`, `Modal.jsx`) mounted once in `App.jsx`, then every existing native `alert/confirm/prompt` is replaced with them, and several pages (`Prestamos.jsx`, `Dashboard.jsx`, `Reportes.jsx`, `Configuracion.jsx`, `ColaboradorDetalle.jsx`, `Proveedores.jsx`, `RolPago.jsx`) are extended following the codebase's existing patterns (page-level state + reusable `Form*`/`Tabla*` exports, tab switchers, `Card`/`Badge`/`KpiCard`/`PageTitle` components, Tailwind utility classes from `index.css`).

**Tech Stack:** Node/Express/pg (ESM, no ORM), vitest + supertest for server tests, React 18 + Vite + Tailwind, vitest + @testing-library/react + jsdom for client tests (already configured, one existing test `client/tests/Badge.test.jsx`), lucide-react icons. No new npm dependencies in either package.

## Global Constraints

- No new npm dependencies — Toast/Modal are built from scratch on React context + `createPortal` (already available via `react-dom`).
- Toast + Modal (never native `alert()`/`confirm()`/`prompt()`) is the mandatory pattern from this point forward.
- Retención de facturas se calcula **siempre en el servidor**, nunca confiando en el cliente (constraint ya existente, se preserva).
- Todos los montos usan `round2()` de `server/src/lib/round.js`; nunca aritmética de punto flotante sin redondear.
- Migraciones nuevas van numeradas secuencialmente en `server/db/migrations/`, y **todas** deben agregarse también a `server/db/schema.sql` (dos lugares: el `DROP TABLE IF EXISTS` de la cabecera y un `\i` al final).
- Todo el texto de UI y los mensajes de validación son en español.
- Server tests: vitest + supertest, con `vi.mock('../src/auth/google.js', ...)` y el helper `auth = (r) => r.set('Authorization', 'Bearer x')` (patrón ya usado en todos los `tests/*.test.js`).
- Client tests: vitest + `@testing-library/react` + jsdom, config en `client/vitest.config.js`, setup en `client/tests/setup.js` (ya existen, no tocar).
- Alcance de reemplazo de banners de error inline por `toast.error()`: se aplica a los **8 archivos que este plan modifica** (`Prestamos.jsx`, `RolPago.jsx`, `Descuentos.jsx`, `ColaboradorDetalle.jsx`, `Proveedores.jsx`, `Dashboard.jsx`, `Reportes.jsx`, `Configuracion.jsx`). Páginas no tocadas por este plan (`Colaboradores.jsx`, `Periodos.jsx`, `PeriodoDetalle.jsx`, `Ausencias.jsx`) **mantienen** su patrón actual de banner — no son parte de este trabajo.
- Páginas con una compuerta de carga bloqueante (`if (!x) return <Card>{error || 'Cargando…'}</Card>` — es el caso de `RolPago.jsx` y **no** el de `Prestamos.jsx`/`Dashboard.jsx`/`Descuentos.jsx`) conservan esa compuerta con su `error` local; solo las acciones (crear/editar/eliminar/aprobar) dentro de esas páginas pasan a usar toast.

---

## Phase 1 — Sistema Toast + Modal (base transversal)

### Task 1: `ToastProvider` / `useToast()`

**Files:**
- Create: `client/src/components/Toast.jsx`
- Test: `client/tests/Toast.test.jsx`

**Interfaces:**
- Produces: `ToastProvider` (component, wraps children), `useToast()` hook returning `{ success(mensaje), error(mensaje), info(mensaje) }`.

- [ ] **Step 1: Write the failing test**

```jsx
// client/tests/Toast.test.jsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToastProvider, useToast } from '../src/components/Toast.jsx';

function Disparador() {
  const toast = useToast();
  return (
    <div>
      <button onClick={() => toast.success('Guardado correctamente')}>Exito</button>
      <button onClick={() => toast.error('Algo falló')}>Error</button>
    </div>
  );
}

describe('Toast', () => {
  it('muestra un toast de éxito al llamar toast.success', () => {
    render(<ToastProvider><Disparador /></ToastProvider>);
    fireEvent.click(screen.getByText('Exito'));
    expect(screen.getByRole('alert')).toHaveTextContent('Guardado correctamente');
  });

  it('se puede cerrar manualmente con el botón de cierre', () => {
    render(<ToastProvider><Disparador /></ToastProvider>);
    fireEvent.click(screen.getByText('Error'));
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falló');
    fireEvent.click(screen.getByRole('alert').querySelector('button'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('useToast fuera del provider lanza un error', () => {
    const Fuera = () => { useToast(); return null; };
    expect(() => render(<Fuera />)).toThrow(/useToast debe usarse dentro/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run tests/Toast.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/components/Toast.jsx"`

- [ ] **Step 3: Write the component**

```jsx
// client/src/components/Toast.jsx
import { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
let idSeq = 0;

const ESTILOS = {
  success: { icon: CheckCircle2, clase: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
  error: { icon: XCircle, clase: 'bg-red-50 border-red-200 text-red-800' },
  info: { icon: Info, clase: 'bg-slate-50 border-slate-200 text-slate-800' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const quitar = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const mostrar = useCallback((tipo, mensaje) => {
    const id = ++idSeq;
    setToasts((t) => [...t, { id, tipo, mensaje }]);
    setTimeout(() => quitar(id), 4000);
  }, [quitar]);

  const api = {
    success: (m) => mostrar('success', m),
    error: (m) => mostrar('error', m),
    info: (m) => mostrar('info', m),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => {
          const { icon: Icon, clase } = ESTILOS[t.tipo];
          return (
            <div key={t.id} role="alert"
              className={`flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm shadow-lg animate-slide-up ${clase}`}>
              <Icon size={18} className="shrink-0 mt-0.5" />
              <p className="flex-1">{t.mensaje}</p>
              <button onClick={() => quitar(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run tests/Toast.test.jsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Toast.jsx client/tests/Toast.test.jsx
git commit -m "feat: agregar ToastProvider/useToast reutilizable"
```

---

### Task 2: `Modal` genérico + `ConfirmProvider`/`useConfirm()`

**Files:**
- Create: `client/src/components/Modal.jsx`
- Test: `client/tests/Modal.test.jsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `Modal({ open, onClose, title, children, footer, size })` (size: 'sm'|'md'|'lg', default 'md'), `ConfirmProvider` (component), `useConfirm()` hook devolviendo `confirm({ title, message, confirmLabel, danger }) => Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

```jsx
// client/tests/Modal.test.jsx
import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal, ConfirmProvider, useConfirm } from '../src/components/Modal.jsx';

describe('Modal', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<Modal open={false} onClose={() => {}} title="X">contenido</Modal>);
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });

  it('renderiza el título y contenido cuando open=true', () => {
    render(<Modal open={true} onClose={() => {}} title="Editar banco">contenido</Modal>);
    expect(screen.getByText('Editar banco')).toBeInTheDocument();
    expect(screen.getByText('contenido')).toBeInTheDocument();
  });

  it('llama onClose al hacer click en el botón de cierre', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="X">contenido</Modal>);
    fireEvent.click(screen.getByRole('button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('llama onClose al presionar Escape', () => {
    const onClose = vi.fn();
    render(<Modal open={true} onClose={onClose} title="X">contenido</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

function Disparador() {
  const confirm = useConfirm();
  const [resultado, setResultado] = useState('');
  return (
    <div>
      <button onClick={async () => setResultado(String(await confirm({ title: 'Eliminar', message: '¿Seguro?' })))}>
        Preguntar
      </button>
      <p>resultado: {resultado}</p>
    </div>
  );
}

describe('useConfirm', () => {
  it('confirm() resuelve true al aceptar', async () => {
    render(<ConfirmProvider><Disparador /></ConfirmProvider>);
    fireEvent.click(screen.getByText('Preguntar'));
    fireEvent.click(screen.getByText('Confirmar'));
    await screen.findByText('resultado: true');
  });

  it('confirm() resuelve false al cancelar', async () => {
    render(<ConfirmProvider><Disparador /></ConfirmProvider>);
    fireEvent.click(screen.getByText('Preguntar'));
    fireEvent.click(screen.getByText('Cancelar'));
    await screen.findByText('resultado: false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run tests/Modal.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/components/Modal.jsx"`

- [ ] **Step 3: Write the component**

```jsx
// client/src/components/Modal.jsx
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const anchos = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg' };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className={`relative w-full ${anchos[size]} bg-white rounded-xl shadow-xl animate-slide-up`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="font-display font-bold text-slate-900">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-200">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}

// --- Confirmación basada en promesas: reemplaza confirm() nativo ---
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [estado, setEstado] = useState(null); // { title, message, confirmLabel, danger, resolve }

  const confirm = useCallback(({ title = 'Confirmar', message, confirmLabel = 'Confirmar', danger = false }) => {
    return new Promise((resolve) => {
      setEstado({ title, message, confirmLabel, danger, resolve });
    });
  }, []);

  const cerrar = (valor) => {
    estado?.resolve(valor);
    setEstado(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!estado} onClose={() => cerrar(false)} title={estado?.title} size="sm"
        footer={
          <>
            <button onClick={() => cerrar(false)} className="btn btn-secondary">Cancelar</button>
            <button onClick={() => cerrar(true)} className={estado?.danger ? 'btn btn-danger' : 'btn btn-primary'}>
              {estado?.confirmLabel}
            </button>
          </>
        }>
        <p className="text-sm text-slate-600">{estado?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm debe usarse dentro de <ConfirmProvider>');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run tests/Modal.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Modal.jsx client/tests/Modal.test.jsx
git commit -m "feat: agregar Modal genérico y useConfirm basado en promesas"
```

---

### Task 3: Mensajes de validación HTML5 en español

**Files:**
- Create: `client/src/lib/validacion-html5.js`
- Test: `client/tests/validacion-html5.test.jsx`

**Interfaces:**
- Produces: `instalarMensajesValidacionEspanol()` — instala listeners globales en `document`, retorna función de limpieza (`() => void`).

- [ ] **Step 1: Write the failing test**

```jsx
// client/tests/validacion-html5.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { instalarMensajesValidacionEspanol } from '../src/lib/validacion-html5.js';

describe('validación HTML5 en español', () => {
  it('traduce el mensaje de un campo requerido vacío', () => {
    instalarMensajesValidacionEspanol();
    render(
      <form>
        <input required data-testid="campo" />
      </form>
    );
    const input = screen.getByTestId('campo');
    const valido = input.checkValidity();
    expect(valido).toBe(false);
    expect(input.validationMessage).toBe('Por favor completa este campo.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run tests/validacion-html5.test.jsx`
Expected: FAIL — `Failed to resolve import "../src/lib/validacion-html5.js"`

- [ ] **Step 3: Write the module**

```js
// client/src/lib/validacion-html5.js
// Traduce los mensajes de validación nativa del navegador (en inglés) a
// español, sin tocar cada formulario individualmente. Se instala una sola
// vez, al montar App.jsx.
const MENSAJES = {
  valueMissing: 'Por favor completa este campo.',
  typeMismatch: (input) => (input.type === 'email' ? 'Ingresa un correo electrónico válido.' : 'El valor no tiene el formato esperado.'),
  patternMismatch: 'El valor no cumple el formato requerido.',
  tooShort: (input) => `Debe tener al menos ${input.minLength} caracteres.`,
  tooLong: (input) => `Debe tener como máximo ${input.maxLength} caracteres.`,
  rangeUnderflow: (input) => `El valor debe ser mayor o igual a ${input.min}.`,
  rangeOverflow: (input) => `El valor debe ser menor o igual a ${input.max}.`,
  stepMismatch: 'El valor no es válido para este campo.',
  badInput: 'Ingresa un valor válido.',
};

function mensajePara(input) {
  const v = input.validity;
  for (const [clave, texto] of Object.entries(MENSAJES)) {
    if (v[clave]) return typeof texto === 'function' ? texto(input) : texto;
  }
  return 'El valor ingresado no es válido.';
}

export function instalarMensajesValidacionEspanol() {
  const onInvalid = (e) => {
    const input = e.target;
    if (!('validity' in input)) return;
    input.setCustomValidity(mensajePara(input));
  };
  const onInput = (e) => {
    if ('setCustomValidity' in e.target) e.target.setCustomValidity('');
  };
  document.addEventListener('invalid', onInvalid, true);
  document.addEventListener('input', onInput, true);
  return () => {
    document.removeEventListener('invalid', onInvalid, true);
    document.removeEventListener('input', onInput, true);
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run tests/validacion-html5.test.jsx`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/validacion-html5.js client/tests/validacion-html5.test.jsx
git commit -m "feat: traducir mensajes de validación HTML5 nativa al español"
```

---

### Task 4: Montar los providers en `App.jsx`

**Files:**
- Modify: `client/src/App.jsx` (reescritura completa, 49 líneas → ver abajo)

**Interfaces:**
- Consumes: `ToastProvider` (Task 1), `ConfirmProvider` (Task 2), `instalarMensajesValidacionEspanol` (Task 3).

- [ ] **Step 1: Reescribir `App.jsx` completo**

```jsx
// client/src/App.jsx
import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { ConfirmProvider } from './components/Modal.jsx';
import { instalarMensajesValidacionEspanol } from './lib/validacion-html5.js';
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
import Descuentos from './pages/Descuentos.jsx';
import Ausencias from './pages/Ausencias.jsx';

export default function App() {
  const { usuario, cargando } = useAuth();

  useEffect(() => instalarMensajesValidacionEspanol(), []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        {cargando ? (
          <div className="min-h-screen flex flex-col items-center justify-center bg-brand-950">
            <div className="w-12 h-12 rounded-xl bg-brand-800 border border-brand-600/30 flex items-center justify-center mb-4">
              <img src="/logo-ivory.png" alt="" className="w-7 h-7" />
            </div>
            <div className="w-6 h-6 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
          </div>
        ) : !usuario ? (
          <Login />
        ) : (
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
              <Route path="/descuentos" element={<Descuentos />} />
              <Route path="/ausencias" element={<Ausencias />} />
              <Route path="/reportes" element={<Reportes />} />
              <Route path="/configuracion" element={<Configuracion />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Layout>
        )}
      </ConfirmProvider>
    </ToastProvider>
  );
}
```

- [ ] **Step 2: Verificar que el cliente compila**

Run: `cd client && npm run build`
Expected: `✓ built in ...` sin errores.

- [ ] **Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat: montar ToastProvider/ConfirmProvider y validaciones en español en App"
```

---

### Task 5: Reemplazar `confirm()` en `Descuentos.jsx` y `ColaboradorDetalle.jsx` (documentos)

**Files:**
- Modify: `client/src/pages/Descuentos.jsx` (función `TablaDescuentos`, líneas 64-73 y su firma)
- Modify: `client/src/pages/ColaboradorDetalle.jsx` (función `DocumentosTab`, líneas 210-236 y su llamada en el render)

**Interfaces:**
- Consumes: `useToast` (Task 1), `useConfirm` (Task 2).
- Produces: `TablaDescuentos` ya NO recibe `onError` (elimina esa prop de su firma y de sus dos usos).

- [ ] **Step 1: Editar `TablaDescuentos` en `Descuentos.jsx`**

Reemplazar la firma y el cuerpo de `alternar`/`eliminar`:

```jsx
// En client/src/pages/Descuentos.jsx, al inicio del archivo agregar:
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Modal.jsx';

// Reemplazar la función completa:
export function TablaDescuentos({ descuentos, onCambio, conColaborador = true }) {
  const toast = useToast();
  const confirm = useConfirm();

  const alternar = async (d) => {
    try {
      await api.patch(`/descuentos/${d.id}`, { activo: !d.activo });
      onCambio();
    } catch (e) {
      toast.error(e.message);
    }
  };

  const eliminar = async (d) => {
    const ok = await confirm({
      title: 'Eliminar descuento',
      message: `¿Eliminar ${d.tipo_linea} de ${d.colaborador_nombre ?? 'este colaborador'}?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/descuentos/${d.id}`);
      toast.success('Descuento eliminado.');
      onCambio();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    // ... el resto del JSX de la tabla queda exactamente igual (sin cambios) ...
```

(El resto del `return (...)` de `TablaDescuentos` — el `<table>` completo — no cambia; solo cambian la firma de la función y el cuerpo de `alternar`/`eliminar` arriba de él.)

- [ ] **Step 2: Actualizar los dos call-sites que pasaban `onError`**

En `client/src/pages/Descuentos.jsx`, dentro del componente `Descuentos` (el `export default`), cambiar:

```jsx
<TablaDescuentos descuentos={descuentos} onCambio={cargar} onError={setError} />
```
por:
```jsx
<TablaDescuentos descuentos={descuentos} onCambio={cargar} />
```

En `client/src/pages/ColaboradorDetalle.jsx`, dentro de `DescuentosTab`, cambiar:

```jsx
<TablaDescuentos descuentos={descuentos} onCambio={cargar} onError={onError} conColaborador={false} />
```
por:
```jsx
<TablaDescuentos descuentos={descuentos} onCambio={cargar} conColaborador={false} />
```

- [ ] **Step 3: Editar `DocumentosTab` en `ColaboradorDetalle.jsx`**

Agregar imports al inicio del archivo:

```jsx
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Modal.jsx';
```

Reemplazar el cuerpo de `DocumentosTab` (la función `eliminar`):

```jsx
function DocumentosTab({ col, onError }) {
  const [docs, setDocs] = useState([]);
  const [tipo, setTipo] = useState('CONTRATO');
  const toast = useToast();
  const confirm = useConfirm();
  const cargar = () => api.get(`/colaboradores/${col.id}/documentos`).then(setDocs).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const subir = async (e) => {
    const archivo = e.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 5 * 1024 * 1024) return onError('El archivo supera los 5 MB');
    const q = new URLSearchParams({ nombre: archivo.name, tipo });
    const res = await fetch(`/api/colaboradores/${col.id}/documentos?${q}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': archivo.type || 'application/octet-stream' },
      body: archivo,
    });
    if (!res.ok) return onError((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    e.target.value = '';
    cargar();
  };

  const eliminar = async (d) => {
    const ok = await confirm({
      title: 'Eliminar documento',
      message: `¿Eliminar ${d.nombre}?`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/colaboradores/${col.id}/documentos/${d.id}`);
      toast.success('Documento eliminado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    // ... el resto del JSX no cambia ...
```

- [ ] **Step 4: Verificar manualmente**

Run: `cd client && npm run build`
Expected: build exitoso, sin warnings de props no usadas que rompan nada.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Descuentos.jsx client/src/pages/ColaboradorDetalle.jsx
git commit -m "fix: reemplazar confirm() nativo por useConfirm() en descuentos y documentos"
```

---

## Phase 2 — Préstamos: fecha real + modales

### Task 6: `generarRoles` respeta la fecha del préstamo

**Files:**
- Modify: `server/src/services/periodos.js:83-98` (bloque "Préstamos activos")
- Modify: `server/tests/prestamos.test.js` (agregar test)

**Interfaces:**
- Sin cambios de firma pública todavía (el refactor a función reutilizable es Task 11, en Phase 3). Este task solo corrige el `WHERE` del query inline.

- [ ] **Step 1: Escribir el test que falla**

Agregar a `server/tests/prestamos.test.js`, dentro del `describe('préstamos', ...)`, después del test `'la cuota amortiza el saldo al generar el período'`:

```js
  it('un préstamo con fecha de descuento futura no se aplica en el período actual', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Futuro ${Date.now()}`, cedula: `PF${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const pr = (
      await auth(request(app).post('/api/prestamos')).send({
        colaborador_id: col.id, monto_total: 300, cuota_quincena: 100, fecha_inicio: '2026-09-01'
      })
    ).body;

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `futuro test ${Date.now()}`, fecha_inicio: '2026-08-16', fecha_fin: '2026-08-31', quincena: 2
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);
    const lineas = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(lineas.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(false);

    const { rows } = await pool.query('SELECT saldo_pendiente FROM prestamos WHERE id=$1', [pr.id]);
    expect(Number(rows[0].saldo_pendiente)).toBe(300);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/prestamos.test.js -t "fecha de descuento futura"`
Expected: FAIL — el préstamo SÍ se descuenta (saldo pasa a 200, no queda en 300).

- [ ] **Step 3: Corregir el query en `periodos.js`**

En `server/src/services/periodos.js`, reemplazar:

```js
    // Préstamos activos → cuota de amortización.
    const { rows: prestamos } = await client.query(
      'SELECT * FROM prestamos WHERE colaborador_id=$1 AND activo=true',
      [col.id]
    );
```
por:
```js
    // Préstamos activos → cuota de amortización. Solo entran los que ya
    // deben empezar a descontarse (fecha_inicio = primera quincena de
    // descuento) en o antes del fin de este período.
    const { rows: prestamos } = await client.query(
      'SELECT * FROM prestamos WHERE colaborador_id=$1 AND activo=true AND fecha_inicio <= $2',
      [col.id, periodoRows[0].fecha_fin]
    );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/prestamos.test.js`
Expected: PASS (7 tests — los 6 existentes + el nuevo)

- [ ] **Step 5: Commit**

```bash
git add server/src/services/periodos.js server/tests/prestamos.test.js
git commit -m "fix: un préstamo no se descuenta antes de su primera quincena de descuento"
```

---

### Task 7: `Prestamos.jsx` — modales de abono/precancelación/cuota + toasts

**Files:**
- Modify: `client/src/pages/Prestamos.jsx` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `Modal` (Task 2), `useConfirm` (Task 2), `useToast` (Task 1).

- [ ] **Step 1: Reescribir `Prestamos.jsx` completo**

```jsx
// client/src/pages/Prestamos.jsx
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import KpiCard from '../components/KpiCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { colaborador_id: '', monto_total: '', cuota_quincena: '', fecha_inicio: '', notas: '' };
const FILTROS = [
  { valor: '', label: 'Todos' },
  { valor: 'true', label: 'Activos' },
  { valor: 'false', label: 'Pagados' },
];

function BarraProgreso({ prestamo }) {
  const total = Number(prestamo.monto_total);
  const pagado = total - Number(prestamo.saldo_pendiente);
  const pct = total > 0 ? Math.min((pagado / total) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-500 mb-1">
        <span>{money(pagado)} pagado</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : 'bg-gold-400'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// Fila expandible: muestra notas e historial de abonos bajo demanda.
function DetalleAbonos({ prestamoId }) {
  const [detalle, setDetalle] = useState(null);
  useEffect(() => {
    api.get(`/prestamos/${prestamoId}`).then(setDetalle).catch(() => setDetalle({ abonos_detalle: [] }));
  }, [prestamoId]);

  if (!detalle) return <p className="text-sm text-slate-500 p-3">Cargando…</p>;
  return (
    <div className="p-3 bg-slate-50 rounded-lg text-sm">
      {detalle.notas && <p className="mb-2 text-slate-600"><span className="font-medium">Notas:</span> {detalle.notas}</p>}
      <p className="font-medium mb-1">Abonos y precancelaciones</p>
      {detalle.abonos_detalle?.length ? (
        <ul className="space-y-1">
          {detalle.abonos_detalle.map((a) => (
            <li key={a.id} className="flex justify-between text-slate-600">
              <span>{fecha(a.creado_en)} — {a.notas || 'Abono'} <span className="text-slate-400">({a.registrado_por_email})</span></span>
              <span className="font-medium">{money(a.monto)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-slate-500">Sin abonos extraordinarios. Las cuotas por nómina se ven en los roles de pago.</p>
      )}
    </div>
  );
}

// Modal único para abonar o precancelar: el monto siempre es editable; si
// coincide con el saldo pendiente, avisa que dejará el préstamo en 0.
function AbonoModal({ prestamo, montoInicial, open, onClose, onGuardado }) {
  const [monto, setMonto] = useState('');
  const [notas, setNotas] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (open) { setMonto(String(montoInicial ?? '')); setNotas(''); }
  }, [open, montoInicial]);

  if (!prestamo) return null;
  const saldo = Number(prestamo.saldo_pendiente);
  const precancela = Number(monto) > 0 && Math.abs(Number(monto) - saldo) < 0.005;

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/prestamos/${prestamo.id}/abonos`, { monto: Number(monto), notas: notas || undefined });
      toast.success(precancela ? 'Préstamo precancelado.' : 'Abono registrado.');
      onGuardado();
      onClose();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Registrar abono — ${prestamo.colaborador_nombre}`} size="sm"
      footer={<button type="submit" form="form-abono" className="btn btn-primary">Registrar</button>}>
      <form id="form-abono" onSubmit={guardar} className="grid gap-3">
        <p className="text-sm text-slate-500">Saldo pendiente: <span className="font-semibold text-slate-700">{money(saldo)}</span></p>
        <label className="text-sm text-slate-600">Monto del abono
          <input required autoFocus type="number" step="0.01" min="0.01" max={saldo} className="input w-full mt-1"
            value={monto} onChange={(e) => setMonto(e.target.value)} />
        </label>
        {precancela && (
          <p className="text-sm text-gold-700 bg-gold-50 border border-gold-200 rounded-lg px-3 py-2">
            Esto precancelará el préstamo: el saldo quedará en $0.00 y dejará de descontarse.
          </p>
        )}
        <label className="text-sm text-slate-600">Notas (opcional)
          <input className="input w-full mt-1" value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

function CuotaModal({ prestamo, open, onClose, onGuardado }) {
  const [cuota, setCuota] = useState('');
  const toast = useToast();

  useEffect(() => {
    if (open) setCuota(String(prestamo?.cuota_quincena ?? ''));
  }, [open, prestamo]);

  if (!prestamo) return null;

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/prestamos/${prestamo.id}`, { cuota_quincena: Number(cuota) });
      toast.success('Cuota actualizada.');
      onGuardado();
      onClose();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Editar cuota — ${prestamo.colaborador_nombre}`} size="sm"
      footer={<button type="submit" form="form-cuota" className="btn btn-primary">Guardar</button>}>
      <form id="form-cuota" onSubmit={guardar}>
        <label className="text-sm text-slate-600">Cuota por quincena
          <input required autoFocus type="number" step="0.01" min="0.01" className="input w-full mt-1"
            value={cuota} onChange={(e) => setCuota(e.target.value)} />
        </label>
      </form>
    </Modal>
  );
}

export default function Prestamos() {
  const [respuesta, setRespuesta] = useState({ data: [], total: 0, page: 1, per_page: 10, resumen: {} });
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [q, setQ] = useState('');
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
  useEffect(() => {
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  }, []);

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

  const eliminar = async (p) => {
    const ok = await confirm({
      title: 'Eliminar préstamo',
      message: `¿Eliminar el préstamo de ${p.colaborador_nombre}? Solo es posible si no tiene pagos aplicados.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.del(`/prestamos/${p.id}`);
      toast.success('Préstamo eliminado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const { data, total, per_page, resumen } = respuesta;
  const totalPaginas = Math.max(Math.ceil(total / per_page), 1);
  const sinPagos = (p) => Number(p.saldo_pendiente) === Number(p.monto_total) && p.abonos === 0;

  return (
    <div className="animate-fade-in">
      <PageTitle>Préstamos</PageTitle>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <KpiCard titulo="Préstamos activos" valor={resumen.activos ?? '—'} />
        <KpiCard titulo="Saldo por cobrar" valor={money(resumen.saldo_activo ?? 0)} />
        <KpiCard titulo="Descuento por quincena" valor={money(resumen.cuota_activa ?? 0)} sub="suma de cuotas activas" />
      </div>

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

        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Colaborador</th>
              <th className="p-3 text-right">Total</th>
              <th className="p-3 text-right">Cuota</th>
              <th className="p-3 w-44">Progreso</th>
              <th className="p-3 text-right">Saldo</th>
              <th className="p-3">1ra quincena desc.</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="p-3">
                    <Link to={`/colaboradores/${p.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                      {p.colaborador_nombre}
                    </Link>
                    {!p.activo && <span className="badge bg-emerald-100 text-emerald-700 ml-2">PAGADO</span>}
                  </td>
                  <td className="p-3 text-right">{money(p.monto_total)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {money(p.cuota_quincena)}
                    {p.activo && (
                      <button onClick={() => setModalCuota(p)} className="text-slate-400 hover:text-gold-600 ml-1 align-middle" title="Editar cuota">
                        <Pencil size={13} />
                      </button>
                    )}
                  </td>
                  <td className="p-3"><BarraProgreso prestamo={p} /></td>
                  <td className="p-3 text-right font-semibold">{money(p.saldo_pendiente)}</td>
                  <td className="p-3 whitespace-nowrap">{fecha(p.fecha_inicio)}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {p.activo && (
                      <>
                        <button onClick={() => setModalAbono({ prestamo: p, montoInicial: '' })} className="btn btn-secondary !px-2.5 !py-1 text-xs">Abonar</button>
                        <button onClick={() => setModalAbono({ prestamo: p, montoInicial: p.saldo_pendiente })} className="btn btn-secondary !px-2.5 !py-1 text-xs ml-1">Precancelar</button>
                      </>
                    )}
                    {sinPagos(p) && (
                      <button onClick={() => eliminar(p)} className="text-slate-400 hover:text-red-600 ml-2 align-middle" title="Eliminar">
                        <Trash2 size={15} />
                      </button>
                    )}
                    <button onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                      className="text-slate-400 hover:text-slate-700 ml-2 align-middle" title="Ver abonos y notas">
                      {expandido === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </td>
                </tr>
                {expandido === p.id && (
                  <tr className="border-b border-slate-200">
                    <td colSpan={7} className="px-3 pb-3"><DetalleAbonos prestamoId={p.id} /></td>
                  </tr>
                )}
              </Fragment>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={7} className="p-4 text-slate-500">Sin préstamos con este filtro.</td></tr>
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between p-4 text-sm text-slate-500">
          <span>{total} préstamo{total !== 1 && 's'}</span>
          <div className="flex items-center gap-2">
            <button disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}
              className="btn btn-secondary !px-2 !py-1 disabled:opacity-40"><ChevronLeft size={15} /></button>
            <span>Página {pagina} de {totalPaginas}</span>
            <button disabled={pagina >= totalPaginas} onClick={() => setPagina(pagina + 1)}
              className="btn btn-secondary !px-2 !py-1 disabled:opacity-40"><ChevronRight size={15} /></button>
          </div>
        </div>
      </Card>

      <AbonoModal prestamo={modalAbono?.prestamo} montoInicial={modalAbono?.montoInicial}
        open={!!modalAbono} onClose={() => setModalAbono(null)} onGuardado={cargar} />
      <CuotaModal prestamo={modalCuota} open={!!modalCuota} onClose={() => setModalCuota(null)} onGuardado={cargar} />
    </div>
  );
}
```

- [ ] **Step 2: Verificar visualmente**

Run: `cd server && npm start &` luego `cd client && npm run dev`, entrar a `/prestamos` autenticado como ADMIN/RRHH y probar: crear préstamo, abrir "Abonar" (monto vacío, editable), abrir "Precancelar" (monto precargado con el saldo, aviso de precancelación), "Editar cuota", y "Eliminar" (ahora pide confirmación en modal, no `window.confirm`).
Expected: los tres flujos usan modales propios, sin diálogos nativos del navegador.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Prestamos.jsx
git commit -m "feat: reemplazar prompt/confirm nativos por modales en Préstamos y aclarar la fecha"
```

---

## Phase 3 — Migración 007 + sincronizar período en BORRADOR

### Task 8: Migración 007

**Files:**
- Create: `server/db/migrations/007_origen_lineas_y_empresas.sql`
- Modify: `server/db/schema.sql`

**Interfaces:**
- Produces: columnas `lineas_rol.prestamo_id`, `lineas_rol.descuento_recurrente_id`; tabla `config_empresas(empresa, aplica_retencion)`; columna `facturas_proveedor.empresa`.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- server/db/migrations/007_origen_lineas_y_empresas.sql
-- Trazabilidad de origen en lineas_rol (para poder sincronizar un rol sin
-- duplicar líneas ya aplicadas) + configuración de retención por empresa +
-- empresa denormalizada en facturas.
ALTER TABLE lineas_rol
  ADD COLUMN prestamo_id uuid REFERENCES prestamos(id),
  ADD COLUMN descuento_recurrente_id uuid REFERENCES descuentos_recurrentes(id);

CREATE TABLE config_empresas (
  empresa text PRIMARY KEY,
  aplica_retencion boolean NOT NULL DEFAULT true
);
INSERT INTO config_empresas (empresa, aplica_retencion) VALUES
  ('BOPELUAL S.A.', true),
  ('CARROS-YA S.A.', false)
ON CONFLICT DO NOTHING;

ALTER TABLE facturas_proveedor ADD COLUMN empresa text;
```

- [ ] **Step 2: Actualizar `schema.sql`**

En `server/db/schema.sql`, cambiar la línea `DROP TABLE IF EXISTS ...` para incluir `config_empresas`:

```sql
DROP TABLE IF EXISTS lineas_rol, roles_pago, facturas_proveedor, abonos_prestamo, prestamos,
  provisiones, contratos, periodos, colaboradores, usuarios, parametros, _migraciones,
  descuentos_recurrentes, ausencias, documentos, evaluaciones, bancos, config_empresas CASCADE;
```

Y agregar la última línea:

```sql
\i migrations/007_origen_lineas_y_empresas.sql
```

- [ ] **Step 3: Aplicar la migración localmente**

Run:
```bash
cd server && node -e "
import('./src/db/pool.js').then(async ({default: pool}) => {
  const { runMigrations } = await import('./src/db/migrate.js');
  await runMigrations(pool);
  const { rows } = await pool.query('SELECT nombre FROM _migraciones ORDER BY nombre');
  console.log(rows.map(r=>r.nombre).join('\n'));
  await pool.end();
});"
```
Expected: la lista incluye `007_origen_lineas_y_empresas.sql` como última línea, sin errores.

- [ ] **Step 4: Commit**

```bash
git add server/db/migrations/007_origen_lineas_y_empresas.sql server/db/schema.sql
git commit -m "feat: migración 007 — origen de líneas, config_empresas y empresa en facturas"
```

---

### Task 9: Extraer `aplicarPrestamosPendientes` / `aplicarDescuentosPendientes`

**Files:**
- Modify: `server/src/services/periodos.js` (agregar 2 exports, usarlos desde `generarRoles`)

**Interfaces:**
- Produces: `aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin) => Promise<number>` (líneas agregadas), `aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena) => Promise<number>`.
- Consumes: nada externo nuevo; usa `calc.cuotaPrestamo` ya importado en el archivo.

- [ ] **Step 1: Agregar las dos funciones exportadas**

En `server/src/services/periodos.js`, después de la función `insertarLinea` (y antes de `generarRoles`), agregar:

```js
// Aplica al rol las cuotas de préstamos activos que aún no tenga (por
// prestamo_id), respetando que ya deba haber empezado a descontarse.
// Reutilizable desde generarRoles y desde /roles/:id/sincronizar.
export async function aplicarPrestamosPendientes(client, rolId, colaboradorId, periodoFechaFin) {
  const { rows: prestamos } = await client.query(
    `SELECT p.* FROM prestamos p
     WHERE p.colaborador_id=$1 AND p.activo=true AND p.fecha_inicio <= $2
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

// Aplica al rol los descuentos recurrentes activos que aún no tenga (por
// descuento_recurrente_id) y que correspondan a esta quincena.
export async function aplicarDescuentosPendientes(client, rolId, colaboradorId, quincena) {
  const { rows: descuentos } = await client.query(
    `SELECT d.* FROM descuentos_recurrentes d
     WHERE d.colaborador_id=$1 AND d.activo=true AND d.aplicar_en IN (0,$2)
       AND NOT EXISTS (
         SELECT 1 FROM lineas_rol l WHERE l.rol_pago_id=$3 AND l.descuento_recurrente_id=d.id
       )`,
    [colaboradorId, quincena, rolId]
  );
  for (const d of descuentos) {
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
  }
  return descuentos.length;
}
```

- [ ] **Step 2: Reemplazar los dos bloques inline en `generarRoles`**

Dentro de `generarRoles`, reemplazar TODO este bloque (préstamos + descuentos recurrentes):

```js
    // Préstamos activos → cuota de amortización. Solo entran los que ya
    // deben empezar a descontarse (fecha_inicio = primera quincena de
    // descuento) en o antes del fin de este período.
    const { rows: prestamos } = await client.query(
      'SELECT * FROM prestamos WHERE colaborador_id=$1 AND activo=true AND fecha_inicio <= $2',
      [col.id, periodoRows[0].fecha_fin]
    );
    for (const pr of prestamos) {
      const r = calc.cuotaPrestamo(Number(pr.cuota_quincena), Number(pr.saldo_pendiente));
      if (r.aplicada > 0) {
        await insertarLinea(client, rolId, {
          tipo: 'CUOTA_PRESTAMO', clase: 'DESCUENTO', monto: r.aplicada, desc: 'Cuota de préstamo'
        });
        await client.query('UPDATE prestamos SET saldo_pendiente=$1, activo=$2 WHERE id=$3', [
          r.saldoNuevo, r.activo, pr.id
        ]);
      }
    }

    // Descuentos recurrentes → se aplican según la quincena configurada
    // (aplicar_en: 0=ambas, 1=solo primera, 2=solo segunda). Con cuotas
    // definidas se decrementan y el descuento se desactiva al llegar a 0.
    const { rows: descuentos } = await client.query(
      `SELECT * FROM descuentos_recurrentes
       WHERE colaborador_id=$1 AND activo=true AND aplicar_en IN (0,$2)`,
      [col.id, quincena]
    );
    for (const d of descuentos) {
      await insertarLinea(client, rolId, {
        tipo: d.tipo_linea, clase: 'DESCUENTO', monto: Number(d.monto), desc: d.notas
      });
      if (d.cuotas_restantes != null) {
        const restantes = d.cuotas_restantes - 1;
        await client.query(
          'UPDATE descuentos_recurrentes SET cuotas_restantes=$1, activo=$2 WHERE id=$3',
          [restantes, restantes > 0, d.id]
        );
      }
    }
```
por:
```js
    await aplicarPrestamosPendientes(client, rolId, col.id, periodoRows[0].fecha_fin);
    await aplicarDescuentosPendientes(client, rolId, col.id, quincena);
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd server && npx vitest run tests/prestamos.test.js tests/descuentos.test.js`
Expected: PASS (todos los tests existentes, incluido el de la Task 6, siguen pasando sin cambios).

- [ ] **Step 4: Commit**

```bash
git add server/src/services/periodos.js
git commit -m "refactor: extraer aplicarPrestamosPendientes/aplicarDescuentosPendientes de generarRoles"
```

---

### Task 10: Endpoint `POST /api/roles/:id/sincronizar`

**Files:**
- Modify: `server/src/routes/roles.js`
- Create: `server/tests/sincronizar.test.js`

**Interfaces:**
- Consumes: `aplicarPrestamosPendientes`, `aplicarDescuentosPendientes` (Task 9), `puedeEditarLineas` de `../lib/periodo-fsm.js` (ya importado en el archivo).
- Produces: `POST /api/roles/:id/sincronizar` → `{ ...totales, agregadas: number }`.

- [ ] **Step 1: Escribir el test que falla**

```js
// server/tests/sincronizar.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'rrhh@bopelual.com', nombre: 'RRHH' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('POST /api/roles/:id/sincronizar', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('rrhh@bopelual.com','RRHH')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='RRHH'`);
  });

  it('agrega préstamos y descuentos creados después de generar el período, sin duplicar', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `Sync ${Date.now()}`, cedula: `SY${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });

    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sync test ${Date.now()}`, fecha_inicio: '2026-11-16', fecha_fin: '2026-11-30', quincena: 2
    });
    const det1 = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det1.body.roles_pago.find((r) => r.colaborador_id === col.id);

    // Se crean DESPUÉS de generar el período: no deberían estar en el rol todavía
    await auth(request(app).post('/api/prestamos')).send({
      colaborador_id: col.id, monto_total: 200, cuota_quincena: 50, fecha_inicio: '2026-11-01'
    });
    await auth(request(app).post('/api/descuentos')).send({
      colaborador_id: col.id, tipo_linea: 'ALIMENTACION', monto: 15, aplicar_en: 0
    });

    const antes = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(antes.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(false);
    expect(antes.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(false);

    const sync = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync.status).toBe(200);
    expect(sync.body.agregadas).toBe(2);

    const despues = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(despues.some((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toBe(true);
    expect(despues.some((l) => l.tipo_linea === 'ALIMENTACION')).toBe(true);

    // Sincronizar de nuevo no duplica
    const sync2 = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(sync2.body.agregadas).toBe(0);
    const final = (await auth(request(app).get(`/api/roles/${rol.id}`))).body.lineas;
    expect(final.filter((l) => l.tipo_linea === 'CUOTA_PRESTAMO')).toHaveLength(1);
  });

  it('rechaza sincronizar un período que no está en BORRADOR', async () => {
    const app = createApp();
    const col = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'IESS', nombre: `SyncCerrado ${Date.now()}`, cedula: `SC${Date.now() % 1e8}`
      })
    ).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `sync cerrado ${Date.now()}`, fecha_inicio: '2026-12-01', fecha_fin: '2026-12-15', quincena: 1
    });
    const det = await auth(request(app).get(`/api/periodos/${per.body.periodo.id}`));
    const rol = det.body.roles_pago.find((r) => r.colaborador_id === col.id);

    await auth(request(app).post(`/api/periodos/${per.body.periodo.id}/aprobar`));
    const res = await auth(request(app).post(`/api/roles/${rol.id}/sincronizar`));
    expect(res.status).toBe(409);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/sincronizar.test.js`
Expected: FAIL — `404` o `Cannot POST /api/roles/.../sincronizar` (ruta no existe).

- [ ] **Step 3: Agregar el endpoint en `roles.js`**

Al inicio de `server/src/routes/roles.js`, agregar el import:

```js
import { aplicarPrestamosPendientes, aplicarDescuentosPendientes } from '../services/periodos.js';
```

Al final del archivo, justo antes de `export default router;`, agregar:

```js
// Aplica al rol los préstamos/descuentos recurrentes creados DESPUÉS de
// haber generado el período, sin duplicar los que ya tenga. Solo mientras
// el período esté en BORRADOR (mismo criterio que editar líneas a mano).
router.post('/:id/sincronizar', requireRole(['ADMIN', 'RRHH']), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT rp.colaborador_id, p.estado, p.fecha_fin, p.quincena
       FROM roles_pago rp JOIN periodos p ON p.id=rp.periodo_id WHERE rp.id=$1 FOR UPDATE`,
      [req.params.id]
    );
    if (rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'rol no encontrado' });
    }
    if (!puedeEditarLineas(rows[0].estado)) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: `período ${rows[0].estado}: no editable` });
    }
    const agregadosPrestamos = await aplicarPrestamosPendientes(client, req.params.id, rows[0].colaborador_id, rows[0].fecha_fin);
    const agregadosDescuentos = await aplicarDescuentosPendientes(client, req.params.id, rows[0].colaborador_id, rows[0].quincena);
    const totales = await recalcularTotales(client, req.params.id);
    await client.query('COMMIT');
    res.json({ ...totales, agregadas: agregadosPrestamos + agregadosDescuentos });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: e.message });
  } finally {
    client.release();
  }
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/sincronizar.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/roles.js server/tests/sincronizar.test.js
git commit -m "feat: endpoint POST /roles/:id/sincronizar para aplicar préstamos/descuentos pendientes"
```

---

### Task 11: Botón "Sincronizar" en `RolPago.jsx`

**Files:**
- Modify: `client/src/pages/RolPago.jsx` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `useToast` (Task 1), endpoint de Task 10.

- [ ] **Step 1: Reescribir `RolPago.jsx` completo**

```jsx
// client/src/pages/RolPago.jsx
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { useToast } from '../components/Toast.jsx';
import { money } from '../utils.js';

const NUEVA = { tipo_linea: '', clase: 'INGRESO', monto: '', descripcion: '' };

export default function RolPago() {
  const { id } = useParams();
  const [rol, setRol] = useState(null);
  const [nueva, setNueva] = useState(NUEVA);
  const [error, setError] = useState(null);
  const toast = useToast();

  const cargar = () => api.get(`/roles/${id}`).then(setRol).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  const agregar = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/roles/${id}/lineas`, { ...nueva, monto: Number(nueva.monto) });
      setNueva(NUEVA);
      toast.success('Línea agregada.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const eliminar = async (lineaId) => {
    try {
      await api.del(`/roles/${id}/lineas/${lineaId}`);
      toast.success('Línea eliminada.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const sincronizar = async () => {
    try {
      const r = await api.post(`/roles/${id}/sincronizar`);
      if (r.agregadas > 0) toast.success(`Se agregaron ${r.agregadas} línea${r.agregadas !== 1 ? 's' : ''}.`);
      else toast.info('Ya estaba al día.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!rol) return <Card>{error || 'Cargando…'}</Card>;

  const editable = rol.periodo_estado === 'BORRADOR';
  const ingresos = rol.lineas.filter((l) => l.clase === 'INGRESO' && !l.es_provision);
  const descuentos = rol.lineas.filter((l) => l.clase === 'DESCUENTO');
  const provisiones = rol.lineas.filter((l) => l.es_provision);

  return (
    <div>
      <PageTitle
        accion={
          <div className="flex gap-2">
            {editable && (
              <RoleGate roles={['ADMIN', 'RRHH']}>
                <button onClick={sincronizar} className="btn btn-secondary">
                  <RefreshCw size={15} /> Sincronizar descuentos y préstamos
                </button>
              </RoleGate>
            )}
            <button onClick={() => window.print()} className="btn btn-secondary">
              Imprimir
            </button>
          </div>
        }
      >
        Comprobante — {rol.colaborador_nombre}
      </PageTitle>

      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <Card className="mb-4 text-sm text-slate-600">
        <div>Período: {rol.periodo_nombre} <Badge estado={rol.periodo_estado} /></div>
        <div>Cédula/RUC: {rol.cedula || '—'} · Cargo: {rol.cargo || '—'}</div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-display font-bold mb-2 text-emerald-600">Ingresos</h3>
          {ingresos.map((l) => (
            <Linea key={l.id} l={l} editable={editable} onDel={eliminar} />
          ))}
        </Card>
        <Card>
          <h3 className="font-display font-bold mb-2 text-red-600">Descuentos</h3>
          {descuentos.map((l) => (
            <Linea key={l.id} l={l} editable={editable} onDel={eliminar} />
          ))}
        </Card>
      </div>

      {provisiones.length > 0 && (
        <Card className="mt-4">
          <h3 className="font-display font-bold mb-2 text-slate-500">Provisiones (no afectan el neto)</h3>
          {provisiones.map((l) => (
            <Linea key={l.id} l={l} editable={editable} onDel={eliminar} />
          ))}
        </Card>
      )}

      <Card className="mt-4 flex justify-between text-lg font-display font-bold">
        <span>Neto a pagar</span>
        <span className="text-gold-600 font-medium">{money(rol.neto)}</span>
      </Card>

      {editable && (
        <RoleGate roles={['ADMIN', 'RRHH']}>
          <Card className="mt-4">
            <h3 className="font-display font-bold mb-2">Agregar línea</h3>
            <form onSubmit={agregar} className="grid md:grid-cols-4 gap-2">
              <input required placeholder="Tipo (ej: BONO_DESEMPENO)" value={nueva.tipo_linea}
                onChange={(e) => setNueva({ ...nueva, tipo_linea: e.target.value })}
                className="input w-full" />
              <select value={nueva.clase} onChange={(e) => setNueva({ ...nueva, clase: e.target.value })}
                className="input w-full">
                <option value="INGRESO">Ingreso</option>
                <option value="DESCUENTO">Descuento</option>
              </select>
              <input required type="number" step="0.01" placeholder="Monto" value={nueva.monto}
                onChange={(e) => setNueva({ ...nueva, monto: e.target.value })}
                className="input w-full" />
              <button className="btn btn-primary">Agregar</button>
            </form>
          </Card>
        </RoleGate>
      )}
    </div>
  );
}

function Linea({ l, editable, onDel }) {
  return (
    <div className="flex justify-between items-center py-1 text-sm border-b border-slate-200 last:border-0">
      <span>
        {l.tipo_linea}
        {l.descripcion ? <span className="text-slate-500"> · {l.descripcion}</span> : null}
      </span>
      <span className="flex items-center gap-3">
        {money(l.monto)}
        {editable && (
          <button onClick={() => onDel(l.id)} className="text-red-400 text-xs">✕</button>
        )}
      </span>
    </div>
  );
}
```

Nota: la compuerta inicial `if (!rol) return <Card>{error || 'Cargando…'}</Card>;` y su `error` local se **conservan** (es una carga bloqueante, no una acción) — solo `agregar`, `eliminar` y `sincronizar` pasan a usar toast.

- [ ] **Step 2: Verificar manualmente**

Run: levantar server + client, ir a un período en BORRADOR → un rol de un colaborador, crear un préstamo o descuento nuevo desde otra pestaña, volver y hacer clic en "Sincronizar descuentos y préstamos".
Expected: aparece un toast con el número de líneas agregadas; al volver a hacer clic, toast informativo "Ya estaba al día."

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/RolPago.jsx
git commit -m "feat: botón para sincronizar descuentos y préstamos pendientes en un rol BORRADOR"
```

---

## Phase 4 — Retención por empresa + pestaña Facturas en la ficha

### Task 12: Endpoint `GET/PATCH /api/empresas`

**Files:**
- Create: `server/src/routes/empresas.js`
- Create: `server/tests/empresas.test.js`
- Modify: `server/src/index.js` (registrar el router)

**Interfaces:**
- Produces: `GET /api/empresas` (ADMIN/RRHH) → lista `config_empresas`; `PATCH /api/empresas/:empresa` (ADMIN) → upsert `{ aplica_retencion }`.

- [ ] **Step 1: Escribir el test que falla**

```js
// server/tests/empresas.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

vi.mock('../src/auth/google.js', () => ({
  verifyGoogleToken: vi.fn(async () => ({ email: 'admin@bopelual.com', nombre: 'Admin' }))
}));
const { createApp } = await import('../src/index.js');
const pool = (await import('../src/db/pool.js')).default;
const auth = (r) => r.set('Authorization', 'Bearer x');

describe('config_empresas', () => {
  beforeEach(async () => {
    await pool.query(`INSERT INTO usuarios (email, rol) VALUES ('admin@bopelual.com','ADMIN')
      ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`);
  });

  it('viene sembrado: BOPELUAL retiene, CARROS-YA no', async () => {
    const app = createApp();
    const res = await auth(request(app).get('/api/empresas'));
    const bop = res.body.find((e) => e.empresa === 'BOPELUAL S.A.');
    const cya = res.body.find((e) => e.empresa === 'CARROS-YA S.A.');
    expect(bop.aplica_retencion).toBe(true);
    expect(cya.aplica_retencion).toBe(false);
  });

  it('ADMIN puede activar la retención de una empresa', async () => {
    const app = createApp();
    const upd = await auth(
      request(app).patch(`/api/empresas/${encodeURIComponent('CARROS-YA S.A.')}`)
    ).send({ aplica_retencion: true });
    expect(upd.body.aplica_retencion).toBe(true);
    await auth(
      request(app).patch(`/api/empresas/${encodeURIComponent('CARROS-YA S.A.')}`)
    ).send({ aplica_retencion: false }); // restaurar
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/empresas.test.js`
Expected: FAIL — `404` (ruta no existe todavía).

- [ ] **Step 3: Crear la ruta**

```js
// server/src/routes/empresas.js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';

const router = Router();
router.use(requireAuth);

router.get('/', requireRole(['ADMIN', 'RRHH']), async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM config_empresas ORDER BY empresa');
  res.json(rows);
});

router.patch('/:empresa', requireRole(['ADMIN']), async (req, res) => {
  const { rows } = await pool.query(
    `INSERT INTO config_empresas (empresa, aplica_retencion) VALUES ($1,$2)
     ON CONFLICT (empresa) DO UPDATE SET aplica_retencion=$2 RETURNING *`,
    [req.params.empresa, !!req.body.aplica_retencion]
  );
  res.json(rows[0]);
});

export default router;
```

Registrar en `server/src/index.js`: agregar el import junto a los demás (después de `bancosRouter`):

```js
import empresasRouter from './routes/empresas.js';
```

Y la ruta, junto a `app.use('/api/bancos', bancosRouter);`:

```js
  app.use('/api/empresas', empresasRouter);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/empresas.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/empresas.js server/tests/empresas.test.js server/src/index.js
git commit -m "feat: endpoint config_empresas para el toggle de retención por empresa"
```

---

### Task 13: `facturas.js` — retención según la empresa del proveedor + filtro por colaborador

**Files:**
- Modify: `server/src/routes/facturas.js`
- Modify: `server/tests/facturas.test.js`

**Interfaces:**
- Consumes: tabla `config_empresas` (Task 8/12), columna `facturas_proveedor.empresa` (Task 8), `round2` de `../lib/round.js`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `server/tests/facturas.test.js`, dentro del `describe('facturas', ...)`:

```js
  it('CARROS-YA no retiene por defecto (config_empresas.aplica_retencion=false)', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Proveedor CarrosYa', cedula: `CY${Date.now()}`
      })
    ).body;
    await auth(request(app).patch(`/api/colaboradores/${prov.id}`)).send({ empresa: 'CARROS-YA S.A.' });
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, numero_factura: '001', fecha_factura: '2026-07-10', monto_bruto: 1000
    });
    expect(f.status).toBe(201);
    expect(Number(f.body.retencion_10pct)).toBe(0);
    expect(Number(f.body.neto)).toBe(1000);
    expect(f.body.empresa).toBe('CARROS-YA S.A.');
  });

  it('BOPELUAL sigue reteniendo el 10%', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Proveedor Bopelual', cedula: `BP${Date.now()}`
      })
    ).body;
    await auth(request(app).patch(`/api/colaboradores/${prov.id}`)).send({ empresa: 'BOPELUAL S.A.' });
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, numero_factura: '002', fecha_factura: '2026-07-10', monto_bruto: 1000
    });
    expect(Number(f.body.retencion_10pct)).toBe(100);
    expect(f.body.empresa).toBe('BOPELUAL S.A.');
  });

  it('sin empresa asignada, aplica retención por defecto (comportamiento seguro)', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Proveedor Sin Empresa', cedula: `SE${Date.now()}`
      })
    ).body;
    const f = await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, numero_factura: '003', fecha_factura: '2026-07-10', monto_bruto: 1000
    });
    expect(Number(f.body.retencion_10pct)).toBe(100);
  });

  it('filtra por colaborador_id', async () => {
    const app = createApp();
    const prov = (
      await auth(request(app).post('/api/colaboradores')).send({
        tipo: 'EXTERNO', nombre: 'Filtro Prov', cedula: `FP${Date.now()}`
      })
    ).body;
    await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, fecha_factura: '2026-07-10', monto_bruto: 100
    });
    const res = await auth(request(app).get(`/api/facturas?colaborador_id=${prov.id}`));
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body.every((f) => f.colaborador_id === prov.id)).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/facturas.test.js`
Expected: FAIL — `retencion_10pct` sigue siendo 100 para CARROS-YA (aún no hay lógica de empresa), `empresa` es `undefined`, filtro por `colaborador_id` no soportado.

- [ ] **Step 3: Modificar `facturas.js`**

Reemplazar el archivo completo:

```js
// server/src/routes/facturas.js
import { Router } from 'express';
import pool from '../db/pool.js';
import { requireAuth, requireRole } from '../auth/middleware.js';
import { retencionProveedor } from '../lib/calculo.js';
import { round2 } from '../lib/round.js';

const router = Router();
router.use(requireAuth, requireRole(['ADMIN', 'RRHH']));

router.get('/', async (req, res) => {
  const cond = [];
  const params = [];
  if (req.query.estado) {
    params.push(req.query.estado);
    cond.push(`f.estado=$${params.length}`);
  }
  if (req.query.periodo_id) {
    params.push(req.query.periodo_id);
    cond.push(`f.periodo_id=$${params.length}`);
  }
  if (req.query.colaborador_id) {
    params.push(req.query.colaborador_id);
    cond.push(`f.colaborador_id=$${params.length}`);
  }
  const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT f.*, c.nombre AS colaborador_nombre FROM facturas_proveedor f
     JOIN colaboradores c ON c.id=f.colaborador_id ${where} ORDER BY f.fecha_factura DESC`,
    params
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { colaborador_id, periodo_id, numero_factura, fecha_factura, monto_bruto } = req.body;
  if (!colaborador_id || monto_bruto == null) return res.status(400).json({ error: 'campos requeridos' });

  const { rows: colRows } = await pool.query('SELECT empresa FROM colaboradores WHERE id=$1', [colaborador_id]);
  if (colRows.length === 0) return res.status(400).json({ error: 'colaborador no existe' });
  const empresa = colRows[0].empresa;

  // La retención se calcula SIEMPRE en el servidor. Por defecto se aplica;
  // solo se omite si la empresa del proveedor tiene aplica_retencion=false.
  let aplicaRetencion = true;
  if (empresa) {
    const { rows: cfg } = await pool.query('SELECT aplica_retencion FROM config_empresas WHERE empresa=$1', [empresa]);
    if (cfg.length > 0) aplicaRetencion = cfg[0].aplica_retencion;
  }
  const { retencion, neto } = aplicaRetencion
    ? retencionProveedor(Number(monto_bruto))
    : { retencion: 0, neto: round2(Number(monto_bruto)) };

  const { rows } = await pool.query(
    `INSERT INTO facturas_proveedor
      (colaborador_id, periodo_id, numero_factura, fecha_factura, monto_bruto, retencion_10pct, neto, empresa)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [colaborador_id, periodo_id ?? null, numero_factura, fecha_factura, monto_bruto, retencion, neto, empresa]
  );
  res.status(201).json(rows[0]);
});

router.patch('/:id', async (req, res) => {
  const { estado } = req.body;
  const pagada = estado === 'PAGADA';
  const { rows } = await pool.query(
    `UPDATE facturas_proveedor SET estado=COALESCE($1, estado),
       pagada_en=CASE WHEN $2 THEN now() ELSE pagada_en END WHERE id=$3 RETURNING *`,
    [estado ?? null, pagada, req.params.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'no encontrada' });
  res.json(rows[0]);
});

export default router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/facturas.test.js`
Expected: PASS (6 tests — los 2 existentes + los 4 nuevos)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/facturas.js server/tests/facturas.test.js
git commit -m "feat: retención de facturas configurable por empresa + filtro por colaborador"
```

---

### Task 14: `Proveedores.jsx` — exportar `FormFactura`/`TablaFacturas` reutilizables

**Files:**
- Modify: `client/src/pages/Proveedores.jsx` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `useToast` (Task 1).
- Produces: `FormFactura({ colaboradorId, proveedores, onCreado })`, `TablaFacturas({ facturas, onCambio, conProveedor, conEmpresa })` — exports nombrados, reutilizados en Task 15.

- [ ] **Step 1: Reescribir `Proveedores.jsx` completo**

```jsx
// client/src/pages/Proveedores.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { numero_factura: '', fecha_factura: '', monto_bruto: '' };

// Formulario reutilizado aquí y en la pestaña "Facturas" de la ficha del proveedor.
export function FormFactura({ colaboradorId, proveedores, onCreado }) {
  const [form, setForm] = useState({ ...VACIO, colaborador_id: colaboradorId || '' });
  const toast = useToast();

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/facturas', {
        ...form,
        colaborador_id: colaboradorId || form.colaborador_id,
        monto_bruto: Number(form.monto_bruto),
      });
      setForm({ ...VACIO, colaborador_id: colaboradorId || '' });
      toast.success('Factura registrada.');
      onCreado();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
      {!colaboradorId && (
        <select required value={form.colaborador_id}
          onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
          className="input w-full">
          <option value="">Proveedor…</option>
          {(proveedores || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      )}
      <input placeholder="N° factura" value={form.numero_factura}
        onChange={(e) => setForm({ ...form, numero_factura: e.target.value })}
        className="input w-full" />
      <input required type="date" value={form.fecha_factura}
        onChange={(e) => setForm({ ...form, fecha_factura: e.target.value })}
        className="input w-full" />
      <input required type="number" step="0.01" min="0.01" placeholder="Monto bruto" value={form.monto_bruto}
        onChange={(e) => setForm({ ...form, monto_bruto: e.target.value })}
        className="input w-full" />
      <button className={`btn btn-primary ${colaboradorId ? '' : 'md:col-span-4'}`}>
        Registrar factura (retención automática según la empresa)
      </button>
    </form>
  );
}

export function TablaFacturas({ facturas, onCambio, conProveedor = true, conEmpresa = true }) {
  const toast = useToast();

  const marcarPagada = async (id) => {
    try {
      await api.patch(`/facturas/${id}`, { estado: 'PAGADA' });
      toast.success('Factura marcada como pagada.');
      onCambio();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <table className="w-full text-sm">
      <thead className="text-slate-500 text-left">
        <tr className="border-b border-slate-200">
          {conProveedor && <th className="p-3">Proveedor</th>}
          {conEmpresa && <th className="p-3">Empresa</th>}
          <th className="p-3">Factura</th>
          <th className="p-3 text-right">Bruto</th>
          <th className="p-3 text-right">Retención</th>
          <th className="p-3 text-right">Neto</th>
          <th className="p-3">Estado</th>
          <th className="p-3"></th>
        </tr>
      </thead>
      <tbody>
        {facturas.map((f) => (
          <tr key={f.id} className="border-b border-slate-200 hover:bg-slate-50">
            {conProveedor && (
              <td className="p-3">
                <Link to={`/colaboradores/${f.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                  {f.colaborador_nombre}
                </Link>
              </td>
            )}
            {conEmpresa && <td className="p-3">{f.empresa || '—'}</td>}
            <td className="p-3">{f.numero_factura || '—'} · {fecha(f.fecha_factura)}</td>
            <td className="p-3 text-right">{money(f.monto_bruto)}</td>
            <td className="p-3 text-right">{money(f.retencion_10pct)}</td>
            <td className="p-3 text-right font-semibold">{money(f.neto)}</td>
            <td className="p-3"><Badge estado={f.estado} /></td>
            <td className="p-3">
              {f.estado === 'PENDIENTE' && (
                <button onClick={() => marcarPagada(f.id)} className="text-emerald-600 text-xs hover:underline">
                  Marcar pagada
                </button>
              )}
            </td>
          </tr>
        ))}
        {facturas.length === 0 && (
          <tr><td colSpan={(conProveedor ? 1 : 0) + (conEmpresa ? 1 : 0) + 6} className="p-4 text-slate-500">Sin facturas registradas.</td></tr>
        )}
      </tbody>
    </table>
  );
}

export default function Proveedores() {
  const [facturas, setFacturas] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const toast = useToast();

  const cargar = () => api.get('/facturas').then(setFacturas).catch((e) => toast.error(e.message));
  useEffect(() => {
    cargar();
    api.get('/colaboradores?tipo=EXTERNO&per_page=all').then((r) => setProveedores(r.data)).catch(() => {});
  }, []);

  return (
    <div className="animate-fade-in">
      <PageTitle>Proveedores / Facturas</PageTitle>

      <Card className="mb-4">
        <FormFactura proveedores={proveedores} onCreado={cargar} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <TablaFacturas facturas={facturas} onCambio={cargar} />
      </Card>
    </div>
  );
}
```

Nota: se agrega `&per_page=all` al fetch de proveedores (antes solo traía los primeros 25).

- [ ] **Step 2: Verificar manualmente**

Run: build + navegar a `/proveedores`, registrar una factura, marcarla pagada.
Expected: funciona igual que antes, ahora con toasts en vez de banner, y columna "Empresa" visible.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Proveedores.jsx
git commit -m "refactor: exportar FormFactura/TablaFacturas reutilizables desde Proveedores.jsx"
```

---

### Task 15: Pestaña "Facturas" en `ColaboradorDetalle.jsx`

**Files:**
- Modify: `client/src/pages/ColaboradorDetalle.jsx`

**Interfaces:**
- Consumes: `FormFactura`, `TablaFacturas` (Task 14), `useToast` (Task 1).

- [ ] **Step 1: Agregar el import y convertir `TABS` en función del tipo**

Al inicio del archivo, agregar el import junto a los demás:

```jsx
import { FormFactura, TablaFacturas } from './Proveedores.jsx';
```

(`useToast` ya se importó en la Task 5 de este mismo archivo.)

Reemplazar:

```jsx
const TABS = ['Ficha', 'Contratos', 'Descuentos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];
```
por:
```jsx
const TABS_BASE = ['Ficha', 'Contratos', 'Descuentos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];
```

- [ ] **Step 2: Agregar el componente `FacturasTab`**

Agregar después de `EvaluacionesTab` y antes de `RolesTab`:

```jsx
function FacturasTab({ col }) {
  const [facturas, setFacturas] = useState([]);
  const toast = useToast();
  const cargar = () => api.get(`/facturas?colaborador_id=${col.id}`).then(setFacturas).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, [col.id]);
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nueva factura</h2>
        <FormFactura colaboradorId={col.id} onCreado={cargar} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <TablaFacturas facturas={facturas} onCambio={cargar} conProveedor={false} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Calcular las pestañas visibles y renderizar la nueva**

Dentro de `ColaboradorDetalle`, después de `if (!col) return ...;`, agregar:

```jsx
  const tabs = col.tipo === 'EXTERNO'
    ? [...TABS_BASE.slice(0, -1), 'Facturas', 'Roles de pago']
    : TABS_BASE;
```

Reemplazar `{TABS.map((t) => (` por `{tabs.map((t) => (` en el bloque de botones de pestañas.

Agregar después de la línea `{tab === 'Evaluaciones' && <EvaluacionesTab col={col} onError={setError} />}`:

```jsx
      {tab === 'Facturas' && <FacturasTab col={col} />}
```

- [ ] **Step 4: Verificar manualmente**

Run: build + entrar a la ficha de un colaborador EXTERNO.
Expected: aparece la pestaña "Facturas" (antes de "Roles de pago"), permite registrar y listar facturas de ese proveedor. Un colaborador IESS no muestra esa pestaña.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/ColaboradorDetalle.jsx
git commit -m "feat: pestaña Facturas en la ficha de proveedores (colaboradores EXTERNO)"
```

---

## Phase 5 — Dashboard: KPIs de Talento Humano

### Task 16: Endpoint `GET /api/reportes/documentos-faltantes`

**Files:**
- Modify: `server/src/routes/reportes.js`
- Modify: `server/tests/reportes.test.js`

**Interfaces:**
- Produces: `GET /api/reportes/documentos-faltantes` → `[{ id, nombre, tipo, empresa }]` (colaboradores activos sin ningún documento).

- [ ] **Step 1: Escribir el test que falla**

Agregar a `server/tests/reportes.test.js`, dentro de `describe('reportes', ...)`:

```js
  it('documentos-faltantes lista colaboradores activos sin documentos', async () => {
    const app = createApp();
    const sinDoc = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `SinDoc ${Date.now()}`, cedula: `SD${Date.now() % 1e8}`
    })).body;
    const res = await auth(request(app).get('/api/reportes/documentos-faltantes'));
    expect(res.status).toBe(200);
    expect(res.body.some((c) => c.id === sinDoc.id)).toBe(true);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run tests/reportes.test.js -t "documentos-faltantes"`
Expected: FAIL — 404.

- [ ] **Step 3: Agregar el endpoint**

En `server/src/routes/reportes.js`, agregar antes de `export default router;`:

```js
router.get('/documentos-faltantes', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.id, c.nombre, c.tipo, c.empresa
     FROM colaboradores c
     WHERE c.activo=true
       AND NOT EXISTS (SELECT 1 FROM documentos d WHERE d.colaborador_id=c.id)
     ORDER BY c.nombre`
  );
  res.json(rows);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run tests/reportes.test.js`
Expected: PASS (4 tests — los 3 existentes + el nuevo)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/reportes.js server/tests/reportes.test.js
git commit -m "feat: endpoint documentos-faltantes para el KPI de expedientes incompletos"
```

---

### Task 17: 4 KPIs de RRHH en `Dashboard.jsx`

**Files:**
- Modify: `client/src/pages/Dashboard.jsx` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `useToast` (Task 1), `GET /prestamos?activo=true&per_page=1` (ya existente, campo `resumen`), `GET /descuentos?activo=true` (ya existente), `GET /reportes/documentos-faltantes` (Task 16).

- [ ] **Step 1: Reescribir `Dashboard.jsx` completo**

```jsx
// client/src/pages/Dashboard.jsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
import { money } from '../utils.js';
import { FormAusencia, TablaAusencias } from './Ausencias.jsx';

// Portal del colaborador: sus roles de pago, saldo de vacaciones y solicitudes.
function PortalColaborador({ usuario }) {
  const [col, setCol] = useState(null);
  const [saldo, setSaldo] = useState(null);
  const [ausencias, setAusencias] = useState([]);
  const [error, setError] = useState(null);

  const cargar = () => {
    api.get(`/colaboradores/${usuario.colaborador_id}`).then(setCol).catch((e) => setError(e.message));
    api.get(`/ausencias/saldo/${usuario.colaborador_id}`).then(setSaldo).catch(() => {});
    api.get('/ausencias').then(setAusencias).catch(() => {});
  };
  useEffect(() => { cargar(); }, [usuario.colaborador_id]);

  if (!usuario.colaborador_id) {
    return (
      <Card>
        <p className="text-slate-600">Hola, {usuario.email}.</p>
        <p className="text-sm text-slate-500 mt-1">
          Tu usuario aún no está vinculado a un colaborador — pide a RRHH que lo vincule para ver tus roles de pago y vacaciones.
        </p>
      </Card>
    );
  }
  if (!col) return <Card>{error || 'Cargando…'}</Card>;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Último pago" valor={col.roles_pago[0] ? money(col.roles_pago[0].neto) : '—'} sub={col.roles_pago[0]?.periodo_nombre} />
        <KpiCard titulo="Vacaciones: derecho" valor={saldo ? `${saldo.derecho} días` : '—'} />
        <KpiCard titulo="Vacaciones: tomadas" valor={saldo ? `${saldo.tomados} días` : '—'} />
        <KpiCard titulo="Saldo disponible" valor={saldo ? `${saldo.saldo} días` : '—'} />
      </div>

      {error && <Card className="text-red-600">{error}</Card>}

      <Card>
        <h2 className="font-semibold mb-3">Solicitar vacaciones o permiso</h2>
        <FormAusencia onCreado={() => { setError(null); cargar(); }} onError={setError} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <h2 className="font-semibold p-4 pb-0">Mis solicitudes</h2>
        <TablaAusencias ausencias={ausencias} onCambio={cargar} onError={setError} conColaborador={false} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <h2 className="font-semibold p-4 pb-0">Mis roles de pago</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Período</th><th className="p-3 text-right">Neto</th><th className="p-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {col.roles_pago.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3">
                  <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">{r.periodo_nombre}</Link>
                </td>
                <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
                <td className="p-3"><Badge estado={r.estado_pago} /></td>
              </tr>
            ))}
            {col.roles_pago.length === 0 && <tr><td colSpan={3} className="p-4 text-slate-500">Aún no tienes roles de pago.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [prestamosResumen, setPrestamosResumen] = useState({});
  const [descuentosActivos, setDescuentosActivos] = useState([]);
  const [sinDocumentos, setSinDocumentos] = useState([]);
  const toast = useToast();

  const esGestor = ['ADMIN', 'RRHH', 'GERENCIA'].includes(usuario.rol);

  useEffect(() => {
    if (!esGestor) return;
    Promise.all([
      api.get('/periodos'),
      api.get('/colaboradores?activo=true&per_page=all'),
      api.get('/ausencias?estado=SOLICITADA'),
      api.get('/prestamos?activo=true&per_page=1'),
      api.get('/descuentos?activo=true'),
      api.get('/reportes/documentos-faltantes'),
    ])
      .then(([p, c, a, pr, d, doc]) => {
        setPeriodos(p);
        setColaboradores(c.data || c);
        setPendientes(a);
        setPrestamosResumen(pr.resumen || {});
        setDescuentosActivos(d);
        setSinDocumentos(doc);
      })
      .catch((e) => toast.error(e.message));
  }, [esGestor]);

  if (!esGestor) {
    return (
      <div className="animate-fade-in">
        <PageTitle>Mi portal</PageTitle>
        <PortalColaborador usuario={usuario} />
      </div>
    );
  }

  const ultimo = periodos[0];
  const enBorrador = periodos.filter((p) => p.estado === 'BORRADOR').length;

  const mesActual = new Date().getMonth();
  const aniversarios = colaboradores.filter(
    (c) => c.fecha_ingreso && new Date(c.fecha_ingreso).getUTCMonth() === mesActual
  );

  const porEmpresa = colaboradores.reduce((acc, c) => {
    const k = c.empresa || 'Sin empresa';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const porDepartamento = colaboradores.reduce((acc, c) => {
    const k = c.departamento || 'Sin depto.';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const descuentosMonto = descuentosActivos.reduce((s, d) => s + Number(d.monto), 0);

  return (
    <div className="animate-fade-in">
      <PageTitle>Dashboard</PageTitle>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Último período" valor={ultimo ? money(ultimo.total_neto) : '—'} sub={ultimo?.nombre} />
        <KpiCard titulo="Colaboradores activos" valor={colaboradores.length} />
        <KpiCard titulo="Períodos registrados" valor={periodos.length} />
        <KpiCard titulo="En borrador" valor={enBorrador} />
      </div>

      {pendientes.length > 0 && (
        <Card className="mt-4 border-gold-400/60">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-semibold">{pendientes.length}</span> solicitud{pendientes.length !== 1 && 'es'} de ausencia pendiente{pendientes.length !== 1 && 's'} de aprobación.
            </p>
            <Link to="/ausencias" className="btn btn-primary">Revisar</Link>
          </div>
        </Card>
      )}

      <h2 className="font-display font-bold text-slate-900 mt-6 mb-3">Talento Humano</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Aniversarios este mes" valor={aniversarios.length}
          sub={aniversarios.slice(0, 3).map((c) => c.nombre.split(' ')[0]).join(', ') || 'Ninguno'} />
        <KpiCard titulo="Préstamos y descuentos activos" valor={(prestamosResumen.activos ?? 0) + descuentosActivos.length}
          sub={`${money((Number(prestamosResumen.cuota_activa) || 0) + descuentosMonto)} / quincena`} />
        <KpiCard titulo="Documentos faltantes" valor={sinDocumentos.length}
          sub={sinDocumentos.length > 0
            ? sinDocumentos.slice(0, 2).map((c) => c.nombre.split(' ')[0]).join(', ') + (sinDocumentos.length > 2 ? ` y ${sinDocumentos.length - 2} más` : '')
            : 'Todos al día'} />
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Por empresa</p>
          {Object.entries(porEmpresa).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-0.5">
              <span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span>
            </div>
          ))}
        </Card>
      </div>
      <Card className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Distribución por departamento</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(porDepartamento).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente**

Run: build + login como ADMIN/RRHH, ir al Dashboard.
Expected: se ven 4 KPIs de nómina + banner de pendientes (si hay) + sección "Talento Humano" con 4 tarjetas (aniversarios, préstamos+descuentos, documentos faltantes, por empresa) + distribución por departamento.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Dashboard.jsx
git commit -m "feat: agregar KPIs de Talento Humano al Dashboard"
```

---

## Phase 6 — Reportes más detallados

### Task 18: 3 endpoints nuevos + `costo-departamento` con `periodo_id`

**Files:**
- Modify: `server/src/routes/reportes.js`
- Modify: `server/tests/reportes.test.js`

**Interfaces:**
- Produces: `GET/`.csv` de `/evolucion-mensual`, `/retenciones-proveedor`, `/provisiones?anio=`; `/costo-departamento` acepta `?periodo_id=`.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar a `server/tests/reportes.test.js`:

```js
  it('evolución mensual agrega ingresos/descuentos/neto por período', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Evol ${Date.now()}`, cedula: `EV${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    await auth(request(app).post('/api/periodos')).send({
      nombre: `evol test ${Date.now()}`, fecha_inicio: '2027-01-16', fecha_fin: '2027-01-31', quincena: 2
    });
    const res = await auth(request(app).get('/api/reportes/evolucion-mensual'));
    expect(res.status).toBe(200);
    const fila = res.body.find((r) => r.nombre.includes('evol test'));
    expect(Number(fila.neto)).toBeGreaterThan(0);
  });

  it('retenciones por proveedor agrupa por mes', async () => {
    const app = createApp();
    const prov = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'EXTERNO', nombre: `RetProv ${Date.now()}`, cedula: `RP${Date.now() % 1e8}`
    })).body;
    await auth(request(app).post('/api/facturas')).send({
      colaborador_id: prov.id, fecha_factura: '2026-07-05', monto_bruto: 1000
    });
    const res = await auth(request(app).get('/api/reportes/retenciones-proveedor'));
    const fila = res.body.find((r) => r.proveedor.includes('RetProv'));
    expect(Number(fila.total_retencion)).toBe(100);
  });

  it('provisiones filtra por año', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `Provis ${Date.now()}`, cedula: `PV2${Date.now() % 1e8}`
    })).body;
    await pool.query(
      `INSERT INTO provisiones (colaborador_id, anio, decimo_tercero) VALUES ($1, 2099, 50)`,
      [col.id]
    );
    const res = await auth(request(app).get('/api/reportes/provisiones?anio=2099'));
    expect(res.body.some((r) => r.colaborador.includes('Provis') && Number(r.decimo_tercero) === 50)).toBe(true);
  });

  it('costo por departamento con periodo_id devuelve montos reales del período', async () => {
    const app = createApp();
    const col = (await auth(request(app).post('/api/colaboradores')).send({
      tipo: 'IESS', nombre: `CostoDept ${Date.now()}`, cedula: `CD${Date.now() % 1e8}`, departamento: 'PRUEBAS'
    })).body;
    await auth(request(app).post(`/api/colaboradores/${col.id}/contratos`)).send({
      sueldo_base: 1000, fecha_inicio: '2026-01-01'
    });
    const per = await auth(request(app).post('/api/periodos')).send({
      nombre: `costo dept ${Date.now()}`, fecha_inicio: '2027-02-16', fecha_fin: '2027-02-28', quincena: 2
    });
    const res = await auth(request(app).get(`/api/reportes/costo-departamento?periodo_id=${per.body.periodo.id}`));
    const fila = res.body.find((r) => r.departamento === 'PRUEBAS');
    expect(Number(fila.neto)).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/reportes.test.js`
Expected: FAIL — las 4 rutas nuevas devuelven 404 o el filtro `periodo_id` no cambia la respuesta.

- [ ] **Step 3: Reemplazar `costo-departamento` y agregar los 3 endpoints nuevos**

En `server/src/routes/reportes.js`, reemplazar el endpoint existente:

```js
router.get('/costo-departamento', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT c.departamento, ct.sueldo_base
     FROM colaboradores c JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
     WHERE c.activo=true AND c.tipo='IESS'`
  );
  const mapa = {};
  for (const r of rows) {
    const dep = r.departamento || 'Sin depto';
    mapa[dep] ??= { departamento: dep, total_sueldos: 0, aporte_patronal: 0 };
    mapa[dep].total_sueldos += Number(r.sueldo_base);
    mapa[dep].aporte_patronal += iessPatronal(Number(r.sueldo_base));
  }
  res.json(Object.values(mapa));
});
```
por:
```js
router.get('/costo-departamento', async (req, res) => {
  const { periodo_id } = req.query;
  if (!periodo_id) {
    // Proyección actual: sueldo + aporte patronal de contratos vigentes (sin cambios).
    const { rows } = await pool.query(
      `SELECT c.departamento, ct.sueldo_base
       FROM colaboradores c JOIN contratos ct ON ct.colaborador_id=c.id AND ct.fecha_fin IS NULL
       WHERE c.activo=true AND c.tipo='IESS'`
    );
    const mapa = {};
    for (const r of rows) {
      const dep = r.departamento || 'Sin depto';
      mapa[dep] ??= { departamento: dep, total_sueldos: 0, aporte_patronal: 0 };
      mapa[dep].total_sueldos += Number(r.sueldo_base);
      mapa[dep].aporte_patronal += iessPatronal(Number(r.sueldo_base));
    }
    return res.json(Object.values(mapa));
  }
  // Costo real de un período específico: ingresos/descuentos/neto agregados por departamento.
  const { rows } = await pool.query(
    `SELECT COALESCE(c.departamento,'Sin depto') AS departamento,
            COALESCE(SUM(rp.total_ingresos),0) AS total_ingresos,
            COALESCE(SUM(rp.total_descuentos),0) AS total_descuentos,
            COALESCE(SUM(rp.neto),0) AS neto
     FROM roles_pago rp JOIN colaboradores c ON c.id=rp.colaborador_id
     WHERE rp.periodo_id=$1
     GROUP BY departamento ORDER BY departamento`,
    [periodo_id]
  );
  res.json(rows);
});

async function evolucionMensual() {
  const { rows } = await pool.query(
    `SELECT p.nombre, p.fecha_inicio,
            COALESCE(SUM(rp.total_ingresos),0) AS total_ingresos,
            COALESCE(SUM(rp.total_descuentos),0) AS total_descuentos,
            COALESCE(SUM(rp.neto),0) AS neto
     FROM periodos p LEFT JOIN roles_pago rp ON rp.periodo_id=p.id
     GROUP BY p.id ORDER BY p.fecha_inicio`
  );
  return rows;
}
router.get('/evolucion-mensual', async (_req, res) => res.json(await evolucionMensual()));
router.get('/evolucion-mensual.csv', async (_req, res) => {
  const csv = aCsv(await evolucionMensual(), ['nombre', 'fecha_inicio', 'total_ingresos', 'total_descuentos', 'neto']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="evolucion-mensual.csv"');
  res.send(csv);
});

async function retencionesProveedor() {
  const { rows } = await pool.query(
    `SELECT c.nombre AS proveedor, date_trunc('month', f.fecha_factura)::date AS mes,
            COALESCE(SUM(f.monto_bruto),0) AS total_bruto,
            COALESCE(SUM(f.retencion_10pct),0) AS total_retencion,
            COALESCE(SUM(f.neto),0) AS total_neto
     FROM facturas_proveedor f JOIN colaboradores c ON c.id=f.colaborador_id
     GROUP BY c.nombre, mes ORDER BY mes DESC, c.nombre`
  );
  return rows;
}
router.get('/retenciones-proveedor', async (_req, res) => res.json(await retencionesProveedor()));
router.get('/retenciones-proveedor.csv', async (_req, res) => {
  const csv = aCsv(await retencionesProveedor(), ['proveedor', 'mes', 'total_bruto', 'total_retencion', 'total_neto']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="retenciones-proveedor.csv"');
  res.send(csv);
});

async function provisionesPorAnio(anio) {
  const { rows } = await pool.query(
    `SELECT c.nombre AS colaborador, pr.anio, pr.decimo_tercero, pr.decimo_cuarto, pr.fondos_reserva, pr.utilidades
     FROM provisiones pr JOIN colaboradores c ON c.id=pr.colaborador_id
     WHERE pr.anio=$1 ORDER BY c.nombre`,
    [anio]
  );
  return rows;
}
router.get('/provisiones', async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  res.json(await provisionesPorAnio(anio));
});
router.get('/provisiones.csv', async (req, res) => {
  const anio = parseInt(req.query.anio) || new Date().getFullYear();
  const csv = aCsv(await provisionesPorAnio(anio), ['colaborador', 'anio', 'decimo_tercero', 'decimo_cuarto', 'fondos_reserva', 'utilidades']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="provisiones-${anio}.csv"`);
  res.send(csv);
});
```

(Todas estas funciones y rutas se agregan justo antes del endpoint `documentos-faltantes` agregado en la Task 16, o después — el orden entre rutas no importa en Express siempre que no compartan el mismo path exacto, que no es el caso aquí.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/reportes.test.js`
Expected: PASS (8 tests — los 4 previos + los 4 nuevos de este task)

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/reportes.js server/tests/reportes.test.js
git commit -m "feat: reportes de evolución mensual, retenciones a proveedores y provisiones; costo-departamento por período"
```

---

### Task 19: `Reportes.jsx` — 4 secciones nuevas + explicación + CSV

**Files:**
- Modify: `client/src/pages/Reportes.jsx` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `useToast` (Task 1), los 4 endpoints/CSV de Task 18.

- [ ] **Step 1: Reescribir `Reportes.jsx` completo**

```jsx
// client/src/pages/Reportes.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, fecha } from '../utils.js';

function descargar(path, nombreArchivo) {
  return async () => {
    const token = localStorage.getItem('idToken');
    const res = await fetch(`/api${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  };
}

export default function Reportes() {
  const [periodos, setPeriodos] = useState([]);
  const [seleccion, setSeleccion] = useState('');
  const [costo, setCosto] = useState([]);
  const [evolucion, setEvolucion] = useState([]);
  const [retenciones, setRetenciones] = useState([]);
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [provisiones, setProvisiones] = useState([]);
  const toast = useToast();

  useEffect(() => {
    api.get('/periodos').then(setPeriodos).catch((e) => toast.error(e.message));
    api.get('/reportes/evolucion-mensual').then(setEvolucion).catch(() => {});
    api.get('/reportes/retenciones-proveedor').then(setRetenciones).catch(() => {});
  }, []);

  useEffect(() => {
    const q = seleccion ? `?periodo_id=${seleccion}` : '';
    api.get(`/reportes/costo-departamento${q}`).then(setCosto).catch(() => {});
  }, [seleccion]);

  useEffect(() => {
    api.get(`/reportes/provisiones?anio=${anio}`).then(setProvisiones).catch(() => {});
  }, [anio]);

  const maxNeto = Math.max(...evolucion.map((e) => Number(e.neto)), 1);

  return (
    <div className="animate-fade-in">
      <PageTitle>Reportes</PageTitle>

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-1">Costo de nómina por período</h2>
        <p className="text-sm text-muted mb-3">
          Elige un período para ver el costo real (ingresos, descuentos y neto) por departamento, y exportar el detalle por colaborador en CSV.
        </p>
        <div className="flex gap-2 flex-wrap mb-4">
          <select value={seleccion} onChange={(e) => setSeleccion(e.target.value)} className="input flex-1 min-w-48">
            <option value="">Proyección actual (sin período específico)</option>
            {periodos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={descargar(`/reportes/periodo/${seleccion}.csv`, `periodo-${seleccion}.csv`)} disabled={!seleccion}
            className="btn btn-primary disabled:opacity-40">
            Descargar detalle CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Departamento</th>
              {seleccion ? (
                <>
                  <th className="p-2 text-right">Ingresos</th>
                  <th className="p-2 text-right">Descuentos</th>
                  <th className="p-2 text-right">Neto</th>
                </>
              ) : (
                <>
                  <th className="p-2 text-right">Sueldos</th>
                  <th className="p-2 text-right">Aporte patronal (12.15%)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {costo.map((c) => (
              <tr key={c.departamento} className="border-b border-slate-200">
                <td className="p-2">{c.departamento}</td>
                {seleccion ? (
                  <>
                    <td className="p-2 text-right">{money(c.total_ingresos)}</td>
                    <td className="p-2 text-right">{money(c.total_descuentos)}</td>
                    <td className="p-2 text-right font-semibold">{money(c.neto)}</td>
                  </>
                ) : (
                  <>
                    <td className="p-2 text-right">{money(c.total_sueldos)}</td>
                    <td className="p-2 text-right">{money(c.aporte_patronal)}</td>
                  </>
                )}
              </tr>
            ))}
            {costo.length === 0 && (
              <tr><td colSpan={3} className="p-2 text-slate-500">Sin datos.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-1">Evolución de costo de nómina por período</h2>
        <p className="text-sm text-muted mb-3">
          Serie histórica de ingresos, descuentos y neto pagado en cada período generado, para ver la tendencia mes a mes.
        </p>
        <div className="flex justify-end mb-2">
          <button onClick={descargar('/reportes/evolucion-mensual.csv', 'evolucion-mensual.csv')} className="btn btn-secondary text-xs">
            Descargar CSV
          </button>
        </div>
        <div className="space-y-2">
          {evolucion.map((e) => (
            <div key={e.nombre}>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{e.nombre}</span>
                <span>{money(e.neto)}</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full rounded-full bg-gold-400" style={{ width: `${(Number(e.neto) / maxNeto) * 100}%` }} />
              </div>
            </div>
          ))}
          {evolucion.length === 0 && <p className="text-sm text-slate-500">Sin períodos generados aún.</p>}
        </div>
      </Card>

      <Card className="mb-4">
        <h2 className="font-display font-bold mb-1">Retenciones a proveedores</h2>
        <p className="text-sm text-muted mb-3">
          Facturas de proveedores agrupadas por mes, con el total bruto, retenido y neto pagado — útil para declaraciones.
        </p>
        <div className="flex justify-end mb-2">
          <button onClick={descargar('/reportes/retenciones-proveedor.csv', 'retenciones-proveedor.csv')} className="btn btn-secondary text-xs">
            Descargar CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Proveedor</th><th className="p-2">Mes</th>
              <th className="p-2 text-right">Bruto</th><th className="p-2 text-right">Retención</th><th className="p-2 text-right">Neto</th>
            </tr>
          </thead>
          <tbody>
            {retenciones.map((r, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="p-2">{r.proveedor}</td>
                <td className="p-2">{fecha(r.mes)}</td>
                <td className="p-2 text-right">{money(r.total_bruto)}</td>
                <td className="p-2 text-right">{money(r.total_retencion)}</td>
                <td className="p-2 text-right font-semibold">{money(r.total_neto)}</td>
              </tr>
            ))}
            {retenciones.length === 0 && <tr><td colSpan={5} className="p-2 text-slate-500">Sin facturas registradas.</td></tr>}
          </tbody>
        </table>
      </Card>

      <Card>
        <h2 className="font-display font-bold mb-1">Provisiones acumuladas</h2>
        <p className="text-sm text-muted mb-3">
          Lo que cada colaborador lleva acumulado en el año de décimo tercero, décimo cuarto, fondos de reserva y utilidades — se actualiza al cerrar cada período.
        </p>
        <div className="flex items-center justify-between mb-2">
          <input type="number" value={anio} onChange={(e) => setAnio(e.target.value)} className="input w-28" />
          <button onClick={descargar(`/reportes/provisiones.csv?anio=${anio}`, `provisiones-${anio}.csv`)} className="btn btn-secondary text-xs">
            Descargar CSV
          </button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Colaborador</th>
              <th className="p-2 text-right">Décimo tercero</th>
              <th className="p-2 text-right">Décimo cuarto</th>
              <th className="p-2 text-right">Fondos de reserva</th>
              <th className="p-2 text-right">Utilidades</th>
            </tr>
          </thead>
          <tbody>
            {provisiones.map((p, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="p-2">{p.colaborador}</td>
                <td className="p-2 text-right">{money(p.decimo_tercero)}</td>
                <td className="p-2 text-right">{money(p.decimo_cuarto)}</td>
                <td className="p-2 text-right">{money(p.fondos_reserva)}</td>
                <td className="p-2 text-right">{money(p.utilidades)}</td>
              </tr>
            ))}
            {provisiones.length === 0 && <tr><td colSpan={5} className="p-2 text-slate-500">Sin provisiones para este año.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

Nota: el `fetch` de descarga ahora incluye `credentials: 'include'` (el original no lo tenía, lo que rompía la descarga bajo el esquema de sesión por cookie actual — se corrige de paso).

- [ ] **Step 2: Verificar manualmente**

Run: build + entrar a `/reportes` como ADMIN/RRHH/GERENCIA.
Expected: 4 tarjetas con texto explicativo, tablas con datos, botones "Descargar CSV" funcionando (revisar la carpeta de descargas del navegador).

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Reportes.jsx
git commit -m "feat: reportes explicados con evolución mensual, retenciones y provisiones + fix de descarga CSV con cookie"
```

---

## Phase 7 — Configuración en pestañas

### Task 20: `Configuracion.jsx` — reescritura en pestañas General/Empresas/Bancos/Usuarios

**Files:**
- Modify: `client/src/pages/Configuracion.jsx` (reescritura completa del archivo)

**Interfaces:**
- Consumes: `Modal` (Task 2), `useToast` (Task 1), `GET/PATCH /api/empresas` (Task 12).
- Reemplaza el último `prompt()` nativo restante (renombrar banco) por un modal.

- [ ] **Step 1: Reescribir `Configuracion.jsx` completo**

```jsx
// client/src/pages/Configuracion.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';

const TABS = ['General', 'Empresas', 'Bancos', 'Usuarios'];

const ETIQUETAS_PARAMETRO = {
  SBU: 'Salario Básico Unificado (SBU)',
  PORCENTAJE_ANTICIPO: 'Porcentaje de anticipo global (1ra quincena, 0 a 1)',
  DIAS_VACACIONES_ANIO: 'Días de vacaciones por año trabajado',
};

function ParametroFila({ parametro, onGuardar }) {
  const [valor, setValor] = useState(parametro.valor);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onGuardar(parametro.clave, valor); }}
      className="flex items-center gap-2">
      <label className="text-sm text-slate-600 flex-1">
        {ETIQUETAS_PARAMETRO[parametro.clave] || parametro.clave}
      </label>
      <input value={valor} onChange={(e) => setValor(e.target.value)} className="input w-32" />
      <button className="btn btn-primary !px-3 !py-1.5 text-xs">Guardar</button>
    </form>
  );
}

function GeneralTab() {
  const [parametros, setParametros] = useState([]);
  const toast = useToast();

  const cargar = () => api.get('/parametros').then(setParametros).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const guardar = async (clave, valor) => {
    try {
      await api.put(`/parametros/${clave}`, { valor });
      toast.success('Parámetro actualizado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <h2 className="font-display font-bold mb-3">Parámetros generales</h2>
      <div className="grid gap-3 max-w-lg">
        {parametros.map((p) => (
          <ParametroFila key={p.clave} parametro={p} onGuardar={guardar} />
        ))}
        {parametros.length === 0 && <p className="text-sm text-slate-500">Sin parámetros.</p>}
      </div>
    </Card>
  );
}

function EmpresasTab() {
  const [empresas, setEmpresas] = useState([]);
  const toast = useToast();

  const cargar = () => api.get('/empresas').then(setEmpresas).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const alternar = async (e) => {
    try {
      await api.patch(`/empresas/${encodeURIComponent(e.empresa)}`, { aplica_retencion: !e.aplica_retencion });
      toast.success('Configuración actualizada.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Retención de fuente por empresa</h2>
      <p className="text-sm text-muted mb-4">
        Define si las facturas de proveedores de cada empresa aplican el 10% de retención de fuente automáticamente.
      </p>
      <div className="grid gap-2 max-w-lg">
        {empresas.map((e) => (
          <div key={e.empresa} className="flex items-center justify-between border border-slate-200 rounded-lg px-4 py-3">
            <span className="text-sm font-medium text-slate-700">{e.empresa}</span>
            <button onClick={() => alternar(e)}
              className={e.aplica_retencion ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
              {e.aplica_retencion ? 'RETIENE 10%' : 'NO RETIENE'}
            </button>
          </div>
        ))}
        {empresas.length === 0 && <p className="text-sm text-slate-500">Sin empresas configuradas.</p>}
      </div>
    </Card>
  );
}

function BancosTab() {
  const [bancos, setBancos] = useState([]);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ codigo: '', nombre: '' });
  const [editando, setEditando] = useState(null); // { codigo, nombre }
  const toast = useToast();

  const cargar = () => api.get('/bancos/todos').then(setBancos).catch((e) => toast.error(e.message));
  useEffect(() => { cargar(); }, []);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/bancos', form);
      setForm({ codigo: '', nombre: '' });
      toast.success('Banco agregado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/bancos/${editando.codigo}`, { nombre: editando.nombre });
      toast.success('Banco actualizado.');
      setEditando(null);
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const alternar = async (b) => {
    try {
      await api.patch(`/bancos/${b.codigo}`, { activo: !b.activo });
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filtrados = bancos.filter(
    (b) => !q || b.nombre.toLowerCase().includes(q.toLowerCase()) || b.codigo.includes(q)
  );

  return (
    <Card>
      <h2 className="font-display font-bold mb-1">Configuración de bancos</h2>
      <p className="text-sm text-muted mb-3">
        Códigos de instituciones financieras para el archivo de pago masivo (catálogo Cash Management Pichincha, {bancos.length} instituciones).
        Los inactivos no aparecen al asignar banco en la ficha del colaborador.
      </p>

      <form onSubmit={crear} className="grid md:grid-cols-4 gap-2 mb-3">
        <input required placeholder="Código (ej. 10)" className="input w-full" value={form.codigo}
          onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
        <input required placeholder="Nombre de la institución" className="input w-full md:col-span-2" value={form.nombre}
          onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
        <button className="btn btn-primary">Agregar banco</button>
      </form>

      <input placeholder="Buscar por nombre o código…" className="input w-full mb-2"
        value={q} onChange={(e) => setQ(e.target.value)} />

      <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left sticky top-0 bg-white">
            <tr className="border-b border-slate-200">
              <th className="p-2 w-20">Código</th>
              <th className="p-2">Institución</th>
              <th className="p-2 w-28">Estado</th>
              <th className="p-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((b) => (
              <tr key={b.codigo} className={`border-b border-slate-100 ${!b.activo && 'opacity-50'}`}>
                <td className="p-2 font-mono">{b.codigo}</td>
                <td className="p-2">{b.nombre}</td>
                <td className="p-2">
                  <button onClick={() => alternar(b)}
                    className={b.activo ? 'badge bg-emerald-100 text-emerald-700' : 'badge bg-slate-100 text-slate-600'}>
                    {b.activo ? 'ACTIVO' : 'INACTIVO'}
                  </button>
                </td>
                <td className="p-2">
                  <button onClick={() => setEditando({ codigo: b.codigo, nombre: b.nombre })} className="text-gold-600 text-xs hover:underline">
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && <tr><td colSpan={4} className="p-3 text-slate-500">Sin resultados.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={!!editando} onClose={() => setEditando(null)} title={`Editar banco — código ${editando?.codigo}`} size="sm"
        footer={<button type="submit" form="form-editar-banco" className="btn btn-primary">Guardar</button>}>
        <form id="form-editar-banco" onSubmit={guardarEdicion}>
          <label className="text-sm text-slate-600">Nombre de la institución
            <input required autoFocus className="input w-full mt-1" value={editando?.nombre ?? ''}
              onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} />
          </label>
        </form>
      </Modal>
    </Card>
  );
}

function UsuariosTab() {
  const VACIO = { email: '', nombre: '', rol: 'COLABORADOR', colaborador_id: '' };
  const [usuarios, setUsuarios] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const toast = useToast();

  const cargar = () => {
    api.get('/usuarios').then(setUsuarios).catch((e) => toast.error(e.message));
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  };
  useEffect(() => { cargar(); }, []);

  const guardarUsuario = async (e) => {
    e.preventDefault();
    try {
      await api.post('/usuarios', { ...form, colaborador_id: form.colaborador_id || null });
      setForm(VACIO);
      toast.success('Usuario guardado.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-display font-bold mb-3">Nuevo usuario / rol</h2>
        <form onSubmit={guardarUsuario} className="grid md:grid-cols-4 gap-2">
          <input required type="email" placeholder="correo@bopelual.com" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input w-full" />
          <input placeholder="Nombre" value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="input w-full" />
          <select value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value })}
            className="input w-full">
            {['ADMIN', 'RRHH', 'COLABORADOR', 'GERENCIA'].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          <select value={form.colaborador_id}
            onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}
            className="input w-full">
            <option value="">Sin vincular</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
          <button className="btn btn-primary md:col-span-4">Guardar usuario</button>
        </form>
      </Card>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Correo</th>
              <th className="p-3">Rol</th>
              <th className="p-3">Activo</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b border-slate-200">
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.rol}</td>
                <td className="p-3"><Badge estado={u.activo ? 'PAGADO' : 'PENDIENTE'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Configuracion() {
  const [tab, setTab] = useState('General');
  return (
    <div className="animate-fade-in">
      <PageTitle>Configuración</PageTitle>
      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-white border border-b-0 border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'General' && <GeneralTab />}
      {tab === 'Empresas' && <EmpresasTab />}
      {tab === 'Bancos' && <BancosTab />}
      {tab === 'Usuarios' && <UsuariosTab />}
    </div>
  );
}
```

- [ ] **Step 2: Verificar manualmente**

Run: build + login como ADMIN, ir a `/configuracion`.
Expected: 4 pestañas (General/Empresas/Bancos/Usuarios). "General" muestra los 3 parámetros (SBU, PORCENTAJE_ANTICIPO, DIAS_VACACIONES_ANIO) editables. "Empresas" muestra el toggle de retención para BOPELUAL/CARROS-YA. "Bancos" funciona igual que antes, pero "Editar" abre un modal (no un `prompt()`). "Usuarios" funciona igual que antes.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Configuracion.jsx
git commit -m "feat: reorganizar Configuración en pestañas General/Empresas/Bancos/Usuarios"
```

---

## Phase 8 — Verificación final

### Task 21: Suite completa, build, commit final

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Correr toda la suite del servidor**

Run: `cd server && npm test`
Expected: todos los tests pasan (los existentes + los ~20 nuevos de este plan).

- [ ] **Step 2: Correr toda la suite del cliente**

Run: `cd client && npm test`
Expected: todos los tests pasan (`Badge.test.jsx` + `Toast.test.jsx` + `Modal.test.jsx` + `validacion-html5.test.jsx`).

- [ ] **Step 3: Build del cliente**

Run: `cd client && npm run build`
Expected: `✓ built in ...` sin errores ni warnings nuevos.

- [ ] **Step 4: Revisar el estado de git**

Run: `git status --short` y `git log --oneline -25`
Expected: todos los commits de las 8 fases presentes, sin cambios sin commitear.

- [ ] **Step 5: Push**

```bash
git push
```

---

## Plan Self-Review

**Spec coverage:**
1. Sistema Toast/Modal + validaciones en español + 7 diálogos nativos reemplazados → Tasks 1–5, 7, 20. ✓
2. Préstamos: fecha real + modal editable de abono/precancelación → Tasks 6–7. ✓
3. Migración 007 + sincronizar BORRADOR → Tasks 8–11. ✓
4. Retención por empresa + pestaña Facturas → Tasks 12–15. ✓
5. Ficha proveedor con facturas → Task 15. ✓
6. Dashboard KPIs RRHH (4 elegidos) → Tasks 16–17. ✓
7. Reportes (4 elegidos) → Tasks 18–19. ✓
8. Configuración en pestañas → Task 20. ✓

**Placeholder scan:** sin "TBD"/"TODO"/"handle edge cases" genéricos — cada paso trae el código completo o el comando exacto.

**Type/name consistency verificada:** `aplicarPrestamosPendientes`/`aplicarDescuentosPendientes` (Task 9) se usan con la misma firma en Task 10 y Task 11 (vía el endpoint); `TablaDescuentos`/`FormDescuento` conservan su interfaz salvo la eliminación documentada de `onError`; `FormFactura`/`TablaFacturas` (Task 14) se consumen con las mismas props en Task 15; `useToast`/`useConfirm`/`Modal` (Tasks 1–2) se importan con el mismo path (`../components/Toast.jsx`, `../components/Modal.jsx`) en todos los tasks posteriores.

**Scope conocido y explícito:** las páginas `Colaboradores.jsx`, `Periodos.jsx`, `PeriodoDetalle.jsx` y `Ausencias.jsx` no se tocan en este plan (ver Global Constraints) — quedan con su patrón de banner de error actual. Es una decisión de alcance, no un olvido.
