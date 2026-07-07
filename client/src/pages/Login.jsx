import { useEffect, useRef } from 'react';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const ref = useRef(null);

  useEffect(() => {
    if (!window.google) return;
    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: (resp) => login(resp.credential)
    });
    window.google.accounts.id.renderButton(ref.current, { theme: 'filled_black', size: 'large' });
  }, [login]);

  return (
    <div className="min-h-screen grid place-items-center">
      <div className="text-center">
        <h1 className="font-display font-extrabold text-3xl text-brand-yellow mb-2">Nómina BOPELUAL</h1>
        <p className="text-slate-400 mb-6 text-sm">Ingresa con tu cuenta corporativa</p>
        <div ref={ref} className="flex justify-center" />
      </div>
    </div>
  );
}
