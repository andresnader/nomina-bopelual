import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import Card from '../components/Card.jsx';
import Badge from '../components/Badge.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money, fecha } from '../utils.js';

export default function ColaboradorDetalle() {
  const { id } = useParams();
  const [col, setCol] = useState(null);
  const [contrato, setContrato] = useState({ sueldo_base: '', fecha_inicio: '', notas: '' });
  const [error, setError] = useState(null);

  const cargar = () => api.get(`/colaboradores/${id}`).then(setCol).catch((e) => setError(e.message));
  useEffect(() => {
    cargar();
  }, [id]);

  const nuevoContrato = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/colaboradores/${id}/contratos`, contrato);
      setContrato({ sueldo_base: '', fecha_inicio: '', notas: '' });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  if (!col) return <Card>{error || 'Cargando…'}</Card>;

  return (
    <div>
      <PageTitle>
        {col.nombre} <Badge estado={col.tipo} />
      </PageTitle>
      {error && <Card className="mb-4 text-red-600">{error}</Card>}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h2 className="font-display font-bold mb-3">Datos</h2>
          <dl className="text-sm space-y-1 text-slate-600">
            <div>Cédula/RUC: {col.cedula || '—'}</div>
            <div>Departamento: {col.departamento || '—'}</div>
            <div>Cargo: {col.cargo || '—'}</div>
            <div>Ingreso: {fecha(col.fecha_ingreso)}</div>
          </dl>
        </Card>

        <Card>
          <h2 className="font-display font-bold mb-3">Nuevo contrato / aumento</h2>
          <form onSubmit={nuevoContrato} className="grid gap-2">
            <input required type="number" step="0.01" placeholder="Sueldo base"
              value={contrato.sueldo_base}
              onChange={(e) => setContrato({ ...contrato, sueldo_base: e.target.value })}
              className="input w-full" />
            <input required type="date" value={contrato.fecha_inicio}
              onChange={(e) => setContrato({ ...contrato, fecha_inicio: e.target.value })}
              className="input w-full" />
            <input placeholder="Notas (motivo)" value={contrato.notas}
              onChange={(e) => setContrato({ ...contrato, notas: e.target.value })}
              className="input w-full" />
            <button className="bg-gold-400 hover:bg-gold-500 text-brand-900 font-semibold px-4 py-2 rounded-lg text-sm">
              Registrar
            </button>
          </form>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="font-display font-bold mb-3">Historial de contratos</h2>
        <table className="w-full text-sm">
          <thead className="text-slate-500 text-left">
            <tr className="border-b border-slate-200">
              <th className="p-2">Sueldo</th>
              <th className="p-2">Desde</th>
              <th className="p-2">Hasta</th>
              <th className="p-2">Notas</th>
            </tr>
          </thead>
          <tbody>
            {col.contratos.map((c) => (
              <tr key={c.id} className="border-b border-slate-200">
                <td className="p-2">{money(c.sueldo_base)}</td>
                <td className="p-2">{fecha(c.fecha_inicio)}</td>
                <td className="p-2">{c.fecha_fin ? fecha(c.fecha_fin) : <Badge estado="APROBADO" />}</td>
                <td className="p-2">{c.notas || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="mt-4">
        <h2 className="font-display font-bold mb-3">Roles de pago</h2>
        <ul className="text-sm space-y-1">
          {col.roles_pago.map((r) => (
            <li key={r.id}>
              <Link to={`/roles/${r.id}`} className="text-gold-600 font-medium hover:underline">
                {money(r.neto)} — {r.estado_pago}
              </Link>
            </li>
          ))}
          {col.roles_pago.length === 0 && <li className="text-slate-500">Sin roles aún.</li>}
        </ul>
      </Card>
    </div>
  );
}
