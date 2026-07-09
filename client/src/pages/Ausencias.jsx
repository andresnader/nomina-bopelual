import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Pencil, X } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { fecha } from '../utils.js';

const TIPOS_AUSENCIA = ['VACACIONES', 'PERMISO', 'ENFERMEDAD', 'LICENCIA'];
const ESTILO_ESTADO = {
  SOLICITADA: 'badge bg-gold-100 text-gold-800',
  APROBADA: 'badge bg-emerald-100 text-emerald-700',
  RECHAZADA: 'badge bg-red-100 text-red-700',
};

// Formulario reutilizado en la bandeja RRHH, la ficha y el portal del colaborador.
export function FormAusencia({ colaboradorId, colaboradores, onCreado, onError }) {
  const [form, setForm] = useState({ colaborador_id: colaboradorId || '', tipo: 'VACACIONES', fecha_desde: '', fecha_hasta: '', motivo: '' });

  const crear = async (e) => {
    e.preventDefault();
    try {
      await api.post('/ausencias', { ...form, colaborador_id: colaboradorId || form.colaborador_id || undefined });
      setForm({ ...form, fecha_desde: '', fecha_hasta: '', motivo: '' });
      onCreado();
    } catch (err) {
      onError(err.message);
    }
  };

  return (
    <form onSubmit={crear} className="grid md:grid-cols-5 gap-2">
      {colaboradores && (
        <select required className="input w-full" value={form.colaborador_id}
          onChange={(e) => setForm({ ...form, colaborador_id: e.target.value })}>
          <option value="">Colaborador…</option>
          {colaboradores.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      )}
      <select className="input w-full" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
        {TIPOS_AUSENCIA.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
      <input required type="date" className="input w-full" value={form.fecha_desde}
        onChange={(e) => setForm({ ...form, fecha_desde: e.target.value })} />
      <input required type="date" className="input w-full" value={form.fecha_hasta}
        onChange={(e) => setForm({ ...form, fecha_hasta: e.target.value })} />
      <button className="btn btn-primary">Solicitar</button>
      <input placeholder="Motivo (opcional)" className={`input w-full ${colaboradores ? 'md:col-span-5' : 'md:col-span-4'}`}
        value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} />
    </form>
  );
}

export function TablaAusencias({ ausencias, onCambio, onError, conColaborador = true, gestionable = false }) {
  const toast = useToast();
  const [editando, setEditando] = useState(null);

  const decidir = async (a, accion) => {
    try { await api.post(`/ausencias/${a.id}/${accion}`); onCambio(); }
    catch (e) { onError(e.message); }
  };

  const guardarEdicion = async (e) => {
    e.preventDefault();
    try {
      await api.patch(`/ausencias/${editando.id}`, {
        tipo: editando.tipo,
        fecha_desde: editando.fecha_desde,
        fecha_hasta: editando.fecha_hasta,
        motivo: editando.motivo || null,
      });
      toast.success('Ausencia actualizada.');
      setEditando(null);
      onCambio();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
    <table className="w-full text-sm">
      <thead className="text-slate-500 text-left">
        <tr className="border-b border-slate-200">
          {conColaborador && <th className="p-3">Colaborador</th>}
          <th className="p-3">Tipo</th>
          <th className="p-3">Desde</th>
          <th className="p-3">Hasta</th>
          <th className="p-3 text-right">Días</th>
          <th className="p-3">Estado</th>
          <th className="p-3">Motivo</th>
          {gestionable && <th className="p-3"></th>}
        </tr>
      </thead>
      <tbody>
        {ausencias.map((a) => (
          <tr key={a.id} className="border-b border-slate-200 hover:bg-slate-50">
            {conColaborador && (
              <td className="p-3">
                <Link to={`/colaboradores/${a.colaborador_id}`} className="text-gold-600 font-medium hover:underline">
                  {a.colaborador_nombre}
                </Link>
              </td>
            )}
            <td className="p-3">{a.tipo}</td>
            <td className="p-3">{fecha(a.fecha_desde)}</td>
            <td className="p-3">{fecha(a.fecha_hasta)}</td>
            <td className="p-3 text-right">{Number(a.dias)}</td>
            <td className="p-3"><span className={ESTILO_ESTADO[a.estado]}>{a.estado}</span></td>
            <td className="p-3 text-slate-500">{a.motivo || '—'}</td>
            {gestionable && (
              <td className="p-3 text-right whitespace-nowrap">
                {a.estado === 'SOLICITADA' && (
                  <RoleGate roles={['ADMIN', 'RRHH']}>
                    <button onClick={() => setEditando({ ...a, fecha_desde: a.fecha_desde?.slice(0, 10), fecha_hasta: a.fecha_hasta?.slice(0, 10) })}
                      title="Editar" className="text-slate-400 hover:text-gold-600 rounded p-1.5"><Pencil size={16} /></button>
                    <button onClick={() => decidir(a, 'aprobar')} title="Aprobar"
                      className="text-emerald-600 hover:bg-emerald-50 rounded p-1.5"><Check size={16} /></button>
                    <button onClick={() => decidir(a, 'rechazar')} title="Rechazar"
                      className="text-red-600 hover:bg-red-50 rounded p-1.5"><X size={16} /></button>
                  </RoleGate>
                )}
              </td>
            )}
          </tr>
        ))}
        {ausencias.length === 0 && (
          <tr><td colSpan={8} className="p-4 text-slate-500">Sin ausencias registradas.</td></tr>
        )}
      </tbody>
    </table>

    <Modal open={!!editando} onClose={() => setEditando(null)}
      title="Editar ausencia" size="md"
      footer={<button type="submit" form="form-editar-ausencia" className="btn btn-primary">Guardar cambios</button>}>
      <form id="form-editar-ausencia" onSubmit={guardarEdicion} className="grid gap-3">
        <label className="text-sm text-slate-600">Tipo
          <select className="input w-full mt-1" value={editando?.tipo ?? ''}
            onChange={(e) => setEditando({ ...editando, tipo: e.target.value })}>
            {TIPOS_AUSENCIA.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm text-slate-600">Desde
            <input required type="date" className="input w-full mt-1"
              value={editando?.fecha_desde ?? ''}
              onChange={(e) => setEditando({ ...editando, fecha_desde: e.target.value })} />
          </label>
          <label className="text-sm text-slate-600">Hasta
            <input required type="date" className="input w-full mt-1"
              value={editando?.fecha_hasta ?? ''}
              onChange={(e) => setEditando({ ...editando, fecha_hasta: e.target.value })} />
          </label>
        </div>
        <label className="text-sm text-slate-600">Motivo
          <input className="input w-full mt-1" value={editando?.motivo ?? ''}
            onChange={(e) => setEditando({ ...editando, motivo: e.target.value })} />
        </label>
      </form>
    </Modal>
    </>
  );
}

export default function Ausencias() {
  const [ausencias, setAusencias] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [error, setError] = useState(null);

  const cargar = () => api.get('/ausencias').then(setAusencias).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
    api.get('/colaboradores?activo=true&per_page=all').then((r) => setColaboradores(r.data)).catch(() => {});
  }, []);

  const pendientes = ausencias.filter((a) => a.estado === 'SOLICITADA');

  return (
    <div className="animate-fade-in">
      <PageTitle>Ausencias</PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <RoleGate roles={['ADMIN', 'RRHH']}>
        <Card className="mb-4">
          <h2 className="font-semibold mb-4">Registrar ausencia</h2>
          <FormAusencia colaboradores={colaboradores} onCreado={() => { setError(null); cargar(); }} onError={setError} />
        </Card>
      </RoleGate>

      {pendientes.length > 0 && (
        <Card className="p-0 overflow-x-auto mb-4 border-gold-400/60">
          <h2 className="font-semibold p-4 pb-0">Pendientes de aprobación ({pendientes.length})</h2>
          <TablaAusencias ausencias={pendientes} onCambio={cargar} onError={setError} gestionable />
        </Card>
      )}

      <Card className="p-0 overflow-x-auto">
        <h2 className="font-semibold p-4 pb-0">Historial</h2>
        <TablaAusencias ausencias={ausencias.filter((a) => a.estado !== 'SOLICITADA')} onCambio={cargar} onError={setError} />
      </Card>
    </div>
  );
}
