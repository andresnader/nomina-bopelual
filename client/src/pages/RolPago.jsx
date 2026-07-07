import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { money } from '../utils.js';

const NUEVA = { tipo_linea: '', clase: 'INGRESO', monto: '', descripcion: '' };

export default function RolPago() {
  const { id } = useParams();
  const [rol, setRol] = useState(null);
  const [nueva, setNueva] = useState(NUEVA);
  const [error, setError] = useState(null);

  const cargar = () => api.get(`/roles/${id}`).then(setRol).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, [id]);

  const agregar = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await api.post(`/roles/${id}/lineas`, { ...nueva, monto: Number(nueva.monto) });
      setNueva(NUEVA);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const eliminar = async (lineaId) => {
    try {
      await api.del(`/roles/${id}/lineas/${lineaId}`);
      cargar();
    } catch (err) {
      setError(err.message);
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
          <button onClick={() => window.print()} className="border border-white/20 px-4 py-2 rounded-lg text-sm">
            Imprimir
          </button>
        }
      >
        Comprobante — {rol.colaborador_nombre}
      </PageTitle>

      {error && <Card className="mb-4 text-red-300">{error}</Card>}

      <Card className="mb-4 text-sm text-slate-300">
        <div>Período: {rol.periodo_nombre} <Badge estado={rol.periodo_estado} /></div>
        <div>Cédula/RUC: {rol.cedula || '—'} · Cargo: {rol.cargo || '—'}</div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-display font-bold mb-2 text-green-300">Ingresos</h3>
          {ingresos.map((l) => (
            <Linea key={l.id} l={l} editable={editable} onDel={eliminar} />
          ))}
        </Card>
        <Card>
          <h3 className="font-display font-bold mb-2 text-red-300">Descuentos</h3>
          {descuentos.map((l) => (
            <Linea key={l.id} l={l} editable={editable} onDel={eliminar} />
          ))}
        </Card>
      </div>

      {provisiones.length > 0 && (
        <Card className="mt-4">
          <h3 className="font-display font-bold mb-2 text-slate-400">Provisiones (no afectan el neto)</h3>
          {provisiones.map((l) => (
            <Linea key={l.id} l={l} editable={editable} onDel={eliminar} />
          ))}
        </Card>
      )}

      <Card className="mt-4 flex justify-between text-lg font-display font-bold">
        <span>Neto a pagar</span>
        <span className="text-brand-yellow">{money(rol.neto)}</span>
      </Card>

      {editable && (
        <RoleGate roles={['ADMIN', 'RRHH']}>
          <Card className="mt-4">
            <h3 className="font-display font-bold mb-2">Agregar línea</h3>
            <form onSubmit={agregar} className="grid md:grid-cols-4 gap-2">
              <input required placeholder="Tipo (ej: BONO_DESEMPENO)" value={nueva.tipo_linea}
                onChange={(e) => setNueva({ ...nueva, tipo_linea: e.target.value })}
                className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
              <select value={nueva.clase} onChange={(e) => setNueva({ ...nueva, clase: e.target.value })}
                className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm">
                <option value="INGRESO">Ingreso</option>
                <option value="DESCUENTO">Descuento</option>
              </select>
              <input required type="number" step="0.01" placeholder="Monto" value={nueva.monto}
                onChange={(e) => setNueva({ ...nueva, monto: e.target.value })}
                className="bg-brand-darker border border-white/10 rounded px-3 py-2 text-sm" />
              <button className="bg-brand-yellow text-brand-darker font-semibold rounded-lg text-sm">
                Agregar
              </button>
            </form>
          </Card>
        </RoleGate>
      )}
    </div>
  );
}

function Linea({ l, editable, onDel }) {
  return (
    <div className="flex justify-between items-center py-1 text-sm border-b border-white/5 last:border-0">
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
