-- Cambiar FK lineas_rol.descuento_recurrente_id a ON DELETE SET NULL
-- para que al eliminar un descuento recurrente no se pierdan las líneas de rol
-- que ya lo referenciaban.
ALTER TABLE lineas_rol
  DROP CONSTRAINT lineas_rol_descuento_recurrente_id_fkey,
  ADD CONSTRAINT lineas_rol_descuento_recurrente_id_fkey
    FOREIGN KEY (descuento_recurrente_id) REFERENCES descuentos_recurrentes(id)
    ON DELETE SET NULL;
