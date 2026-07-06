import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

// Se ejecuta una vez antes de toda la suite: migra y deja las tablas de dominio
// limpias. Los tests de integración por HTTP hacen COMMIT (no rollback), así que
// esto evita que el estado se acumule entre corridas y da un punto de partida
// determinista.
export async function setup() {
  await runMigrations(pool);
  await pool.query(`TRUNCATE lineas_rol, roles_pago, facturas_proveedor, prestamos,
    provisiones, contratos, periodos, colaboradores, usuarios RESTART IDENTITY CASCADE`);
}

export async function teardown() {
  await pool.end();
}
