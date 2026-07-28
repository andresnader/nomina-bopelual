import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, FileSpreadsheet, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { useToast } from '../components/Toast.jsx';
import { useConfirm } from '../components/Modal.jsx';
import NuevoMesModal from '../components/NuevoMesModal.jsx';
import ExportarTxtMatriz from '../components/ExportarTxtMatriz.jsx';
import AprobacionMatriz from '../components/AprobacionMatriz.jsx';
import { money, fecha } from '../utils.js';

const VACIO = { nombre: '', fecha_inicio: '', fecha_fin: '', quincena: 1 };

// Tarjeta-folder de un período mensual: sus dos sub-tarjetas Q1/Q2, acciones
// en cascada (aprobar/cerrar mes), y las secciones expandibles de exportación
// de TXT y aprobación por combinación (estas dos cargan datos bajo demanda,
// no en la carga inicial de la lista).
function MesCard({ mes, onCambio }) {
  const [seccion, setSeccion] = useState(null); // null | 'txt' | 'aprobacion'
  const [hijasDetalle, setHijasDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const confirm = useConfirm();
  const toast = useToast();

  const cargarHijasDetalle = async () => {
    setCargandoDetalle(true);
    try {
      const detalles = await Promise.all(mes.hijas.map((h) => api.get(`/periodos/${h.id}`)));
      setHijasDetalle(detalles);
    } finally {
      setCargandoDetalle(false);
    }
  };

  const abrirSeccion = (nombre) => {
    const siguiente = seccion === nombre ? null : nombre;
    setSeccion(siguiente);
    if (siguiente === 'aprobacion' && !hijasDetalle) cargarHijasDetalle();
  };

  const accionCascada = async (accion, etiqueta) => {
    const ok = await confirm({
      title: `${etiqueta} mes`,
      message: `¿${etiqueta} "${mes.nombre}"? Esto ${accion === 'aprobar' ? 'aprueba' : 'cierra'} sus quincenas.`,
      confirmLabel: etiqueta,
    });
    if (!ok) return;
    try {
      await api.post(`/periodos/mes/${mes.id}/${accion}`);
      toast.success(`${etiqueta} completado.`);
      onCambio();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <Card className="mb-4 animate-slide-up">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-slate-900">{mes.nombre}</h3>
          <Badge estado={mes.estado} />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-700">{money(mes.total_neto)}</span>
          <RoleGate roles={['ADMIN', 'RRHH']}>
            {mes.estado === 'BORRADOR' && (
              <button onClick={() => accionCascada('aprobar', 'Aprobar')} className="btn btn-primary text-xs">Aprobar mes</button>
            )}
            {mes.estado === 'APROBADO' && (
              <button onClick={() => accionCascada('cerrar', 'Cerrar')} className="btn btn-primary text-xs">Cerrar mes</button>
            )}
          </RoleGate>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        {mes.hijas.map((h) => (
          <Link key={h.id} to={`/periodos/${h.id}`}
            className="block p-3 rounded-lg border border-slate-200 hover:border-gold-300 hover:bg-slate-50 transition-colors">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">Quincena {h.quincena}</span>
              <Badge estado={h.estado} />
            </div>
            <p className="text-xs text-muted">{fecha(h.fecha_inicio)} – {fecha(h.fecha_fin)}</p>
            <p className="text-sm font-semibold text-slate-700 mt-1">{money(h.total_neto)}</p>
          </Link>
        ))}
      </div>

      <RoleGate roles={['ADMIN', 'RRHH']}>
        <div className="flex gap-2 flex-wrap border-t border-dashed border-slate-200 pt-3">
          <button onClick={() => abrirSeccion('txt')} className="btn btn-secondary text-xs">
            <FileSpreadsheet size={13} /> Exportar TXT
          </button>
          <button onClick={() => abrirSeccion('aprobacion')} className="btn btn-secondary text-xs">
            Aprobación por combinación {seccion === 'aprobacion' ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        </div>

        {seccion === 'txt' && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            <ExportarTxtMatriz periodoId={mes.id} quincenas={mes.hijas.map((h) => h.quincena)} />
          </div>
        )}
        {seccion === 'aprobacion' && (
          <div className="mt-3 pt-3 border-t border-slate-200">
            {cargandoDetalle && <p className="text-sm text-muted">Cargando…</p>}
            {hijasDetalle && (
              <AprobacionMatriz
                periodos={hijasDetalle.map((d, i) => ({ id: mes.hijas[i].id, label: `Q${mes.hijas[i].quincena}`, grupos: d.grupos }))}
                onCambio={() => { cargarHijasDetalle(); onCambio(); }}
              />
            )}
          </div>
        )}
      </RoleGate>
    </Card>
  );
}

export default function Periodos() {
  const toast = useToast();
  const [meses, setMeses] = useState([]);
  const [sueltas, setSueltas] = useState([]);
  const [form, setForm] = useState(null);
  const [wizardAbierto, setWizardAbierto] = useState(false);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/periodos/mes')
    .then((r) => { setMeses(r.meses); setSueltas(r.sueltas); })
    .catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, []);

  const sueltaEnBorrador = sueltas.find((p) => p.estado === 'BORRADOR');

  const crear = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post('/periodos', { ...form, quincena: Number(form.quincena) });
      toast.success(`Período creado con ${res.creados} rol(es) generados.`);
      setForm(null);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <PageTitle
        accion={
          <RoleGate roles={['ADMIN', 'RRHH']}>
            <button onClick={() => setWizardAbierto(true)} className="btn-primary">
              <Plus size={15} /> Nuevo mes completo
            </button>
          </RoleGate>
        }
      >
        Períodos
      </PageTitle>

      {error && <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm animate-slide-up">{error}</div>}

      {meses.length === 0 && sueltas.length === 0 && !error && (
        <Card className="text-center text-slate-500 p-8">No hay períodos registrados</Card>
      )}

      {meses.map((mes) => <MesCard key={mes.id} mes={mes} onCambio={cargar} />)}

      {sueltas.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-slate-600 mt-2 mb-2">Quincenas sueltas</h2>
          <div className="card p-0 overflow-hidden animate-fade-in mb-6">
            <table className="hidden md:table w-full text-sm">
              <thead>
                <tr className="border-b border-brand-600/30">
                  <th className="table-header p-4 text-left">Período</th>
                  <th className="table-header p-4 text-left">Rango</th>
                  <th className="table-header p-4 text-left">Estado</th>
                  <th className="table-header p-4 text-right">Total neto</th>
                </tr>
              </thead>
              <tbody>
                {sueltas.map((p) => (
                  <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-50 transition-colors">
                    <td className="p-4">
                      <Link to={`/periodos/${p.id}`} className="link text-sm font-medium">{p.nombre}</Link>
                    </td>
                    <td className="p-4 text-slate-600">{fecha(p.fecha_inicio)} – {fecha(p.fecha_fin)}</td>
                    <td className="p-4"><Badge estado={p.estado} /></td>
                    <td className="p-4 text-right font-medium text-slate-800">{money(p.total_neto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="md:hidden space-y-2 p-2">
              {sueltas.map((p) => (
                <MobileCard
                  key={p.id}
                  top={
                    <>
                      <Link to={`/periodos/${p.id}`} className="link text-sm font-medium">{p.nombre}</Link>
                      <Badge estado={p.estado} />
                    </>
                  }
                  meta={
                    <span className="flex items-center justify-between">
                      <span>{fecha(p.fecha_inicio)} – {fecha(p.fecha_fin)}</span>
                      <span className="font-medium text-slate-700">{money(p.total_neto)}</span>
                    </span>
                  }
                />
              ))}
            </div>
          </div>
        </>
      )}

      <RoleGate roles={['ADMIN', 'RRHH']}>
        <details className="mb-6">
          <summary className="cursor-pointer text-sm text-muted select-none">Crear quincena suelta (avanzado)</summary>
          <div className="mt-3">
            {sueltaEnBorrador && (
              <div className="mb-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-sm animate-slide-up">
                Hay una quincena suelta en BORRADOR pendiente —{' '}
                <Link to={`/periodos/${sueltaEnBorrador.id}`} className="link font-medium">{sueltaEnBorrador.nombre}</Link>
                {' '}— apruébala o ciérrala antes de crear otra.
              </div>
            )}
            {!form && (
              <button onClick={() => setForm(VACIO)} disabled={!!sueltaEnBorrador} className="btn-secondary disabled:opacity-40">
                Nueva quincena suelta
              </button>
            )}
            {form && (
              <Card className="animate-slide-up">
                <h2 className="text-sm font-semibold text-slate-800 mb-4">Nueva quincena suelta</h2>
                <form onSubmit={crear} className="grid md:grid-cols-2 gap-4">
                  <input required placeholder="Nombre (ej: 2da quincena julio 2026)" value={form.nombre}
                    onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    className="input md:col-span-2" />
                  <div>
                    <label className="label">Fecha inicio</label>
                    <input required type="date" value={form.fecha_inicio}
                      onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })}
                      className="input" />
                  </div>
                  <div>
                    <label className="label">Fecha fin</label>
                    <input required type="date" value={form.fecha_fin}
                      onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })}
                      className="input" />
                  </div>
                  <div>
                    <label className="label">Quincena</label>
                    <select value={form.quincena}
                      onChange={(e) => setForm({ ...form, quincena: e.target.value })}
                      className="input">
                      <option value={1}>1ra quincena (40% anticipo)</option>
                      <option value={2}>2da quincena (60% + beneficios)</option>
                    </select>
                  </div>
                  <div className="flex gap-3 items-end md:col-span-2">
                    <button className="btn-primary">Crear y generar roles</button>
                    <button type="button" onClick={() => setForm(null)} className="btn-ghost">Cancelar</button>
                  </div>
                </form>
              </Card>
            )}
          </div>
        </details>
      </RoleGate>

      <NuevoMesModal open={wizardAbierto} onClose={() => setWizardAbierto(false)}
        onCreado={() => { toast.success('Mes creado.'); cargar(); }} />
    </div>
  );
}
