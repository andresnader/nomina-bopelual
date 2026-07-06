import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import { crearPeriodo, generarRoles, transicionarPeriodo } from '../src/services/periodos.js';

describe('acumulación de provisiones', () => {
  it('suma provisiones a la tabla anual al cerrar', async () => {
    await withRollback(async (client) => {
      const { rows: u } = await client.query(
        `INSERT INTO usuarios (email, rol) VALUES ('prov@bopelual.com','RRHH') RETURNING id`
      );
      const { rows: c } = await client.query(
        `INSERT INTO colaboradores (tipo, nombre) VALUES ('IESS','P') RETURNING id`
      );
      await client.query(
        `INSERT INTO contratos (colaborador_id, sueldo_base, fecha_inicio) VALUES ($1,1200,'2026-01-01')`,
        [c[0].id]
      );
      const p = await crearPeriodo(client, {
        nombre: '2da', fecha_inicio: '2026-07-16', fecha_fin: '2026-07-31', quincena: 2, creado_por: u[0].id
      });
      await generarRoles(client, p.id, { sbu: 460 });
      await transicionarPeriodo(client, p.id, 'aprobar', u[0].id);
      await transicionarPeriodo(client, p.id, 'cerrar', u[0].id);
      const { rows } = await client.query(
        'SELECT decimo_tercero, decimo_cuarto FROM provisiones WHERE colaborador_id=$1 AND anio=2026',
        [c[0].id]
      );
      expect(Number(rows[0].decimo_tercero)).toBe(100); // 1200/12
      expect(Number(rows[0].decimo_cuarto)).toBe(38.33); // SBU 460/12
    });
  });
});
