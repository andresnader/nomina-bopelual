import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { useToast } from '../components/Toast.jsx';
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
        <table className="hidden md:table w-full text-sm">
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

        <div className="md:hidden space-y-2 p-2">
          {col.roles_pago.length === 0 && <p className="p-4 text-slate-500 text-sm">Aún no tienes roles de pago.</p>}
          {col.roles_pago.map((r) => (
            <MobileCard
              key={r.id}
              top={
                <>
                  <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">{r.periodo_nombre}</Link>
                  <Badge estado={r.estado_pago} />
                </>
              }
              meta={`Neto: ${money(r.neto)}`}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { usuario } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [prestamosResumen, setPrestamosResumen] = useState({});
  const [descuentosActivos, setDescuentosActivos] = useState([]);
  const [sinDocumentos, setSinDocumentos] = useState([]);
  const toast = useToast();

  const esGestor = ['ADMIN', 'RRHH', 'GERENCIA'].includes(usuario.rol);

  useEffect(() => {
    if (!esGestor) return;
    Promise.all([
      api.get('/periodos'),
      api.get('/colaboradores?activo=true&per_page=all'),
      api.get('/ausencias?estado=SOLICITADA'),
      api.get('/prestamos?activo=true&per_page=1'),
      api.get('/descuentos?activo=true'),
      api.get('/reportes/documentos-faltantes'),
    ])
      .then(([p, c, a, pr, d, doc]) => {
        setPeriodos(p);
        setColaboradores(c.data || c);
        setPendientes(a);
        setPrestamosResumen(pr.resumen || {});
        setDescuentosActivos(d);
        setSinDocumentos(doc);
      })
      .catch((e) => toast.error(e.message));
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

  const mesActual = new Date().getMonth();
  const aniversarios = colaboradores.filter(
    (c) => c.fecha_ingreso && new Date(c.fecha_ingreso).getUTCMonth() === mesActual
  );

  const porEmpresa = colaboradores.reduce((acc, c) => {
    const k = c.empresa || 'Sin empresa';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
  const porDepartamento = colaboradores.reduce((acc, c) => {
    const k = c.departamento || 'Sin depto.';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const descuentosMonto = descuentosActivos.reduce((s, d) => s + Number(d.monto), 0);

  return (
    <div className="animate-fade-in">
      <PageTitle>Dashboard</PageTitle>
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

      <h2 className="font-display font-bold text-slate-900 mt-6 mb-3">Talento Humano</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Aniversarios este mes" valor={aniversarios.length}
          sub={aniversarios.slice(0, 3).map((c) => c.nombre.split(' ')[0]).join(', ') || 'Ninguno'} />
        <KpiCard titulo="Préstamos y descuentos activos" valor={(prestamosResumen.activos ?? 0) + descuentosActivos.length}
          sub={`${money((Number(prestamosResumen.cuota_activa) || 0) + descuentosMonto)} / quincena`} />
        <KpiCard titulo="Documentos faltantes" valor={sinDocumentos.length}
          sub={sinDocumentos.length > 0
            ? sinDocumentos.slice(0, 2).map((c) => c.nombre.split(' ')[0]).join(', ') + (sinDocumentos.length > 2 ? ` y ${sinDocumentos.length - 2} más` : '')
            : 'Todos al día'} />
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Por empresa</p>
          {Object.entries(porEmpresa).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-0.5">
              <span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span>
            </div>
          ))}
        </Card>
      </div>
      <Card className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Distribución por departamento</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(porDepartamento).map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-600">{k}</span><span className="font-semibold">{v}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
