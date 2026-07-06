import express from 'express';
import cors from 'cors';
import { PORT } from './config.js';
import authRouter from './routes/auth.js';
import colaboradoresRouter from './routes/colaboradores.js';
import periodosRouter from './routes/periodos.js';
import rolesRouter from './routes/roles.js';
import prestamosRouter from './routes/prestamos.js';
import facturasRouter from './routes/facturas.js';
import reportesRouter from './routes/reportes.js';
import usuariosRouter from './routes/usuarios.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/colaboradores', colaboradoresRouter);
  app.use('/api/periodos', periodosRouter);
  app.use('/api/roles', rolesRouter);
  app.use('/api/prestamos', prestamosRouter);
  app.use('/api/facturas', facturasRouter);
  app.use('/api/reportes', reportesRouter);
  app.use('/api', usuariosRouter); // expone /api/usuarios y /api/parametros
  return app;
}

// Arranca solo si se ejecuta directamente (no durante los tests).
if (process.argv[1] && process.argv[1].endsWith('index.js')) {
  const { default: pool } = await import('./db/pool.js');
  const { runMigrations } = await import('./db/migrate.js');
  await runMigrations(pool);
  createApp().listen(PORT, () => console.log(`API en :${PORT}`));
}
