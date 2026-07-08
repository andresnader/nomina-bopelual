import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, Trash2, Star } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money, fecha } from '../utils.js';
import { FormDescuento, TablaDescuentos } from './Descuentos.jsx';
import { FormAusencia, TablaAusencias } from './Ausencias.jsx';
import { useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { FormFactura, TablaFacturas } from './Proveedores.jsx';

const TABS_BASE = ['Ficha', 'Contratos', 'Descuentos', 'Ausencias', 'Documentos', 'Evaluaciones', 'Roles de pago'];

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
  });

  const guardar = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/colaboradores/${col.id}`, {
        ...form,
        fecha_ingreso: form.fecha_ingreso || null,
        cargas_personales: Number(form.cargas_personales) || 0,
        pct_anticipo: form.pct_anticipo === '' ? null : Number(form.pct_anticipo),
      });
      onGuardado();
    } catch (err) {
      onError(err.message);
    }
  };

  const campo = (k, props = {}) => (
    <input className="input w-full" value={form[k]} {...props}
      onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
  );

  return (
    <form onSubmit={guardar} className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Datos personales y laborales</h2>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="text-sm text-slate-600">Nombre {campo('nombre', { required: true })}</label>
          <label className="text-sm text-slate-600">Cédula / RUC {campo('cedula')}</label>
          <label className="text-sm text-slate-600">Email {campo('email', { type: 'email' })}</label>
          <label className="text-sm text-slate-600">Departamento {campo('departamento')}</label>
          <label className="text-sm text-slate-600">Cargo {campo('cargo')}</label>
          <label className="text-sm text-slate-600">Fecha de ingreso (IESS) {campo('fecha_ingreso', { type: 'date' })}</label>
          <label className="text-sm text-slate-600">Empresa
            <select className="input w-full" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })}>
              <option value="">—</option>
              <option>BOPELUAL S.A.</option>
              <option>CARROS-YA S.A.</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">Centro de costo {campo('centro_costo')}</label>
          <label className="text-sm text-slate-600">Cargas personales {campo('cargas_personales', { type: 'number', min: 0 })}</label>
          <label className="text-sm text-slate-600">Anticipo 1ra quincena
            <select className="input w-full" value={form.pct_anticipo}
              onChange={(e) => setForm({ ...form, pct_anticipo: e.target.value })}>
              <option value="">Global (parámetro, 40%)</option>
              <option value="0.4">40% / 60%</option>
              <option value="0.5">50% / 50%</option>
              <option value="0.6">60% / 40%</option>
            </select>
          </label>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold mb-1">Datos bancarios</h2>
        <p className="text-sm text-muted mb-3">Necesarios para incluirlo en el TXT de pago masivo del banco.</p>
        <div className="grid md:grid-cols-4 gap-3">
          <label className="text-sm text-slate-600">Banco (catálogo Pichincha)
            <select className="input w-full" value={form.codigo_banco}
              onChange={(e) => {
                const b = bancos.find((x) => x.codigo === e.target.value);
                setForm({ ...form, codigo_banco: e.target.value, banco: b?.nombre ?? '' });
              }}>
              <option value="">—</option>
              {bancos.map((b) => <option key={b.codigo} value={b.codigo}>{b.codigo} — {b.nombre}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-600">Tipo de cuenta
            <select className="input w-full" value={form.tipo_cuenta} onChange={(e) => setForm({ ...form, tipo_cuenta: e.target.value })}>
              <option>AHORRO</option>
              <option>CORRIENTE</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">N° de cuenta {campo('cuenta_bancaria')}</label>
        </div>
      </Card>

      <div>
        <button className="btn btn-primary">Guardar ficha</button>
      </div>
    </form>
  );
}

function ContratosTab({ col, onCambio, onError }) {
  const [contrato, setContrato] = useState({ sueldo_base: '', fecha_inicio: '', notas: '' });

  const nuevoContrato = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/contratos`, contrato);
      setContrato({ sueldo_base: '', fecha_inicio: '', notas: '' });
      onCambio();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nuevo contrato / aumento</h2>
        <form onSubmit={nuevoContrato} className="grid md:grid-cols-4 gap-2">
          <input required type="number" step="0.01" placeholder="Sueldo base" className="input w-full"
            value={contrato.sueldo_base} onChange={(e) => setContrato({ ...contrato, sueldo_base: e.target.value })} />
          <input required type="date" className="input w-full"
            value={contrato.fecha_inicio} onChange={(e) => setContrato({ ...contrato, fecha_inicio: e.target.value })} />
          <input placeholder="Notas (motivo)" className="input w-full"
            value={contrato.notas} onChange={(e) => setContrato({ ...contrato, notas: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
        </form>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Sueldo</th><th className="p-3">Desde</th><th className="p-3">Hasta</th><th className="p-3">Notas</th>
            </tr>
          </thead>
          <tbody>
            {col.contratos.map((c) => (
              <tr key={c.id} className="border-b border-slate-200">
                <td className="p-3 font-medium">{money(c.sueldo_base)}</td>
                <td className="p-3">{fecha(c.fecha_inicio)}</td>
                <td className="p-3">{c.fecha_fin ? fecha(c.fecha_fin) : <span className="badge bg-emerald-100 text-emerald-700">VIGENTE</span>}</td>
                <td className="p-3 text-slate-500">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function DescuentosTab({ col, onError }) {
  const [descuentos, setDescuentos] = useState([]);
  const cargar = () => api.get(`/descuentos?colaborador_id=${col.id}`).then(setDescuentos).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);
  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nuevo descuento recurrente</h2>
        <FormDescuento colaboradorId={col.id} onCreado={cargar} onError={onError} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <TablaDescuentos descuentos={descuentos} onCambio={cargar} conColaborador={false} />
      </Card>
    </div>
  );
}

function AusenciasTab({ col, onError }) {
  const [ausencias, setAusencias] = useState([]);
  const [saldo, setSaldo] = useState(null);
  const cargar = () => {
    api.get(`/ausencias?colaborador_id=${col.id}`).then(setAusencias).catch((e) => onError(e.message));
    api.get(`/ausencias/saldo/${col.id}`).then(setSaldo).catch(() => {});
  };
  useEffect(() => { cargar(); }, [col.id]);
  return (
    <div className="grid gap-4">
      {saldo && (
        <div className="grid grid-cols-3 gap-4">
          {[['Derecho acumulado', saldo.derecho], ['Días tomados', saldo.tomados], ['Saldo disponible', saldo.saldo]].map(([t, v]) => (
            <Card key={t}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t}</p>
              <p className="mt-1 text-2xl font-display font-bold text-slate-900">{v} <span className="text-sm font-normal text-slate-500">días</span></p>
            </Card>
          ))}
        </div>
      )}
      <Card>
        <h2 className="font-semibold mb-3">Registrar ausencia</h2>
        <FormAusencia colaboradorId={col.id} onCreado={cargar} onError={onError} />
      </Card>
      <Card className="p-0 overflow-x-auto">
        <TablaAusencias ausencias={ausencias} onCambio={cargar} onError={onError} conColaborador={false} gestionable />
      </Card>
    </div>
  );
}

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
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Subir documento (máx. 5 MB)</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {['CONTRATO', 'CEDULA', 'CERTIFICADO', 'OTRO'].map((t) => <option key={t}>{t}</option>)}
          </select>
          <input type="file" onChange={subir}
            className="text-sm text-slate-600 file:mr-3 file:btn file:btn-secondary file:border-0" />
        </div>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Documento</th><th className="p-3">Tipo</th><th className="p-3 text-right">Tamaño</th><th className="p-3">Subido</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3 font-medium">{d.nombre}</td>
                <td className="p-3"><span className="badge bg-slate-100 text-slate-600">{d.tipo}</span></td>
                <td className="p-3 text-right">{(d.bytes / 1024).toFixed(0)} KB</td>
                <td className="p-3 text-slate-500">{fecha(d.creado_en)}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <a href={`/api/colaboradores/${col.id}/documentos/${d.id}`}
                    className="inline-block text-slate-400 hover:text-gold-600 p-1.5" title="Descargar">
                    <Download size={15} />
                  </a>
                  <button onClick={() => eliminar(d)} className="text-slate-400 hover:text-red-600 p-1.5" title="Eliminar">
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin documentos.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function EvaluacionesTab({ col, onError }) {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [form, setForm] = useState({ calificacion: 3, fortalezas: '', oportunidades: '' });
  const cargar = () => api.get(`/colaboradores/${col.id}/evaluaciones`).then(setEvaluaciones).catch((e) => onError(e.message));
  useEffect(() => { cargar(); }, [col.id]);

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${col.id}/evaluaciones`, { ...form, calificacion: Number(form.calificacion) });
      setForm({ calificacion: 3, fortalezas: '', oportunidades: '' });
      cargar();
    } catch (err) {
      onError(err.message);
    }
  };

  const estrellas = (n) => (
    <span className="inline-flex text-gold-500">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={14} fill={i <= n ? 'currentColor' : 'none'} className={i <= n ? '' : 'text-slate-300'} />)}
    </span>
  );

  return (
    <div className="grid gap-4">
      <Card>
        <h2 className="font-semibold mb-3">Nueva evaluación</h2>
        <form onSubmit={crear} className="grid md:grid-cols-4 gap-2">
          <select className="input w-full" value={form.calificacion}
            onChange={(e) => setForm({ ...form, calificacion: e.target.value })}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} / 5</option>)}
          </select>
          <input placeholder="Fortalezas" className="input w-full" value={form.fortalezas}
            onChange={(e) => setForm({ ...form, fortalezas: e.target.value })} />
          <input placeholder="Oportunidades de mejora" className="input w-full" value={form.oportunidades}
            onChange={(e) => setForm({ ...form, oportunidades: e.target.value })} />
          <button className="btn btn-primary">Registrar</button>
        </form>
      </Card>
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Fecha</th><th className="p-3">Calificación</th><th className="p-3">Fortalezas</th><th className="p-3">Oportunidades</th><th className="p-3">Evaluador</th>
            </tr>
          </thead>
          <tbody>
            {evaluaciones.map((ev) => (
              <tr key={ev.id} className="border-b border-slate-200">
                <td className="p-3">{fecha(ev.fecha)}</td>
                <td className="p-3">{estrellas(ev.calificacion)}</td>
                <td className="p-3">{ev.fortalezas || '—'}</td>
                <td className="p-3">{ev.oportunidades || '—'}</td>
                <td className="p-3 text-slate-500">{ev.evaluador_email || '—'}</td>
              </tr>
            ))}
            {evaluaciones.length === 0 && <tr><td colSpan={5} className="p-4 text-slate-500">Sin evaluaciones.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

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

function RolesTab({ col }) {
  return (
    <Card className="p-0 overflow-x-auto">
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
                <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">
                  {r.periodo_nombre}
                </Link>
              </td>
              <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
              <td className="p-3"><Badge estado={r.estado_pago} /></td>
            </tr>
          ))}
          {col.roles_pago.length === 0 && <tr><td colSpan={3} className="p-4 text-slate-500">Sin roles aún.</td></tr>}
        </tbody>
      </table>
    </Card>
  );
}

export default function ColaboradorDetalle() {
  const { id } = useParams();
  const [col, setCol] = useState(null);
  const [tab, setTab] = useState('Ficha');
  const [error, setError] = useState(null);

  const cargar = () => api.get(`/colaboradores/${id}`).then(setCol).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);

  if (!col) return <Card>{error || 'Cargando…'}</Card>;

  const tabs = col.tipo === 'EXTERNO'
    ? [...TABS_BASE.slice(0, -1), 'Facturas', 'Roles de pago']
    : TABS_BASE;

  return (
    <div className="animate-fade-in">
      <PageTitle>
        {col.nombre} <Badge estado={col.tipo} />
        {col.empresa && <span className="badge bg-slate-100 text-slate-600 ml-1">{col.empresa}</span>}
      </PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <div className="flex gap-1 mb-4 border-b border-slate-200 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => { setTab(t); setError(null); }}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap rounded-t-lg transition-colors ${
              tab === t
                ? 'bg-white border border-b-0 border-slate-200 text-slate-900'
                : 'text-slate-500 hover:text-slate-800'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'Ficha' && <FichaTab col={col} onGuardado={() => { setError(null); cargar(); }} onError={setError} />}
      {tab === 'Contratos' && <ContratosTab col={col} onCambio={() => { setError(null); cargar(); }} onError={setError} />}
      {tab === 'Descuentos' && <DescuentosTab col={col} onError={setError} />}
      {tab === 'Ausencias' && <AusenciasTab col={col} onError={setError} />}
      {tab === 'Documentos' && <DocumentosTab col={col} onError={setError} />}
      {tab === 'Evaluaciones' && <EvaluacionesTab col={col} onError={setError} />}
      {tab === 'Facturas' && <FacturasTab col={col} />}
      {tab === 'Roles de pago' && <RolesTab col={col} />}
    </div>
  );
}
