import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, FileText, Landmark, BarChart3, Settings } from 'lucide-react';
import { useAuth } from '../auth/AuthContext.jsx';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'RRHH', 'COLABORADOR', 'GERENCIA'] },
  { to: '/colaboradores', icon: Users, label: 'Colaboradores', roles: ['ADMIN', 'RRHH'] },
  { to: '/periodos', icon: CalendarDays, label: 'Períodos', roles: ['ADMIN', 'RRHH', 'GERENCIA'] },
  { to: '/proveedores', icon: FileText, label: 'Proveedores', roles: ['ADMIN', 'RRHH'] },
  { to: '/prestamos', icon: Landmark, label: 'Préstamos', roles: ['ADMIN', 'RRHH'] },
  { to: '/reportes', icon: BarChart3, label: 'Reportes', roles: ['ADMIN', 'RRHH', 'GERENCIA'] },
  { to: '/configuracion', icon: Settings, label: 'Configuración', roles: ['ADMIN'] }
];

export default function Layout({ children }) {
  const { usuario, logout } = useAuth();
  const items = NAV.filter((n) => usuario && n.roles.includes(usuario.rol));

  return (
    <div className="min-h-screen md:flex">
      <aside className="hidden md:flex md:flex-col w-60 bg-brand-dark border-r border-white/5 p-4">
        <div className="font-display font-extrabold text-brand-yellow text-xl mb-8">BOPELUAL</div>
        <nav className="flex-1 space-y-1">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                  isActive ? 'bg-brand-yellow/15 text-brand-yellow' : 'text-slate-300 hover:bg-white/5'
                }`
              }
            >
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 text-xs text-slate-500">
          {usuario?.email}
          <button onClick={logout} className="block text-slate-400 hover:text-slate-200 mt-1">
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="flex-1 p-4 md:p-8 pb-20 md:pb-8">{children}</main>

      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-brand-dark border-t border-white/5 flex justify-around py-2">
        {items.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center text-[10px] ${isActive ? 'text-brand-yellow' : 'text-slate-400'}`
            }
          >
            <Icon size={20} /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
