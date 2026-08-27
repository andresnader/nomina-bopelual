import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
import { money, fecha } from '../utils.js';
import { LineChart, Line, ComposedChart, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

// Formato compacto para ejes de gráficas (ej. "$45,2 k") — money() completo se
// reserva para tooltips y tablas, donde el valor exacto importa.
const moneyCompacto = (n) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0));

// Postgres numeric/bigint llegan como string vía pg (sin type parser custom).
// Recharts calcula dominios de eje con comparaciones lexicográficas si no son
// number, así que coercionamos apenas llega la respuesta, no más abajo en el render.
const aNumero = (filas, campos) =>
  filas.map((f) => ({ ...f, ...Object.fromEntries(campos.map((c) => [c, Number(f[c])])) }));

// Estilo compartido de tooltip/leyenda para las 4 gráficas ejecutivas, para que
// se lean como un mismo sistema en vez de widgets sueltos (mismo look que .card).
const chartTooltipStyle = {
  contentStyle: { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', boxShadow: '0 1px 2px 0 rgb(0 0 0 / 0.05)', fontSize: 12, padding: '8px 12px' },
  labelStyle: { color: '#0f172a', fontWeight: 600, marginBottom: 4 },
  itemStyle: { padding: 0 },
};
const chartLegendStyle = { fontSize: 12, color: '#475569', paddingTop: 8 };
const chartAxisTick = { fontSize: 11, fill: '#64748b' };
const chartGridColor = '#e2e8f0';

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
  const [periodoDecimos, setPeriodoDecimos] = useState('');
  const [decimosPeriodo, setDecimosPeriodo] = useState([]);
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

  useEffect(() => {
    if (!periodoDecimos) return setDecimosPeriodo([]);
    api.get(`/reportes/decimos-periodo?periodo_id=${periodoDecimos}`).then(setDecimosPeriodo).catch(() => setDecimosPeriodo([]));
  }, [periodoDecimos]);

  const [empresaFiltro, setEmpresaFiltro] = useState('');
  const [evolucionEjecutiva, setEvolucionEjecutiva] = useState([]);
  const [headcount, setHeadcount] = useState([]);
  const [horasExtrasEvol, setHorasExtrasEvol] = useState([]);
  const [periodoDesglose, setPeriodoDesglose] = useState('');
  const [desglose, setDesglose] = useState([]);

  useEffect(() => {
    const q = empresaFiltro ? `?empresa=${encodeURIComponent(empresaFiltro)}` : '';
    api.get(`/reportes/evolucion-mensual${q}`)
      .then((d) => setEvolucionEjecutiva(aNumero(d, ['total_ingresos', 'total_descuentos', 'neto'])))
      .catch(() => setEvolucionEjecutiva([]));
    api.get(`/reportes/headcount-evolucion${q}`)
      .then((d) => setHeadcount(aNumero(d, ['activos', 'altas', 'bajas'])))
      .catch(() => setHeadcount([]));
    api.get(`/reportes/horas-extras-evolucion${q}`)
      .then((d) => setHorasExtrasEvol(aNumero(d, ['suplementarias', 'extraordinarias'])))
      .catch(() => setHorasExtrasEvol([]));
  }, [empresaFiltro]);

  useEffect(() => {
    if (!periodoDesglose) return setDesglose([]);
    const q = empresaFiltro ? `&empresa=${encodeURIComponent(empresaFiltro)}` : '';
    api.get(`/reportes/desglose-rubros?periodo_id=${periodoDesglose}${q}`)
      .then((d) => setDesglose(aNumero(d, ['total'])))
      .catch(() => setDesglose([]));
  }, [periodoDesglose, empresaFiltro]);

  const periodosCerrados = periodos.filter((p) => p.estado === 'CERRADO');

  const maxNeto = Math.max(...evolucion.map((e) => Number(e.neto)), 1);

  // Query strings de la capa ejecutiva, reusados tanto por los fetches de arriba
  // como por los botones de descarga CSV, para que el archivo descargado coincida
  // siempre con lo que está en pantalla.
  const qEmpresaExec = empresaFiltro ? `?empresa=${encodeURIComponent(empresaFiltro)}` : '';
  const qDesglose = periodoDesglose
    ? `?periodo_id=${periodoDesglose}${empresaFiltro ? `&empresa=${encodeURIComponent(empresaFiltro)}` : ''}`
    : '';

  // Rotación del último período (bajas / activos * 100), con guarda de división por cero.
  const ultimoHeadcount = headcount[headcount.length - 1];
  const rotacionUltima = ultimoHeadcount && ultimoHeadcount.activos !== 0
    ? (ultimoHeadcount.bajas / ultimoHeadcount.activos) * 100
    : null;

  // El backend agrupa por (tipo_linea, clase), así que un mismo tipo_linea puede
  // venir dos veces (INGRESO y DESCUENTO). Pivotamos a un objeto por tipo_linea con
  // una columna por clase para que ninguna de las dos barras tape a la otra.
  const desglosePorTipo = (() => {
    const porTipo = new Map();
    for (const d of desglose) {
      const fila = porTipo.get(d.tipo_linea) || { tipo_linea: d.tipo_linea, ingreso: 0, descuento: 0 };
      if (d.clase === 'INGRESO') fila.ingreso = d.total;
      else fila.descuento = d.total;
      porTipo.set(d.tipo_linea, fila);
    }
    return [...porTipo.values()];
  })();

  return (
    <div className="animate-fade-in">
      <PageTitle>Reportes</PageTitle>

      <div className="mb-4">
        <p className="table-header mb-2">Panorama ejecutivo</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-muted max-w-md">
            Tendencias de costo, headcount y horas extras a lo largo del tiempo — filtra por empresa o mira el consolidado.
          </p>
          <div>
            <label htmlFor="empresaFiltro" className="label">Empresa</label>
            <select id="empresaFiltro" value={empresaFiltro} onChange={(e) => setEmpresaFiltro(e.target.value)} className="input w-56">
              <option value="">Todas (consolidado)</option>
              <option>BOPELUAL S.A.</option>
              <option>CARROS-YA S.A.</option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card>
          <h2 className="font-display font-bold mb-1">Costo de nómina en el tiempo</h2>
          <p className="text-sm text-muted mb-3">Ingresos, descuentos y neto por período — todo el histórico.</p>
          {evolucionEjecutiva.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-slate-400">Sin períodos generados aún.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={evolucionEjecutiva} margin={{ bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                <XAxis dataKey="nombre" tick={chartAxisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={moneyCompacto} width={64} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                <Legend wrapperStyle={chartLegendStyle} iconType="circle" iconSize={8} />
                <Line type="monotone" dataKey="total_ingresos" name="Ingresos" stroke="#059669" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="total_descuentos" name="Descuentos" stroke="#dc2626" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="neto" name="Neto" stroke="#d49a0f" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className="font-display font-bold">Headcount y rotación</h2>
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2 py-1 whitespace-nowrap">
              Rotación último período: {rotacionUltima === null ? 'N/D' : `${rotacionUltima.toFixed(1)}%`}
            </span>
          </div>
          <p className="text-sm text-muted mb-3">Activos, altas y bajas por período, desde los vínculos de empleo.</p>
          <div className="flex justify-end mb-2">
            <button onClick={descargar(`/reportes/headcount-evolucion.csv${qEmpresaExec}`, 'headcount-evolucion.csv')} className="btn btn-secondary text-xs">
              Descargar CSV
            </button>
          </div>
          {headcount.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-slate-400">Sin períodos generados aún.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={headcount} margin={{ bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                <XAxis dataKey="nombre" tick={chartAxisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                <Tooltip {...chartTooltipStyle} />
                <Legend wrapperStyle={chartLegendStyle} iconType="circle" iconSize={8} />
                <Bar dataKey="altas" name="Altas" fill="#059669" radius={[3, 3, 0, 0]} />
                <Bar dataKey="bajas" name="Bajas" fill="#dc2626" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="activos" name="Activos" stroke="#0f172a" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h2 className="font-display font-bold mb-1">Costo de horas extras</h2>
          <p className="text-sm text-muted mb-3">Suplementarias (50%) vs. extraordinarias (100%) ya aplicadas a nómina, por período.</p>
          <div className="flex justify-end mb-2">
            <button onClick={descargar(`/reportes/horas-extras-evolucion.csv${qEmpresaExec}`, 'horas-extras-evolucion.csv')} className="btn btn-secondary text-xs">
              Descargar CSV
            </button>
          </div>
          {horasExtrasEvol.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center">
              <p className="text-sm text-slate-400">Sin horas extras aplicadas aún.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={horasExtrasEvol} margin={{ bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                <XAxis dataKey="nombre" tick={chartAxisTick} axisLine={{ stroke: '#cbd5e1' }} tickLine={false} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={moneyCompacto} width={64} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                <Legend wrapperStyle={chartLegendStyle} iconType="circle" iconSize={8} />
                <Bar dataKey="suplementarias" name="Suplementaria (50%)" stackId="he" fill="#0ea5e9" radius={[0, 0, 0, 0]} />
                <Bar dataKey="extraordinarias" name="Extraordinaria (100%)" stackId="he" fill="#7c3aed" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card>
          <h2 className="font-display font-bold mb-1">Desglose de rubros de un período</h2>
          <p className="text-sm text-muted mb-3">Composición del costo (IESS, décimos, fondos, horas extras, rubros...) de un período ya cerrado.</p>
          <div className="flex gap-2 flex-wrap mb-3">
            <select value={periodoDesglose} onChange={(e) => setPeriodoDesglose(e.target.value)} className="input flex-1 min-w-48">
              <option value="">Elige un período cerrado</option>
              {periodosCerrados.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <button onClick={descargar(`/reportes/desglose-rubros.csv${qDesglose}`, `desglose-rubros-${periodoDesglose}.csv`)}
              disabled={!periodoDesglose} className="btn btn-primary disabled:opacity-40">
              Descargar CSV
            </button>
          </div>
          {desglose.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center">
              <p className="text-sm text-slate-400">{periodoDesglose ? 'Sin rubros en este período.' : 'Elige un período para ver el desglose.'}</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={desglosePorTipo} layout="vertical" margin={{ bottom: 8, left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                <XAxis type="number" tick={chartAxisTick} axisLine={false} tickLine={false} tickFormatter={moneyCompacto} />
                <YAxis type="category" dataKey="tipo_linea" tick={chartAxisTick} axisLine={false} tickLine={false} width={140} />
                <Tooltip {...chartTooltipStyle} formatter={(v) => money(v)} />
                <Legend wrapperStyle={chartLegendStyle} iconType="circle" iconSize={8} />
                <Bar dataKey="ingreso" name="Ingreso" fill="#059669" radius={[0, 3, 3, 0]} />
                <Bar dataKey="descuento" name="Descuento" fill="#dc2626" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      <p className="table-header mb-2">Reportes operativos</p>

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
        <table className="hidden md:table w-full text-sm">
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

        <div className="md:hidden space-y-2">
          {costo.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin datos.</p>}
          {costo.map((c) => (
            <MobileCard
              key={c.departamento}
              top={
                <>
                  <span className="font-medium text-slate-800">{c.departamento}</span>
                  <span className="font-semibold text-slate-700">{money(seleccion ? c.neto : c.total_sueldos)}</span>
                </>
              }
              meta={seleccion
                ? `Ingresos ${money(c.total_ingresos)} · Descuentos ${money(c.total_descuentos)}`
                : `Aporte patronal (12.15%) ${money(c.aporte_patronal)}`}
            />
          ))}
        </div>
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
        <table className="hidden md:table w-full text-sm">
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

        <div className="md:hidden space-y-2">
          {retenciones.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin facturas registradas.</p>}
          {retenciones.map((r, i) => (
            <MobileCard
              key={i}
              top={
                <>
                  <span className="font-medium text-slate-800">{r.proveedor}</span>
                  <span className="font-semibold text-slate-700">{money(r.total_neto)}</span>
                </>
              }
              meta={`${fecha(r.mes)} · Bruto ${money(r.total_bruto)} · Retención ${money(r.total_retencion)}`}
            />
          ))}
        </div>
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
        <table className="hidden md:table w-full text-sm">
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

        <div className="md:hidden space-y-2">
          {provisiones.length === 0 && <p className="p-2 text-slate-500 text-sm">Sin provisiones para este año.</p>}
          {provisiones.map((p, i) => (
            <MobileCard
              key={i}
              top={<span className="font-medium text-slate-800">{p.colaborador}</span>}
              meta={`3ro ${money(p.decimo_tercero)} · 4to ${money(p.decimo_cuarto)} · Fondos ${money(p.fondos_reserva)} · Utilidades ${money(p.utilidades)}`}
            />
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <h2 className="font-display font-bold mb-1">Décimos y fondos de reserva por período</h2>
        <p className="text-sm text-muted mb-3">
          Desglose real de décimo tercero, décimo cuarto y fondos de reserva generados en un período específico ya cerrado — para conciliar contra el rol de pago de ese mes.
        </p>
        <div className="flex gap-2 flex-wrap mb-4">
          <select value={periodoDecimos} onChange={(e) => setPeriodoDecimos(e.target.value)} className="input flex-1 min-w-48">
            <option value="">Elige un período cerrado</option>
            {periodosCerrados.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <button onClick={descargar(`/reportes/decimos-periodo.csv?periodo_id=${periodoDecimos}`, `decimos-periodo-${periodoDecimos}.csv`)}
            disabled={!periodoDecimos} className="btn btn-primary disabled:opacity-40">
            Descargar CSV
          </button>
        </div>
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Colaborador</th>
              <th className="p-2 text-right">Décimo tercero</th>
              <th className="p-2 text-right">Décimo cuarto</th>
              <th className="p-2 text-right">Fondos de reserva</th>
            </tr>
          </thead>
          <tbody>
            {decimosPeriodo.map((d, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="p-2">{d.colaborador}</td>
                <td className="p-2 text-right">{money(d.decimo_tercero)}</td>
                <td className="p-2 text-right">{money(d.decimo_cuarto)}</td>
                <td className="p-2 text-right">{money(d.fondos_reserva)}</td>
              </tr>
            ))}
            {decimosPeriodo.length === 0 && (
              <tr><td colSpan={4} className="p-2 text-slate-500">{periodoDecimos ? 'Sin décimos en este período.' : 'Elige un período para ver el detalle.'}</td></tr>
            )}
          </tbody>
        </table>

        <div className="md:hidden space-y-2">
          {decimosPeriodo.length === 0 && (
            <p className="p-2 text-slate-500 text-sm">{periodoDecimos ? 'Sin décimos en este período.' : 'Elige un período para ver el detalle.'}</p>
          )}
          {decimosPeriodo.map((d, i) => (
            <MobileCard
              key={i}
              top={<span className="font-medium text-slate-800">{d.colaborador}</span>}
              meta={`3ro ${money(d.decimo_tercero)} · 4to ${money(d.decimo_cuarto)} · Fondos ${money(d.fondos_reserva)}`}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
