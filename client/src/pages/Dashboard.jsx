import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money } from '../utils.js';
import { FormAusencia, TablaAusencias } from './Ausencias.jsx';

// Portal del colaborador: sus roles de pago, saldo de vacaciones y solicitudes.
function PortalColaborador({ usuario }) {
  const [col, setCol] = useState(null);
  const [saldo, setSaldo] = useState(null);
  const [ausencias, setAusencias] = useState([]);
  const [error, setError] = useState(null);

  const cargar = () => {
    api.get(`/colaboradores/${usuario.colaborador_id}`).then(setCol).catch((e) => setError(e.message));
    api.get(`/ausencias/saldo/${usuario.colaborador_id}`).then(setSaldo).catch(() => {});
    api.get('/ausencias').then(setAusencias).catch(() => {});
  };
  useEffect(() => { cargar(); }, [usuario.colaborador_id]);

  if (!usuario.colaborador_id) {
    return (
      <Card>
        <p className="text-slate-600">Hola, {usuario.email}.</p>
        <p className="text-sm text-slate-500 mt-1">
          Tu usuario aún no está vinculado a un colaborador — pide a RRHH que lo vincule para ver tus roles de pago y vacaciones.
        </p>
      </Card>
    );
  }
  if (!col) return <Card>{error || 'Cargando…'}</Card>;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Último pago" valor={col.roles_pago[0] ? money(col.roles_pago[0].neto) : '—'} sub={col.roles_pago[0]?.periodo_nombre} />
        <KpiCard titulo="Vacaciones: derecho" valor={saldo ? `${saldo.derecho} días` : '—'} />
        <KpiCard titulo="Vacaciones: tomadas" valor={saldo ? `${saldo.tomados} días` : '—'} />
        <KpiCard titulo="Saldo disponible" valor={saldo ? `${saldo.saldo} días` : '—'} />
      </div>

      {error && <Card className="text-red-600">{error}</Card>}

      <Card>
        <h2 className="font-semibold mb-3">Solicitar vacaciones o permiso</h2>
        <FormAusencia onCreado={() => { setError(null); cargar(); }} onError={setError} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <h2 className="font-semibold p-4 pb-0">Mis solicitudes</h2>
        <TablaAusencias ausencias={ausencias} onCambio={cargar} onError={setError} conColaborador={false} />
      </Card>

      <Card className="p-0 overflow-x-auto">
        <h2 className="font-semibold p-4 pb-0">Mis roles de pago</h2>
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
                  <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">{r.periodo_nombre}</Link>
                </td>
                <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
                <td className="p-3"><Badge estado={r.estado_pago} /></td>
              </tr>
            ))}
            {col.roles_pago.length === 0 && <tr><td colSpan={3} className="p-4 text-slate-500">Aún no tienes roles de pago.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [error, setError] = useState(null);

  const esGestor = ['ADMIN', 'RRHH', 'GERENCIA'].includes(usuario.rol);

  useEffect(() => {
    if (!esGestor) return;
    Promise.all([
      api.get('/periodos'),
      api.get('/colaboradores?activo=true&per_page=all'),
      api.get('/ausencias?estado=SOLICITADA'),
    ])
      .then(([p, c, a]) => {
        setPeriodos(p);
        setColaboradores(c.data || c);
        setPendientes(a);
      })
      .catch((e) => setError(e.message));
  }, [esGestor]);

  if (!esGestor) {
    return (
      <div className="animate-fade-in">
        <PageTitle>Mi portal</PageTitle>
        <PortalColaborador usuario={usuario} />
      </div>
    );
  }

  const ultimo = periodos[0];
  const enBorrador = periodos.filter((p) => p.estado === 'BORRADOR').length;

  return (
    <div className="animate-fade-in">
      <PageTitle>Dashboard</PageTitle>
      {error && <div className="mb-4 p-4 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">{error}</div>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Último período" valor={ultimo ? money(ultimo.total_neto) : '—'} sub={ultimo?.nombre} />
        <KpiCard titulo="Colaboradores activos" valor={colaboradores.length} />
        <KpiCard titulo="Períodos registrados" valor={periodos.length} />
        <KpiCard titulo="En borrador" valor={enBorrador} />
      </div>

      {pendientes.length > 0 && (
        <Card className="mt-4 border-gold-400/60">
          <div className="flex items-center justify-between">
            <p className="text-sm">
              <span className="font-semibold">{pendientes.length}</span> solicitud{pendientes.length !== 1 && 'es'} de ausencia pendiente{pendientes.length !== 1 && 's'} de aprobación.
            </p>
            <Link to="/ausencias" className="btn btn-primary">Revisar</Link>
          </div>
        </Card>
      )}
    </div>
  );
}
