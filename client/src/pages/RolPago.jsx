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
import { RUBROS_TIPO } from './ColaboradorDetalle.jsx';

const NUEVA = { tipo_linea: '', clase: 'INGRESO', monto: '', descripcion: '' };

export default function RolPago() {
  const { id } = useParams();
  const [rol, setRol] = useState(null);
  const [nueva, setNueva] = useState(NUEVA);
  const [error, setError] = useState(null);
  const [tiposDescuento, setTiposDescuento] = useState([]);
  const toast = useToast();

  const cargar = () => api.get(`/roles/${id}`).then(setRol).catch((e) => setError(e.message));
  useEffect(() => { cargar(); }, [id]);
  useEffect(() => { api.get('/descuentos/tipos').then(setTiposDescuento).catch(() => {}); }, []);

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
      const partes = [];
      if (r.agregadas > 0) partes.push(`${r.agregadas} agregada${r.agregadas !== 1 ? 's' : ''}`);
      if (r.actualizadas > 0) partes.push(`${r.actualizadas} actualizada${r.actualizadas !== 1 ? 's' : ''}`);
      if (partes.length > 0) toast.success(`Líneas ${partes.join(' y ')}.`);
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
        volver={{ to: `/periodos/${rol.periodo_id}`, label: 'Volver al período' }}
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
              <select required value={nueva.tipo_linea}
                onChange={(e) => setNueva({ ...nueva, tipo_linea: e.target.value })}
                className="input w-full">
                <option value="">Tipo…</option>
                {(nueva.clase === 'INGRESO' ? RUBROS_TIPO : tiposDescuento.map((t) => ({ value: t.tipo, label: t.label })))
                  .map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <select value={nueva.clase}
                onChange={(e) => setNueva({ ...nueva, clase: e.target.value, tipo_linea: '' })}
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
          <button onClick={() => onDel(l.id)} className="text-red-400 text-xs -m-2 p-2 md:m-0 md:p-0">✕</button>
        )}
      </span>
    </div>
  );
}
