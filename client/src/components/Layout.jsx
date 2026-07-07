import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarDays, FileText, Landmark, BarChart3, Settings, LogOut } from 'lucide-react';
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
    <div className="min-h-screen md:flex bg-brand-950">
      {/* Sidebar desktop */}
      <aside className="hidden md:flex md:flex-col w-64 bg-brand-800 border-r border-brand-600/30">
        <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-brand-600/20">
          <div className="w-9 h-9 rounded-lg bg-brand-700 flex items-center justify-center">
            <img src="/logo-ivory.png" alt="" className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-display font-bold text-sm text-slate-100">BOPELUAL</h1>
            <p className="text-[10px] text-slate-400">Nómina</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-gold-400/10 text-gold-400 shadow-glow-sm'
                    : 'text-slate-300 hover:text-slate-100 hover:bg-brand-700/60'
                }`
              }
            >
              <Icon size={18} className={isActive ? 'text-gold-400' : 'text-slate-400'} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-brand-600/20">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-xs font-medium text-slate-300">
              {usuario?.email?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{usuario?.email}</p>
              <p className="text-[10px] text-slate-400">{usuario?.rol}</p>
            </div>
            <button onClick={logout} className="text-slate-500 hover:text-slate-300 transition-colors" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-h-screen overflow-auto">
        <div className="max-w-7xl mx-auto p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-brand-800 border-t border-brand-600/30 flex justify-around py-2 px-2 safe-area-bottom">
        {items.slice(0, 5).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${
                isActive ? 'text-gold-400' : 'text-slate-400'
              }`
            }
          >
            <Icon size={20} className={isActive ? 'text-gold-400' : 'text-slate-400'} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
