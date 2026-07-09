-- Discrimina préstamos de anticipos de sueldo: mismo motor (saldo, abonos,
-- precancelación), pero el rol de pago debe reflejar la diferencia (ver
-- aplicarPrestamosPendientes en services/periodos.js). DEFAULT 'PRESTAMO'
-- deja todos los préstamos existentes intactos.
ALTER TABLE prestamos
  ADD COLUMN tipo text NOT NULL DEFAULT 'PRESTAMO' CHECK (tipo IN ('PRESTAMO','ANTICIPO'));

-- El tipo de descuento genérico ANTICIPO_SUELDO queda reemplazado por este
-- flujo dedicado; se desactiva para que no se sigan creando por esa vía.
UPDATE servicios_descuento SET activo=false WHERE codigo='ANTICIPO_SUELDO';
