import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(setUsuario)
      .catch(() => setUsuario(null))
      .finally(() => setCargando(false));
  }, []);

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    setUsuario(null);
  };

  return <Ctx.Provider value={{ usuario, logout, cargando }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);