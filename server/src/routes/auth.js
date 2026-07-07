import { Router } from 'express';
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, APP_BASE_URL } from '../config.js';
import { requireAuth } from '../auth/middleware.js';
import { OAuth2Client } from 'google-auth-library';
import pool from '../db/pool.js';

const REDIRECT_URI = `${APP_BASE_URL}/api/auth/google/callback`;
const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, REDIRECT_URI);

const router = Router();

router.get('/google', (req, res) => {
  const authUrl = client.generateAuthUrl({
    access_type: 'online',
    scope: ['email', 'profile'],
    prompt: 'select_account',
    redirect_uri: REDIRECT_URI,
  });
  res.redirect(authUrl);
});

router.get('/google/callback', async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).send('Falta código de autorización');

    const { tokens } = await client.getToken({ code, redirect_uri: REDIRECT_URI });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload?.email;

    if (!email) return res.status(400).send('Token sin email');

    const { rows } = await pool.query(
      'SELECT id, email, rol, colaborador_id FROM usuarios WHERE email=$1 AND activo=true',
      [email]
    );

    if (rows.length === 0) return res.status(403).send('Usuario no autorizado');

    req.session.usuario = rows[0];
    res.redirect('/');
  } catch (err) {
    console.error('Error en callback OAuth:', err);
    res.status(500).send('Error de autenticación');
  }
});

router.get('/me', requireAuth, (req, res) => res.json(req.usuario));

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

export default router;