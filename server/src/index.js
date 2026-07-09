import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import cookieSession from 'cookie-session';
import { PORT, SESSION_SECRET } from './config.js';
import authRouter from './routes/auth.js';
import colaboradoresRouter from './routes/colaboradores.js';
import periodosRouter from './routes/periodos.js';
import rolesRouter from './routes/roles.js';
import prestamosRouter from './routes/prestamos.js';
import facturasRouter from './routes/facturas.js';
import reportesRouter from './routes/reportes.js';
import usuariosRouter from './routes/usuarios.js';
import descuentosRouter from './routes/descuentos.js';
import serviciosDescuentoRouter from './routes/servicios-descuento.js';
import bancosRouter from './routes/bancos.js';
import tiposContratoRouter from './routes/tipos-contrato.js';
import empresasRouter from './routes/empresas.js';
import ausenciasRouter from './routes/ausencias.js';
import documentosRouter from './routes/documentos.js';
import evaluacionesRouter from './routes/evaluaciones.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json());
  app.use(cookieSession({
    name: 'session',
    keys: [SESSION_SECRET],
    maxAge: 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  }));
  app.use((req, _res, next) => {
    if (req.path.startsWith('/api/auth')) {
      console.log('Auth req:', req.method, req.path, 'cookie:', req.headers.cookie?.slice(0, 80), 'session:', !!req.session?.usuario);
    }
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/colaboradores', colaboradoresRouter);
  app.use('/api/periodos', periodosRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/prestamos', prestamosRouter);
  app.use('/api/facturas', facturasRouter);
  app.use('/api/reportes', reportesRouter);
  app.use('/api/descuentos', descuentosRouter);
  app.use('/api/servicios-descuento', serviciosDescuentoRouter);
  app.use('/api/bancos', bancosRouter);
  app.use('/api/tipos-contrato', tiposContratoRouter);
  app.use('/api/empresas', empresasRouter);
  app.use('/api/ausencias', ausenciasRouter);
  app.use('/api/colaboradores/:colaboradorId/documentos', documentosRouter);
  app.use('/api/colaboradores/:colaboradorId/evaluaciones', evaluacionesRouter);
  app.use('/api', usuariosRouter);
  app.use(express.static(join(__dirname, '../../client/dist')));
  app.get('*', (_req, res) => res.sendFile(join(__dirname, '../../client/dist/index.html')));
  return app;
}

// Arranca solo si se ejecuta directamente (no durante los tests).
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const { default: pool } = await import('./db/pool.js');
  const { runMigrations } = await import('./db/migrate.js');
  await runMigrations(pool);

  // Seed: crea los admins desde ADMIN_EMAILS si no existen
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);
  for (const email of adminEmails) {
    await pool.query(
      `INSERT INTO usuarios (email, nombre, rol) VALUES ($1, split_part($1, '@', 1), 'ADMIN')
       ON CONFLICT (email) DO UPDATE SET activo=true, rol='ADMIN'`,
      [email]
    );
  }

  createApp().listen(PORT, () => console.log(`API en :${PORT}`));
}
