-- Recuperación de datos manuales para la Primera Quincena de Agosto
-- Valores extraídos del archivo PERIODO AGOSTO PRIMERA QUINCENA.xls
DO $$
DECLARE
  v_periodo_id uuid;
  v_colab_id uuid;
  v_rol_id uuid;
BEGIN
  -- 1. Buscar la primera quincena de agosto
  SELECT id INTO v_periodo_id FROM periodos WHERE nombre ILIKE '%agosto%' AND quincena = 1 LIMIT 1;
  
  IF v_periodo_id IS NULL THEN
    RAISE NOTICE 'No se encontró el período de la primera quincena de agosto.';
    RETURN;
  END IF;

  -- 0920303997: BOLOÑA BAUX ALEJANDRO XAVIER
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0920303997';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 1150, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'HIPOTECARIO', 'DESCUENTO', 352.09, 'HIPOTECARIO');
      UPDATE roles_pago SET total_ingresos = 1150, total_descuentos = 352.09, neto = 797.91 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0922614441: CARRERA BARRIOS DIANA PAOLA
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0922614441';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 240, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 26.5, 'ALIMENTACION2');
      UPDATE roles_pago SET total_ingresos = 240, total_descuentos = 26.5, neto = 213.5 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0923778799: CRUZ FLORES EMILIO FRANCISCO
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0923778799';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 192.8, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'OTROS', 'INGRESO', 44.5, 'OTROS');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 10.5, 'ALIMENTACION2');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'MEC', 'DESCUENTO', 4, 'MEC');
      UPDATE roles_pago SET total_ingresos = 237.3, total_descuentos = 14.5, neto = 222.75 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0950639187: CRUZ GARCIA JORDY ALEJANDRO
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0950639187';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 192.8, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'RUBRO_TRANSPORTE', 'INGRESO', 49.93, 'TRANSPORTE');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 20, 'ALIMENTACION2');
      UPDATE roles_pago SET total_ingresos = 242.73, total_descuentos = 20, neto = 222.73 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0909670168: ERAZO LANDAZURI NUBIA LANIS
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0909670168';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 240, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 2.5, 'ALIMENTACION2');
      UPDATE roles_pago SET total_ingresos = 240, total_descuentos = 2.5, neto = 237.5 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0943592030: LOPEZ PANTA JHONAS JEREMY
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0943592030';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 194.63, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'RUBRO_TRANSPORTE', 'INGRESO', 64.2, 'TRANSPORTE');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'OTROS', 'INGRESO', 72, 'OTROS');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'RUBRO_ALIMENTACION', 'INGRESO', 64.2, 'ALIMENTACION');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 10, 'ALIMENTACION2');
      UPDATE roles_pago SET total_ingresos = 395.03, total_descuentos = 10, neto = 385.03 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0910861343: LUCERO TEHANGA JORGE MOISES
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0910861343';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 600, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'MEC', 'DESCUENTO', 20, 'MEC');
      UPDATE roles_pago SET total_ingresos = 600, total_descuentos = 20, neto = 580 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0927222620: RODRIGUEZ SIGUENCIA CHRISTIAN MICHAEL
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0927222620';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 240, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 6, 'ALIMENTACION2');
      UPDATE roles_pago SET total_ingresos = 240, total_descuentos = 6, neto = 234 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 0929669380: TORAL PINO MIGUEL ANGEL
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '0929669380';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 220, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'RUBRO_TRANSPORTE', 'INGRESO', 20, 'TRANSPORTE');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 12, 'ALIMENTACION2');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'MEC', 'DESCUENTO', 4, 'MEC');
      UPDATE roles_pago SET total_ingresos = 240, total_descuentos = 16, neto = 224 WHERE id = v_rol_id;
    END IF;
  END IF;

  -- 1206278424: VACA VALENZUELA KRIZLEN VIVIANA
  SELECT id INTO v_colab_id FROM colaboradores WHERE cedula = '1206278424';
  IF v_colab_id IS NOT NULL THEN
    SELECT id INTO v_rol_id FROM roles_pago WHERE colaborador_id = v_colab_id AND periodo_id = v_periodo_id;
    IF v_rol_id IS NOT NULL THEN
      DELETE FROM lineas_rol WHERE rol_pago_id = v_rol_id;
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'SUELDO_BASE', 'INGRESO', 200, 'Sueldo (Recuperado de Excel)');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'RUBRO_TRANSPORTE', 'INGRESO', 24, 'TRANSPORTE');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'ALIMENTACION2', 'DESCUENTO', 23, 'ALIMENTACION2');
      INSERT INTO lineas_rol (rol_pago_id, tipo_linea, clase, monto, descripcion) VALUES (v_rol_id, 'MEC', 'DESCUENTO', 4, 'MEC');
      UPDATE roles_pago SET total_ingresos = 224, total_descuentos = 27, neto = 197 WHERE id = v_rol_id;
    END IF;
  END IF;

END $$;
