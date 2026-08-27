-- Encabezado (dirección, teléfonos) para el Rol de Pagos Individual — no
-- existía en ningún lado; ruc/representante_legal ya viven acá (014).
ALTER TABLE config_empresas
  ADD COLUMN direccion text,
  ADD COLUMN telefonos text;
