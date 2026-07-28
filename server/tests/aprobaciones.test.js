import { describe, it, expect } from 'vitest';
import { withRollback } from './helpers/db.js';
import {
  gruposDePeriodo, aprobarGrupo, reabrirGrupo, grupoAprobado, aprobarTodosLosGrupos,
} from '../src/services/aprobaciones.js';

async function semilla(client) {
  const { rows: u } = await client.query(
    `INSERT INTO usuarios (email, rol) VALUES ('a${Date.now()}@x.co','RRHH') RETURNING id`);
  const { rows: p } = await client.query(
    `INSERT INTO periodos (nombre,fecha_inicio,fecha_fin,quincena)
     VALUES ('P',' 2026-10-01','2026-10-15',1) RETURNING id`);
  const mk = async (nombre, empresa, tipo, clasif, neto) => {
    const { rows: c } = await client.query(
      `INSERT INTO colaboradores (tipo,nombre,empresa,clasificacion)
       VALUES ($1,$2,$3,$4) RETURNING id`, [tipo, nombre, empresa, clasif]);
    await client.query(
      `INSERT INTO roles_pago (periodo_id,colaborador_id,neto) VALUES ($1,$2,$3)`,
      [p[0].id, c[0].id, neto]);
  };
  await mk('COM A', 'BOPELUAL S.A.', 'IESS', 'COMERCIAL', 100);
  await mk('ADM A', 'BOPELUAL S.A.', 'IESS', 'ADMINISTRATIVO', 200);
  await mk('COM CY', 'CARROS-YA S.A.', 'IESS', 'COMERCIAL', 300);
  return { periodoId: p[0].id, usuarioId: u[0].id };
}

describe('servicio aprobaciones', () => {
  it('deriva 3 combinaciones con conteo y total, todas pendientes', async () => {
    await withRollback(async (client) => {
      const { periodoId } = await semilla(client);
      const grupos = await gruposDePeriodo(client, periodoId);
      expect(grupos).toHaveLength(3);
      const com = grupos.find((g) => g.empresa === 'BOPELUAL S.A.' && g.tipo === 'IESS' && g.clasificacion === 'COMERCIAL');
      expect(com.colaboradores).toBe(1);
      expect(Number(com.total_neto)).toBe(100);
      expect(com.aprobado).toBe(false);
      expect(com.etiqueta).toBe('IESS · COMERCIAL');
    });
  });

  it('aprobar marca solo esa combinación; reabrir la revierte', async () => {
    await withRollback(async (client) => {
      const { periodoId, usuarioId } = await semilla(client);
      await aprobarGrupo(client, periodoId, 'BOPELUAL S.A.', 'IESS', 'COMERCIAL', usuarioId);
      expect(await grupoAprobado(client, periodoId, 'BOPELUAL S.A.', 'IESS', 'COMERCIAL')).toBe(true);
      expect(await grupoAprobado(client, periodoId, 'BOPELUAL S.A.', 'IESS', 'ADMINISTRATIVO')).toBe(false);
      const grupos = await gruposDePeriodo(client, periodoId);
      expect(grupos.find((g) => g.tipo === 'IESS' && g.clasificacion === 'COMERCIAL' && g.empresa === 'BOPELUAL S.A.').aprobado_por).toBe(usuarioId);
      await reabrirGrupo(client, periodoId, 'BOPELUAL S.A.', 'IESS', 'COMERCIAL');
      expect(await grupoAprobado(client, periodoId, 'BOPELUAL S.A.', 'IESS', 'COMERCIAL')).toBe(false);
    });
  });

  it('aprobarTodosLosGrupos aprueba las 3 y es idempotente', async () => {
    await withRollback(async (client) => {
      const { periodoId, usuarioId } = await semilla(client);
      await aprobarGrupo(client, periodoId, 'BOPELUAL S.A.', 'IESS', 'COMERCIAL', usuarioId);
      await aprobarTodosLosGrupos(client, periodoId, usuarioId);
      await aprobarTodosLosGrupos(client, periodoId, usuarioId); // idempotente
      const grupos = await gruposDePeriodo(client, periodoId);
      expect(grupos.every((g) => g.aprobado)).toBe(true);
    });
  });
});
