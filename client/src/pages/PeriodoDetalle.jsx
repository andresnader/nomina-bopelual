import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { money } from '../utils.js';

const EMPRESAS = ['', 'BOPELUAL S.A.', 'CARROS-YA S.A.'];
const GRUPOS = [
  { valor: '', label: 'Todos' },
  { valor: 'ADM', label: 'Administrativo' },
  { valor: 'COMERCIAL', label: 'Comercial' },
  { valor: 'SERV_PROF', label: 'Serv. Profesionales' },
];

// Descarga por grupo el archivo de pago masivo Cash Management (Banco Pichincha).
function ExportarTxtBanco({ periodoId }) {
  const [empresa, setEmpresa] = useState('');
  const [aviso, setAviso] = useState(null);

  const descargar = async (grupo) => {
    setAviso(null);
    const q = new URLSearchParams();
    if (empresa) q.set('empresa', empresa);
    if (grupo) q.set('grupo', grupo);
    const r = await api.get(`/periodos/${periodoId}/txt-pago${q.size ? `?${q}` : ''}`);
    if (r.incluidos > 0) {
      const url = URL.createObjectURL(new Blob([r.contenido], { type: 'text/plain' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: r.archivo });
      a.click();
      URL.revokeObjectURL(url);
    }
    setAviso(r);
  };

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Archivos de pago — Banco Pichincha</h2>
          <p className="text-sm text-muted">TXT Cash Management para transferencias masivas</p>
        </div>
        <select className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
          {EMPRESAS.map((e) => <option key={e} value={e}>{e || 'Ambas empresas'}</option>)}
        </select>
      </div>
      <div className="flex flex-wrap gap-2 mt-4">
        {GRUPOS.map((g) => (
          <button key={g.valor} onClick={() => descargar(g.valor).catch((e) => setAviso({ error: e.message }))}
            className="btn btn-secondary">
            <Download size={15} /> {g.label}
          </button>
        ))}
      </div>
      {aviso?.error && <p className="text-sm text-red-600 mt-3">{aviso.error}</p>}
      {aviso && !aviso.error && (
        <div className="text-sm mt-3 space-y-1">
          <p className="text-muted">
            {aviso.incluidos > 0
              ? <>Archivo <span className="font-medium">{aviso.archivo}</span>: {aviso.incluidos} transferencias por {money(aviso.total)}.</>
              : 'Ninguna transferencia con ese filtro.'}
          </p>
          {aviso.excluidos?.length > 0 && (
            <p className="text-amber-600">
              Excluidos ({aviso.excluidos.length}): {aviso.excluidos.map((e) => `${e.nombre} (${e.motivo})`).join(', ')} — pagar por otro medio o completar su ficha.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function PeriodoDetalle() {
  const { id } = useParams();
  const [periodo, setPeriodo] = useState(null);
  const [error, setError] = useState(null);

  const cargar = () => api.get(`/periodos/${id}`).then(setPeriodo).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, [id]);

  const accion = async (nombre) => {
    setError(null);
    try {
      await api.post(`/periodos/${id}/${nombre}`);
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!periodo) return <Card>{error || 'Cargando…'}</Card>;

  return (
    <div>
      <PageTitle
        accion={
          <RoleGate roles={['RRHH']}>
            <div className="flex gap-2">
              {periodo.estado === 'BORRADOR' && (
                <button onClick={() => accion('aprobar')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm">Aprobar</button>
              )}
              {periodo.estado === 'APROBADO' && (
                <button onClick={() => accion('cerrar')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm">Cerrar</button>
              )}
            </div>
          </RoleGate>
        }
      >
        {periodo.nombre} <Badge estado={periodo.estado} />
      </PageTitle>

      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <RoleGate roles={['ADMIN', 'RRHH']}>
        <ExportarTxtBanco periodoId={id} />
      </RoleGate>

      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Colaborador</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Ingresos</th>
              <th className="p-3 text-right">Descuentos</th>
              <th className="p-3 text-right">Neto</th>
              <th className="p-3">Pago</th>
            </tr>
          </thead>
          <tbody>
            {periodo.roles_pago.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3">
                  <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">
                    {r.colaborador_nombre}
                  </Link>
                </td>
                <td className="p-3"><Badge estado={r.colaborador_tipo} /></td>
                <td className="p-3 text-right">{money(r.total_ingresos)}</td>
                <td className="p-3 text-right">{money(r.total_descuentos)}</td>
                <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
                <td className="p-3"><Badge estado={r.estado_pago} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
