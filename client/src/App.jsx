import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Colaboradores from './pages/Colaboradores.jsx';
import ColaboradorDetalle from './pages/ColaboradorDetalle.jsx';
import Periodos from './pages/Periodos.jsx';
import PeriodoDetalle from './pages/PeriodoDetalle.jsx';
import RolPago from './pages/RolPago.jsx';
import Proveedores from './pages/Proveedores.jsx';
import Prestamos from './pages/Prestamos.jsx';
import Reportes from './pages/Reportes.jsx';
import Configuracion from './pages/Configuracion.jsx';

export default function App() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div className="min-h-screen grid place-items-center text-slate-400">Cargando…</div>;
  if (!usuario) return <Login />;
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/colaboradores" element={<Colaboradores />} />
        <Route path="/colaboradores/:id" element={<ColaboradorDetalle />} />
        <Route path="/periodos" element={<Periodos />} />
        <Route path="/periodos/:id" element={<PeriodoDetalle />} />
        <Route path="/roles/:id" element={<RolPago />} />
        <Route path="/proveedores" element={<Proveedores />} />
        <Route path="/prestamos" element={<Prestamos />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
