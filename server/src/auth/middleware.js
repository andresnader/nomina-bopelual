import pool from '../db/pool.js';
import { verifyGoogleToken } from './google.js';

export async function requireAuth(req, res, next) {
  // Prioridad 1: sesión por cookie (flujo OAuth redirect)
  if (req.session?.usuario) {
    req.usuario = req.session.usuario;
    return next();
  }

  // Prioridad 2: Bearer token (flujo GIS, compatibilidad)
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'falta token' });

  let datos;
  try {
    datos = await verifyGoogleToken(token);
  } catch {
    return res.status(401).json({ error: 'token inválido' });
  }

  const { rows } = await pool.query(
    'SELECT id, email, rol, colaborador_id FROM usuarios WHERE email=$1 AND activo=true',
    [datos.email]
  );
  if (rows.length === 0) return res.status(403).json({ error: 'usuario no autorizado' });

  req.session.usuario = rows[0];
  req.usuario = rows[0];
  next();
}

export function requireRole(rolesPermitidos) {
  return (req, res, next) => {
    if (!rolesPermitidos.includes(req.usuario?.rol)) {
      return res.status(403).json({ error: 'rol insuficiente' });
    }
    next();
  };
}

export function requireSelfOrRole(rolesPermitidos, getColaboradorId) {
  return async (req, res, next) => {
    if (rolesPermitidos.includes(req.usuario?.rol)) return next();
    const objetivo = await getColaboradorId(req);
    if (req.usuario?.colaborador_id && req.usuario.colaborador_id === objetivo) return next();
    return res.status(403).json({ error: 'acceso denegado' });
  };
}