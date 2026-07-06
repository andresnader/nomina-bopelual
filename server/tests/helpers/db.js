import pool from '../../src/db/pool.js';
import { runMigrations } from '../../src/db/migrate.js';

let migrated = false;
export async function ensureMigrated() {
  if (!migrated) {
    await runMigrations(pool);
    migrated = true;
  }
}

// Corre fn dentro de una transacción y SIEMPRE hace ROLLBACK: aísla cada test.
export async function withRollback(fn) {
  await ensureMigrated();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
