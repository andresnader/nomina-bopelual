import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import KpiCard from '../components/KpiCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
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

export default function Prestamos() {
  const [respuesta, setRespuesta] = useState({ data: [], total: 0, page: 1, per_page: 10, resumen: {} });
  const [colaboradores, setColaboradores] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [q, setQ] = useState('');
  const [filtroActivo, setFiltroActivo] = useState('true');
  const [pagina, setPagina] = useState(1);
  const [expandido, setExpandido] = useState(null);
  const [error, setError] = useState(null);

  const cargar = () => {
    const params = new URLSearchParams({ page: pagina, per_page: 10 });
    if (q) params.set('q', q);
    if (filtroActivo) params.set('activo', filtroActivo);
    api.get(`/prestamos?${params}`).then(setRespuesta).catch((e) => setError(e.message));
  };

  useEffect(() => { cargar(); }, [q, filtroActivo, pagina]);
  useEffect(() => {
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  }, []);

  const accion = async (fn) => {
    setError(null);
    try { await fn(); cargar(); } catch (e) { setError(e.message); }
  };

  const crear = (e) => {
    e.preventDefault();
    accion(async () => {
      await api.post('/prestamos', { ...form, monto_total: Number(form.monto_total), cuota_quincena: Number(form.cuota_quincena) });
      setForm(VACIO);
    });
  };

  const abonar = (p) => {
    const valor = prompt(`Monto del abono para ${p.colaborador_nombre} (saldo: ${money(p.saldo_pendiente)})`, p.saldo_pendiente);
    if (valor == null) return;
    accion(() => api.post(`/prestamos/${p.id}/abonos`, { monto: Number(valor) }));
  };

  const precancelar = (p) => {
    if (!confirm(`¿Precancelar el préstamo de ${p.colaborador_nombre} por ${money(p.saldo_pendiente)}? El saldo quedará en 0 y dejará de descontarse.`)) return;
    accion(() => api.post(`/prestamos/${p.id}/abonos`, {}));
  };

  const editarCuota = (p) => {
    const valor = prompt(`Nueva cuota por quincena (actual: ${money(p.cuota_quincena)})`, p.cuota_quincena);
    if (valor == null) return;
    accion(() => api.patch(`/prestamos/${p.id}`, { cuota_quincena: Number(valor) }));
  };

  const eliminar = (p) => {
    if (!confirm(`¿Eliminar el préstamo de ${p.colaborador_nombre}? Solo es posible si no tiene pagos aplicados.`)) return;
    accion(() => api.del(`/prestamos/${p.id}`));
  };

  const { data, total, per_page, resumen } = respuesta;
  const totalPaginas = Math.max(Math.ceil(total / per_page), 1);
  const sinPagos = (p) => Number(p.saldo_pendiente) === Number(p.monto_total) && p.abonos === 0;

  return (
    <div className="animate-fade-in">
      <PageTitle>Préstamos</PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

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
              <th className="p-3">Desde</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <>
                <tr key={p.id} className="border-b border-slate-200 hover:bg-slate-50">
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
                      <button onClick={() => editarCuota(p)} className="text-slate-400 hover:text-gold-600 ml-1 align-middle" title="Editar cuota">
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
                        <button onClick={() => abonar(p)} className="btn btn-secondary !px-2.5 !py-1 text-xs">Abonar</button>
                        <button onClick={() => precancelar(p)} className="btn btn-secondary !px-2.5 !py-1 text-xs ml-1">Precancelar</button>
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
                  <tr key={`${p.id}-det`} className="border-b border-slate-200">
                    <td colSpan={7} className="px-3 pb-3"><DetalleAbonos prestamoId={p.id} /></td>
                  </tr>
                )}
              </>
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
    </div>
  );
}
