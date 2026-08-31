-- Provincia/ciudad de trabajo del colaborador, para el Rol de Pagos
-- Individual (formato histórico) — no existían en ningún lado antes.
ALTER TABLE colaboradores
  ADD COLUMN provincia text,
  ADD COLUMN ciudad text;
