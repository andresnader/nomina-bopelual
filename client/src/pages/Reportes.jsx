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
