import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import KpiCard from '../components/KpiCard.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { Modal, useConfirm } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, fecha } from '../utils.js';

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
export function AbonoModal({ prestamo, montoInicial, open, onClose, onGuardado }) {
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

export function CuotaModal({ prestamo, open, onClose, onGuardado }) {
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
  useEffect(() => {
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  }, []);

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

        <table className="hidden md:table w-full text-sm">
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
                    <span className={`badge ml-2 ${p.tipo === 'ANTICIPO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                      {p.tipo === 'ANTICIPO' ? 'ANTICIPO' : 'PRÉSTAMO'}
                    </span>
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

        <div className="md:hidden space-y-2 p-2">
          {data.length === 0 && <p className="p-4 text-slate-500 text-sm">Sin préstamos con este filtro.</p>}
          {data.map((p) => (
            <Fragment key={p.id}>
              <MobileCard
                top={
                  <>
                    <span>
                      <Link to={`/colaboradores/${p.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                        {p.colaborador_nombre}
                      </Link>
                      <span className={`badge ml-2 ${p.tipo === 'ANTICIPO' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                        {p.tipo === 'ANTICIPO' ? 'ANTICIPO' : 'PRÉSTAMO'}
                      </span>
                      {!p.activo && <span className="badge bg-emerald-100 text-emerald-700 ml-2">PAGADO</span>}
                    </span>
                    <span className="font-semibold text-slate-700 shrink-0">{money(p.saldo_pendiente)}</span>
                  </>
                }
                meta={<BarraProgreso prestamo={p} />}
                footer={
                  <div className="w-full flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span>
                        Cuota {money(p.cuota_quincena)}
                        {p.activo && (
                          <button onClick={() => setModalCuota(p)} className="text-slate-400 hover:text-gold-600 ml-1 p-2" title="Editar cuota">
                            <Pencil size={13} />
                          </button>
                        )}
                      </span>
                      <span>{fecha(p.fecha_inicio)}</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      {p.activo && (
                        <>
                          <button onClick={() => setModalAbono({ prestamo: p, montoInicial: '' })} className="btn btn-secondary !px-2.5 !py-1.5 text-xs">Abonar</button>
                          <button onClick={() => setModalAbono({ prestamo: p, montoInicial: p.saldo_pendiente })} className="btn btn-secondary !px-2.5 !py-1.5 text-xs">Precancelar</button>
                        </>
                      )}
                      {sinPagos(p) && (
                        <button onClick={() => eliminar(p)} className="text-slate-400 hover:text-red-600 p-2" title="Eliminar">
                          <Trash2 size={15} />
                        </button>
                      )}
                      <button onClick={() => setExpandido(expandido === p.id ? null : p.id)}
                        className="text-slate-400 hover:text-slate-700 p-2 ml-auto" title="Ver abonos y notas">
                        {expandido === p.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    </div>
                  </div>
                }
              />
              {expandido === p.id && <div className="-mt-1"><DetalleAbonos prestamoId={p.id} /></div>}
            </Fragment>
          ))}
        </div>

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
