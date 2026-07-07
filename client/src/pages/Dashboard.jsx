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
      <div>
        <PageTitle>Bienvenido</PageTitle>
        <Card>Consulta tus roles de pago desde el menú de tu perfil.</Card>
      </div>
    );
  }

  const ultimo = periodos[0];

  return (
    <div>
      <PageTitle>Dashboard</PageTitle>
      {error && <Card className="mb-4 text-red-300">{error}</Card>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard titulo="Último período" valor={ultimo ? money(ultimo.total_neto) : '—'} sub={ultimo?.nombre} />
        <KpiCard titulo="Colaboradores activos" valor={colaboradores.length} />
        <KpiCard titulo="Períodos registrados" valor={periodos.length} />
        <KpiCard
          titulo="En borrador"
          valor={periodos.filter((p) => p.estado === 'BORRADOR').length}
        />
      </div>
    </div>
  );
}
