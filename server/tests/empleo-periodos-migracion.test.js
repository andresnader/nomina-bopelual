import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';

describe('migración empleo_periodos', () => {
  it('la tabla existe y rechaza salida anterior a la entrada', async () => {
    await withRollback(async (client) => {
      const { rows: c } = await client.query(
        `INSERT INTO colaboradores (tipo,nombre) VALUES ('IESS','MIG') RETURNING id`);
      await client.query(
        `INSERT INTO empleo_periodos (colaborador_id, fecha_entrada, fecha_salida)
         VALUES ($1,'2027-01-01','2027-06-30')`, [c[0].id]);
      await expect(client.query(
        `INSERT INTO empleo_periodos (colaborador_id, fecha_entrada, fecha_salida)
         VALUES ($1,'2027-05-01','2027-04-01')`, [c[0].id])
      ).rejects.toThrow();
    });
  });
});
