-- Tipo de pago por rol: reemplaza el booleano incluir_en_txt por un estado de
-- 3 valores. TRANSFERENCIA entra al TXT del banco; CHEQUE se paga fuera del TXT;
-- PENDIENTE = salió a mitad de mes y se le hará liquidación de haberes MANUAL
-- (igual aparece y suma en el Excel; solo se excluye del TXT).
ALTER TABLE roles_pago
  ADD COLUMN tipo_pago text NOT NULL DEFAULT 'TRANSFERENCIA'
    CHECK (tipo_pago IN ('CHEQUE','TRANSFERENCIA','PENDIENTE'));
UPDATE roles_pago SET tipo_pago = CASE WHEN incluir_en_txt THEN 'TRANSFERENCIA' ELSE 'CHEQUE' END;
ALTER TABLE roles_pago DROP COLUMN incluir_en_txt;
