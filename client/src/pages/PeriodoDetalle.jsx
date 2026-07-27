import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import MobileCard from '../components/MobileCard.jsx';
import PageTitle from '../components/PageTitle.jsx';
import RoleGate from '../components/RoleGate.jsx';
import { useToast } from '../components/Toast.jsx';
import { money } from '../utils.js';

const EMPRESAS = ['', 'BOPELUAL S.A.', 'CARROS-YA S.A.'];
const GRUPOS = [
  { valor: '', label: 'Todos' },
  { valor: 'ADM', label: 'Administrativo' },
  { valor: 'COMERCIAL', label: 'Comercial' },
  { valor: 'SERV_PROF', label: 'Serv. Profesionales' },
];

const TIPOS_PAGO = [
  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  { valor: 'CHEQUE', label: 'Cheque' },
  { valor: 'PENDIENTE', label: 'Pendiente' },
];
const labelTipoPago = (v) => TIPOS_PAGO.find((t) => t.valor === v)?.label ?? v;

function descargarBlob(nombre, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  a.click();
  URL.revokeObjectURL(url);
}

function base64ABlob(b64, tipo) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

// Sección final del período: genera la vista de la nómina con la marca de
// pago por TXT por colaborador, y las descargas del Excel (todos) y del TXT
// del banco (solo marcados).
function GenerarNomina({ periodoId, filas, empresa }) {
  const [generada, setGenerada] = useState(false);
  const [aviso, setAviso] = useState(null);
  const toast = useToast();

  const descargarTxt = async (grupo) => {
    setAviso(null);
    const q = new URLSearchParams();
    if (empresa) q.set('empresa', empresa);
    if (grupo) q.set('grupo', grupo);
    const r = await api.get(`/periodos/${periodoId}/txt-pago${q.size ? `?${q}` : ''}`);
    if (r.incluidos > 0) {
      descargarBlob(r.archivo, new Blob([r.contenido], { type: 'text/plain' }));
    }
    setAviso(r);
  };

  const descargarExcel = async () => {
    setAviso(null);
    const r = await api.get(`/periodos/${periodoId}/excel`);
    descargarBlob(
      r.archivo,
      base64ABlob(r.contenidoBase64, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    );
    toast.success(`Excel ${r.archivo}: ${r.incluidos} colaboradores por ${money(r.total)}.`);
  };

  if (!generada) {
    return (
      <Card>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">Generar nómina</h2>
            <p className="text-sm text-muted">Arma la nómina del período para exportarla a Excel y generar el TXT de pago del banco</p>
          </div>
          <button onClick={() => setGenerada(true)} className="btn btn-primary">
            <FileSpreadsheet size={15} /> Generar nómina
          </button>
        </div>
      </Card>
    );
  }

  const marcados = filas.filter((r) => r.tipo_pago === 'TRANSFERENCIA');
  const totalMarcados = marcados.reduce((s, r) => s + Number(r.neto), 0);

  return (
    <Card className="mb-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Nómina generada</h2>
          <p className="text-sm text-muted">
            {filas.length} colaboradores · {marcados.length} por transferencia (TXT) por {money(totalMarcados)}
          </p>
        </div>
        <button onClick={() => descargarExcel().catch((e) => setAviso({ error: e.message }))}
          className="btn btn-primary">
          <FileSpreadsheet size={15} /> Guardar en Excel
        </button>
      </div>

      <div className="overflow-x-auto -mx-4 md:mx-0 mt-4">
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Colaborador</th>
              <th className="p-3">Empresa</th>
              <th className="p-3 text-right">Ingresos</th>
              <th className="p-3 text-right">Descuentos</th>
              <th className="p-3 text-right">Neto</th>
              <th className="p-3">Tipo de pago</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3 font-medium">{r.colaborador_nombre}</td>
                <td className="p-3">{r.colaborador_empresa || '—'}</td>
                <td className="p-3 text-right">{money(r.total_ingresos)}</td>
                <td className="p-3 text-right">{money(r.total_descuentos)}</td>
                <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
                <td className="p-3">{labelTipoPago(r.tipo_pago)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="md:hidden space-y-2">
          {filas.map((r) => (
            <MobileCard
              key={r.id}
              top={
                <>
                  <span className="font-medium">{r.colaborador_nombre}</span>
                  <span className="font-semibold text-slate-700">{money(r.neto)}</span>
                </>
              }
              meta={
                <span className="flex items-center justify-between">
                  <span>{r.colaborador_empresa || '—'}</span>
                  <span className="text-slate-600">{labelTipoPago(r.tipo_pago)}</span>
                </span>
              }
              footer={
                <>
                  <span>Ingresos {money(r.total_ingresos)}</span>
                  <span>Descuentos {money(r.total_descuentos)}</span>
                </>
              }
            />
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-dashed border-slate-200">
        <h3 className="font-semibold text-sm">TXT de pago — Banco Pichincha</h3>
        <p className="text-sm text-muted mb-3">Solo incluye a los marcados en "Pagar TXT" (Cash Management para transferencias masivas)</p>
        <div className="flex flex-wrap gap-2">
          {GRUPOS.map((g) => (
            <button key={g.valor} onClick={() => descargarTxt(g.valor).catch((e) => setAviso({ error: e.message }))}
              className="btn btn-secondary">
              <Download size={15} /> {g.label}
            </button>
          ))}
        </div>
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

// Tarjeta de aprobación por grupo (empresa × grupo). Cada grupo se aprueba y
// bloquea de edición por separado mientras el período está en BORRADOR.
function GruposPeriodo({ periodoId, grupos, onCambio }) {
  const toast = useToast();
  const accion = async (ruta, empresa, grupo) => {
    try {
      await api.post(`/periodos/${periodoId}/grupos/${ruta}`, { empresa, grupo });
      onCambio();
    } catch (e) { toast.error(e.message); }
  };
  if (!grupos?.length) return null;
  return (
    <Card className="mb-4">
      <h2 className="font-semibold">Grupos del período</h2>
      <p className="text-sm text-muted mb-3">Aprueba y bloquea cada grupo por separado. Al aprobar, sus roles quedan bloqueados de edición.</p>
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Empresa</th><th className="p-3">Grupo</th>
              <th className="p-3 text-right">Colaboradores</th><th className="p-3 text-right">Neto</th>
              <th className="p-3">Estado</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={`${g.empresa}-${g.grupo}`} className="border-b border-slate-200">
                <td className="p-3">{g.empresa}</td>
                <td className="p-3">{g.etiqueta}</td>
                <td className="p-3 text-right">{g.colaboradores}</td>
                <td className="p-3 text-right">{money(g.total_neto)}</td>
                <td className="p-3"><Badge estado={g.aprobado ? 'APROBADO' : 'PENDIENTE'} /></td>
                <td className="p-3 text-right">
                  {g.aprobado
                    ? <button onClick={() => accion('reabrir', g.empresa, g.grupo)} className="btn btn-secondary">Reabrir</button>
                    : <button onClick={() => accion('aprobar', g.empresa, g.grupo)} className="btn btn-primary">Aprobar grupo</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function PeriodoDetalle() {
  const { id } = useParams();
  const [periodo, setPeriodo] = useState(null);
  const [error, setError] = useState(null);
  const [empresa, setEmpresa] = useState('');
  const toast = useToast();

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

  const sincronizar = async () => {
    try {
      const r = await api.post(`/periodos/${id}/sincronizar`);
      const partes = [];
      if (r.agregadas > 0) partes.push(`${r.agregadas} agregada${r.agregadas !== 1 ? 's' : ''}`);
      if (r.actualizadas > 0) partes.push(`${r.actualizadas} actualizada${r.actualizadas !== 1 ? 's' : ''}`);
      if (partes.length > 0) toast.success(`Líneas ${partes.join(' y ')} en ${r.roles} rol${r.roles !== 1 ? 'es' : ''}.`);
      else toast.info('Ya estaba al día.');
      cargar();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Cambia el tipo de pago de un rol (Cheque/Transferencia/Pendiente) y
  // actualiza el estado local sin recargar todo el período.
  const cambiarTipoPago = async (rol, tipo_pago) => {
    try {
      const r = await api.patch(`/periodos/${id}/roles/${rol.id}/tipo-pago`, { tipo_pago });
      setPeriodo((p) => ({
        ...p,
        roles_pago: p.roles_pago.map((x) => (x.id === rol.id ? { ...x, tipo_pago: r.tipo_pago } : x)),
      }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!periodo) return <Card>{error || 'Cargando…'}</Card>;

  const filas = periodo.roles_pago.filter((r) => !empresa || r.colaborador_empresa === empresa);

  return (
    <div>
      <PageTitle
        volver={{ to: '/periodos', label: 'Volver a Períodos' }}
        accion={
          <div className="flex gap-2">
            {periodo.estado === 'BORRADOR' && (
              <RoleGate roles={['ADMIN', 'RRHH']}>
                <button onClick={sincronizar} className="btn btn-secondary">
                  <RefreshCw size={15} /> Sincronizar descuentos y préstamos
                </button>
              </RoleGate>
            )}
            <RoleGate roles={['ADMIN', 'RRHH']}>
              {periodo.estado === 'BORRADOR' && (
                <button onClick={() => accion('aprobar')}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg text-sm">Aprobar</button>
              )}
              {periodo.estado === 'APROBADO' && (
                <button onClick={() => accion('cerrar')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-2 rounded-lg text-sm">Cerrar</button>
              )}
            </RoleGate>
          </div>
        }
      >
        {periodo.nombre} <Badge estado={periodo.estado} />
      </PageTitle>

      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <Card className="mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold">Colaboradores del período</h2>
            <p className="text-sm text-muted">Filtra los roles de pago por empresa para revisar sus nóminas</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted">Empresa</label>
            <select className="input" value={empresa} onChange={(e) => setEmpresa(e.target.value)}>
              {EMPRESAS.map((e) => <option key={e} value={e}>{e || 'Ambas empresas'}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {periodo.estado === 'BORRADOR' && (
        <RoleGate roles={['ADMIN', 'RRHH']}>
          <GruposPeriodo periodoId={id} grupos={periodo.grupos} onCambio={cargar} />
        </RoleGate>
      )}

      <Card className="p-0 overflow-x-auto mb-4">
        <table className="hidden md:table w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-3">Colaborador</th>
              <th className="p-3">Empresa</th>
              <th className="p-3">Tipo</th>
              <th className="p-3 text-right">Ingresos</th>
              <th className="p-3 text-right">Descuentos</th>
              <th className="p-3 text-right">Neto</th>
              <th className="p-3">Tipo de pago</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r) => (
              <tr key={r.id} className="border-b border-slate-200 hover:bg-slate-50">
                <td className="p-3">
                  <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">
                    {r.colaborador_nombre}
                  </Link>
                </td>
                <td className="p-3 text-slate-600">{r.colaborador_empresa || '—'}</td>
                <td className="p-3"><Badge estado={r.colaborador_tipo} /></td>
                <td className="p-3 text-right">{money(r.total_ingresos)}</td>
                <td className="p-3 text-right">{money(r.total_descuentos)}</td>
                <td className="p-3 text-right font-semibold">{money(r.neto)}</td>
                <td className="p-3">
                  <select className="input" value={r.tipo_pago}
                    onChange={(e) => cambiarTipoPago(r, e.target.value)}>
                    {TIPOS_PAGO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </td>
              </tr>
            ))}
            {filas.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-500">No hay colaboradores para el filtro seleccionado</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="md:hidden space-y-2 p-2">
          {filas.length === 0 && <p className="p-4 text-slate-500 text-sm">No hay colaboradores para el filtro seleccionado</p>}
          {filas.map((r) => (
            <MobileCard
              key={r.id}
              top={
                <>
                  <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">{r.colaborador_nombre}</Link>
                  <select className="input" value={r.tipo_pago}
                    onChange={(e) => cambiarTipoPago(r, e.target.value)}>
                    {TIPOS_PAGO.map((t) => <option key={t.valor} value={t.valor}>{t.label}</option>)}
                  </select>
                </>
              }
              meta={
                <span className="flex items-center justify-between">
                  <span>{r.colaborador_empresa || '—'} · <Badge estado={r.colaborador_tipo} /></span>
                  <span className="font-semibold text-slate-700">{money(r.neto)}</span>
                </span>
              }
              footer={
                <>
                  <span>Ingresos {money(r.total_ingresos)}</span>
                  <span>Descuentos {money(r.total_descuentos)}</span>
                </>
              }
            />
          ))}
        </div>
      </Card>

      <RoleGate roles={['ADMIN', 'RRHH']}>
        <GenerarNomina periodoId={id} filas={filas} empresa={empresa} />
      </RoleGate>
    </div>
  );
}
