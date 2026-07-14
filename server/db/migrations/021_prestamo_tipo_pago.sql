-- Tipo de pago en préstamos: documenta cómo se desembolsó el dinero.
-- tipo_pago: NO PAGO (solo registro contable), CHEQUE, TRANSFERENCIA.
-- numero_documento: # de cheque o # de transferencia bancaria.
ALTER TABLE prestamos
  ADD COLUMN IF NOT EXISTS tipo_pago text NOT NULL DEFAULT 'NO PAGO',
  ADD COLUMN IF NOT EXISTS numero_documento text;

ALTER TABLE prestamos
  ADD CONSTRAINT chk_tipo_pago CHECK (tipo_pago IN ('NO PAGO', 'CHEQUE', 'TRANSFERENCIA'));
