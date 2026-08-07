import { useEffect, useState, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
import { fecha } from '../utils.js';

const VACIO = { tipo: 'IESS', nombre: '', cedula: '', email: '', departamento: '', cargo: '', fecha_ingreso: '', clasificacion: 'ADMINISTRATIVO' };
const POR_PAGINA = [10, 25, 50, { label: 'Todos', value: 'all' }];
const COLUMNAS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'empresa', label: 'Unidad de Negocios' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'fecha_ingreso', label: 'Ingreso' },
];

export default function Colaboradores() {
  const toast = useToast();
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [sort, setSort] = useState('nombre');
  const [order, setOrder] = useState('asc');
  const [q, setQ] = useState('');
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);
  const searchRef = useRef(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const params = new URLSearchParams({ sort, order, page: pagina, per_page: porPagina });
      if (q) params.set('q', q);
      const res = await api.get('/colaboradores?' + params.toString());
      setData(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [pagina, porPagina, sort, order, q]);

  useEffect(() => { cargar(); }, [cargar]);

  const totalPaginas = porPagina === 'all' ? 1 : Math.max(1, Math.ceil(total / porPagina));

  const cambiarSort = (key) => {
    if (sort === key) {
      setOrder((o) => (o === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(key);
      setOrder('asc');
    }
    setPagina(1);
  };

  const cambiarPorPagina = (e) => {
    const val = e.target.value;
    setPorPagina(val === 'all' ? 'all' : Number(val));
    setPagina(1);
  };

  const SorterIcon = ({ colKey }) => {
    if (sort !== colKey) return <ArrowUpDown size={14} className="ml-1 shrink-0 text-slate-400" />;
    return order === 'asc'
      ? <ArrowUp size={14} className="ml-1 shrink-0 text-gold-500" />
      : <ArrowDown size={14} className="ml-1 shrink-0 text-gold-500" />;
  };

  const guardar = async (e) => {
    e.preventDefault();
    try {
      const creado = await api.post('/colaboradores', { ...form, fecha_ingreso: form.fecha_ingreso || null });
      setForm(null);
      toast.success('Colaborador creado.');
      (creado?.advertencias ?? []).forEach((a) => toast.warning(a));
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const desde = porPagina === 'all' ? 1 : (pagina - 1) * porPagina + 1;
  const hasta = porPagina === 'all' ? total : Math.min(pagina * porPagina, total);

  return (
    <div>
      <PageTitle
        accion={
          <button
            onClick={() => setForm(VACIO)}
            className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Nuevo colaborador
          </button>
        }
      >
        Colaboradores
      </PageTitle>

      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      {form && (
        <Card className="mb-4">
          <form onSubmit={guardar} className="grid md:grid-cols-2 gap-3">
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="input w-full"
            >
              <option value="IESS">IESS</option>
              <option value="EXTERNO">EXTERNO</option>
            </select>
            <input required placeholder="Nombre" value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className="input w-full" />
            <input placeholder="Cédula/RUC" value={form.cedula}
              onChange={(e) => setForm({ ...form, cedula: e.target.value })}
              className="input w-full" />
            <input placeholder="Departamento" value={form.departamento}
              onChange={(e) => setForm({ ...form, departamento: e.target.value })}
              className="input w-full" />
            <input placeholder="Cargo" value={form.cargo}
              onChange={(e) => setForm({ ...form, cargo: e.target.value })}
              className="input w-full" />
            <select
              value={form.clasificacion}
              onChange={(e) => setForm({ ...form, clasificacion: e.target.value })}
              className="input w-full"
            >
              <option value="ADMINISTRATIVO">Administrativo</option>
              <option value="COMERCIAL">Comercial</option>
            </select>
            <input type="date" value={form.fecha_ingreso}
              onChange={(e) => setForm({ ...form, fecha_ingreso: e.target.value })}
              className="input w-full" />
            <div className="flex gap-2 md:col-span-2">
              <button className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm">
                Guardar
              </button>
              <button type="button" onClick={() => setForm(null)} className="text-slate-500 text-sm px-3">
                Cancelar
              </button>
            </div>
          </form>
        </Card>
      )}

      {/* Buscador + paginación superior */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            placeholder="Buscar por nombre, cédula, departamento…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPagina(1); }}
            className="input w-full pl-9"
          />
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden sm:inline">{total} colaboradores</span>
          <select
            value={porPagina}
            onChange={cambiarPorPagina}
            className="input py-1.5 text-sm"
          >
            {POR_PAGINA.map((o) => {
              const val = typeof o === 'object' ? o.value : o;
              const label = typeof o === 'object' ? o.label : `${o} por página`;
              return <option key={val} value={val}>{label}</option>;
            })}
          </select>
        </div>
      </div>

      <Card className="p-0 overflow-x-auto">
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              {COLUMNAS.map((col) => (
                <th
                  key={col.key}
                  onClick={() => cambiarSort(col.key)}
                  className="p-3 cursor-pointer select-none hover:text-slate-700 transition-colors whitespace-nowrap"
                >
                  <span className="inline-flex items-center">
                    {col.label}
                    <SorterIcon colKey={col.key} />
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="p-8 text-center text-slate-400">
                  <div className="inline-block w-5 h-5 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="p-8 text-center text-slate-400">
                  {q ? 'Sin resultados para esta búsqueda' : 'No hay colaboradores'}
                </td>
              </tr>
            ) : (
              data.map((c) => (
                <tr key={c.id} className="border-b border-slate-200 hover:bg-slate-50">
                  <td className="p-3">
                    <Link to={`/colaboradores/${c.id}`} className="text-gold-600 font-medium hover:underline">
                      {c.nombre}
                    </Link>
                  </td>
                  <td className="p-3"><Badge estado={c.tipo} /></td>
                  <td className="p-3">{c.empresa || '—'}</td>
                  <td className="p-3">{c.departamento || '—'}</td>
                  <td className="p-3 whitespace-nowrap">{fecha(c.fecha_ingreso)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {cargando ? (
            <div className="p-8 text-center text-slate-400">
              <div className="inline-block w-5 h-5 border-2 border-gold-400/30 border-t-gold-400 rounded-full animate-spin" />
            </div>
          ) : data.length === 0 ? (
            <p className="p-8 text-center text-slate-400 text-sm">{q ? 'Sin resultados para esta búsqueda' : 'No hay colaboradores'}</p>
          ) : (
            data.map((c) => (
              <MobileCard
                key={c.id}
                top={
                  <>
                    <Link to={`/colaboradores/${c.id}`} className="text-gold-600 font-medium hover:underline">{c.nombre}</Link>
                    <Badge estado={c.tipo} />
                  </>
                }
                meta={`${c.empresa || '—'} · ${c.departamento || '—'} · Ingreso: ${fecha(c.fecha_ingreso)}`}
              />
            ))
          )}
        </div>
      </Card>

      {/* Paginación inferior */}
      {porPagina !== 'all' && totalPaginas > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>{desde}–{hasta} de {total}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={pagina <= 1}
              className="p-3 md:p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: totalPaginas }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPaginas || Math.abs(p - pagina) <= 1)
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1">…</span>}
                  <button
                    onClick={() => setPagina(p)}
                    className={`min-w-[32px] h-8 rounded text-sm font-medium transition-colors ${
                      p === pagina
                        ? 'bg-gold-400 text-brand-900'
                        : 'hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={pagina >= totalPaginas}
              className="p-3 md:p-1.5 rounded hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
