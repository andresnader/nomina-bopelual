import { OAuth2Client } from 'google-auth-library';
import { GOOGLE_CLIENT_ID, ALLOWED_EMAIL_DOMAIN } from '../config.js';

const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Verifica el ID token de Google y exige que el dominio del correo coincida.
export async function verifyGoogleToken(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  const email = payload?.email;
  if (!email) throw new Error('token sin email');
  // Fail-closed: sin dominio configurado NO se acepta ningún token (evita
  // que una config faltante abra el acceso a cualquier cuenta de Google).
  if (!ALLOWED_EMAIL_DOMAIN) throw new Error('ALLOWED_EMAIL_DOMAIN no configurado');
  const dominio = email.split('@')[1];
  if (dominio !== ALLOWED_EMAIL_DOMAIN) throw new Error('dominio no autorizado');
  return { email, nombre: payload.name };
}
