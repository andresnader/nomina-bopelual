import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import {
  crearVinculo, listarVinculos, sincronizarFechasDerivadas, vinculoQueCubre,
} from '../src/services/empleo.js';

describe('servicio empleo', () => {
  it('sincronizarFechasDerivadas: ingreso = primer entrada, salida = del último vínculo', async () => {
    await withRollback(async (client) => {
      const { rows: c } = await client.query(
        `INSERT INTO colaboradores (tipo,nombre) VALUES ('IESS','X') RETURNING id`);
      await crearVinculo(client, c[0].id, { fecha_entrada: '2024-11-01', fecha_salida: '2025-10-31' });
      await crearVinculo(client, c[0].id, { fecha_entrada: '2025-11-01', fecha_salida: null });
      await sincronizarFechasDerivadas(client, c[0].id);
      const { rows } = await client.query('SELECT fecha_ingreso, fecha_salida FROM colaboradores WHERE id=$1', [c[0].id]);
      expect(rows[0].fecha_ingreso.toISOString().slice(0, 10)).toBe('2024-11-01');
      expect(rows[0].fecha_salida).toBeNull(); // el vínculo más reciente está abierto
    });
  });

  it('vinculoQueCubre elige el vínculo que solapa el período', async () => {
    await withRollback(async (client) => {
      const { rows: c } = await client.query(
        `INSERT INTO colaboradores (tipo,nombre) VALUES ('IESS','Y') RETURNING id`);
      await crearVinculo(client, c[0].id, { fecha_entrada: '2024-11-01', fecha_salida: '2025-10-31' });
      await crearVinculo(client, c[0].id, { fecha_entrada: '2025-11-01', fecha_salida: null });
      const v = await vinculoQueCubre(client, c[0].id, '2026-01-01', '2026-01-15');
      expect(v.fecha_entrada.toISOString().slice(0, 10)).toBe('2025-11-01');
      const ninguno = await vinculoQueCubre(client, c[0].id, '2025-10-16', '2025-10-31');
      expect(ninguno.fecha_entrada.toISOString().slice(0, 10)).toBe('2024-11-01'); // solapa la 1a
    });
  });
});
