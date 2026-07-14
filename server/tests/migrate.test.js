import { describe, it, expect, beforeAll } from 'vitest';
import pool from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

describe('migraciones', () => {
  beforeAll(async () => {
    await runMigrations(pool);
  });

  it('crea las tablas del dominio', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema='public'`
    );
    const nombres = rows.map((r) => r.table_name);
    for (const t of [
      'colaboradores', 'contratos', 'periodos', 'roles_pago', 'lineas_rol',
      'provisiones', 'prestamos', 'facturas_proveedor', 'usuarios', 'parametros',
      'contrato_emisiones', 'colaborador_confidencialidad', 'colaborador_consentimiento_expreso',
      'colaborador_consentimiento_biometrico', 'contrato_comisionista_emisiones',
      'contrato_servicios_profesionales_emisiones', 'horarios', 'incidencias_horario'
    ]) {
      expect(nombres).toContain(t);
    }
  });

  it('es idempotente (segunda corrida no falla)', async () => {
    await expect(runMigrations(pool)).resolves.not.toThrow();
  });
});
