import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth/AuthContext.jsx';
import KpiCard from '../components/KpiCard.jsx';
import Card from '../components/Card.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { money } from '../utils.js';

export default function Dashboard() {
  const { usuario } = useAuth();
  const [periodos, setPeriodos] = useState([]);
  const [colaboradores, setColaboradores] = useState([]);
  const [error, setError] = useState(null);

  const esGestor = ['ADMIN', 'RRHH', 'GERENCIA'].includes(usuario.rol);

  useEffect(() => {
    if (!esGestor) return;
    Promise.all([api.get('/periodos'), api.get('/colaboradores?activo=true')])
      .then(([p, c]) => {
        setPeriodos(p);
        setColaboradores(c);
      })
      .catch((e) => setError(e.message));
  }, [esGestor]);

  if (!esGestor) {
    return (
      <div className="animate-fade-in">
        <PageTitle>Bienvenido</PageTitle>
        <Card>
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-16 h-16 rounded-full bg-brand-900 flex items-center justify-center mb-4">
              <span className="text-2xl font-display font-bold text-gold-400">{usuario.email?.charAt(0).toUpperCase()}</span>
            </div>
            <p className="text-slate-600 mb-1">Hola, {usuario.email}</p>
            <p className="text-sm text-slate-500">Tus roles de pago estarán disponibles aquí.</p>
          </div>
        </Card>
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
    </div>
  );
}
