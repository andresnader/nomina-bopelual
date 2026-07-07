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
    <div className="min-h-screen bg-slate-100">
      {/* Sidebar desktop — fijo, no se mueve */}
      <aside className="hidden md:flex md:flex-col fixed inset-y-0 left-0 w-64 bg-brand-900 border-r border-brand-700 z-30">
        <div className="px-5 pt-7 pb-6 border-b border-brand-700/60 shrink-0">
          <img src="/logo-ivory.png" alt="BOPELUAL S.A." className="w-full" />
          <p className="text-center text-[11px] font-semibold tracking-[0.25em] text-gold-400 mt-2">
            NÓMINA
          </p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {items.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-gold-400 text-brand-900 font-semibold shadow-glow-sm'
                    : 'text-slate-300 font-medium hover:text-white hover:bg-brand-700/60'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={18} className={isActive ? 'text-brand-900' : 'text-slate-400'} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-4 border-t border-brand-700/60 shrink-0">
          <p className="text-[11px] text-slate-500 mb-1">Conectado como</p>
          <p className="text-sm font-semibold text-white truncate">{usuario?.nombre || usuario?.email}</p>
          <p className="text-xs text-slate-400 truncate">{usuario?.email}</p>
          <span className="inline-block mt-2 rounded bg-gold-400 px-2 py-0.5 text-[10px] font-bold tracking-wide text-brand-900">
            {usuario?.rol}
          </span>
          <button
            onClick={logout}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-lg border border-brand-600 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-brand-700/60 transition-colors"
          >
            <LogOut size={15} /> Salir
          </button>
        </div>
      </aside>

      {/* Main content — margen izquierdo para el sidebar fijo */}
      <main className="min-h-screen md:ml-64">
        <div className="max-w-7xl mx-auto p-4 md:p-8 pb-24 md:pb-8">
          {children}
        </div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-brand-900 border-t border-brand-700 flex justify-around py-2 px-2 safe-area-bottom">
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
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
