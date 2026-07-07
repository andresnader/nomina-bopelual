import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api.js';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('idToken');
    if (!token) {
      setCargando(false);
      return;
    }
    api
      .get('/auth/me')
      .then(setUsuario)
      .catch(() => localStorage.removeItem('idToken'))
      .finally(() => setCargando(false));
  }, []);

  const login = async (idToken) => {
    localStorage.setItem('idToken', idToken);
    setUsuario(await api.get('/auth/me'));
  };
  const logout = () => {
    localStorage.removeItem('idToken');
    setUsuario(null);
  };

  return <Ctx.Provider value={{ usuario, login, logout, cargando }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
