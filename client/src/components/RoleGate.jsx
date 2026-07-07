import { useAuth } from '../auth/AuthContext.jsx';

export default function RoleGate({ roles, children }) {
  const { usuario } = useAuth();
  return usuario && roles.includes(usuario.rol) ? children : null;
}
