-- Períodos mensuales con clasificación cruzada y TXT clasificado.
--
-- (A) Los períodos existentes (quincenas sueltas) se agrupan retroactivamente
--     en meses padre (tipo_periodo='MES', quincena='AMBAS').
-- (B) La tabla aprobaciones_grupo migra su PK de (periodo_id, empresa, grupo)
--     a (periodo_id, empresa, tipo, clasificacion), eliminando el concepto
--     legacy de grupo (ADM/COMERCIAL/SERV_PROF).
-- (C) Nueva tabla txt_descargas para auditoría de descargas.

-- 1. Agregar columnas nuevas a periodos
ALTER TABLE periodos ADD COLUMN IF NOT EXISTS tipo_periodo text
  NOT NULL DEFAULT 'QUINCENA'
  CHECK (tipo_periodo IN ('QUINCENA', 'MES'));

ALTER TABLE periodos ADD COLUMN IF NOT EXISTS mes_periodo_id uuid
  REFERENCES periodos(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS periodos_mes_periodo_idx ON periodos (mes_periodo_id);

-- 2. Convertir quincena de int a text para poder usar 'AMBAS'
ALTER TABLE periodos DROP CONSTRAINT IF EXISTS periodos_quincena_check;
ALTER TABLE periodos ALTER COLUMN quincena TYPE text USING quincena::text;
ALTER TABLE periodos ADD CONSTRAINT periodos_quincena_check
  CHECK (quincena IN ('1', '2', 'AMBAS'));

-- 3. Backfill: crear períodos padre para meses que tengan Q1 y Q2
INSERT INTO periodos (nombre, fecha_inicio, fecha_fin, quincena, tipo_periodo, estado)
SELECT
  INITCAP(TO_CHAR(DATE_TRUNC('month', p.fecha_inicio), 'FMMonth YYYY')) AS nombre,
  DATE_TRUNC('month', MIN(p.fecha_inicio))::date AS fecha_inicio,
  (DATE_TRUNC('month', MIN(p.fecha_inicio)) + INTERVAL '1 month - 1 day')::date AS fecha_fin,
  'AMBAS' AS quincena,
  'MES' AS tipo_periodo,
  'BORRADOR' AS estado
FROM periodos p
WHERE p.quincena IN ('1', '2')
  AND p.tipo_periodo = 'QUINCENA'
GROUP BY DATE_TRUNC('month', p.fecha_inicio)
HAVING COUNT(DISTINCT p.quincena) = 2
ON CONFLICT DO NOTHING;

-- 4. Vincular quincenas hijas con su padre mensual
UPDATE periodos AS hija
SET mes_periodo_id = padre.id
FROM periodos AS padre
WHERE hija.quincena IN ('1', '2')
  AND hija.tipo_periodo = 'QUINCENA'
  AND padre.quincena = 'AMBAS'
  AND padre.tipo_periodo = 'MES'
  AND DATE_TRUNC('month', hija.fecha_inicio) = DATE_TRUNC('month', padre.fecha_inicio);

-- 5. Migrar aprobaciones_grupo: agregar tipo + clasificacion
ALTER TABLE aprobaciones_grupo
  ADD COLUMN IF NOT EXISTS tipo text,
  ADD COLUMN IF NOT EXISTS clasificacion text;

UPDATE aprobaciones_grupo SET
  tipo = CASE grupo
    WHEN 'ADM' THEN 'IESS'
    WHEN 'COMERCIAL' THEN 'IESS'
    WHEN 'SERV_PROF' THEN 'EXTERNO'
  END,
  clasificacion = CASE grupo
    WHEN 'ADM' THEN 'ADMINISTRATIVO'
    WHEN 'COMERCIAL' THEN 'COMERCIAL'
    WHEN 'SERV_PROF' THEN 'ADMINISTRATIVO'
  END;

ALTER TABLE aprobaciones_grupo ALTER COLUMN tipo SET NOT NULL;
ALTER TABLE aprobaciones_grupo ALTER COLUMN clasificacion SET NOT NULL;
ALTER TABLE aprobaciones_grupo DROP CONSTRAINT IF EXISTS aprobaciones_grupo_pkey;
ALTER TABLE aprobaciones_grupo ADD PRIMARY KEY (periodo_id, empresa, tipo, clasificacion);
ALTER TABLE aprobaciones_grupo DROP COLUMN IF EXISTS grupo;
ALTER TABLE aprobaciones_grupo ADD CONSTRAINT aprobaciones_grupo_clasif_check
  CHECK (clasificacion IN ('ADMINISTRATIVO', 'COMERCIAL'));

-- 6. Nueva tabla de auditoría de descargas TXT
CREATE TABLE IF NOT EXISTS txt_descargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuarios(id),
  periodo_id uuid NOT NULL REFERENCES periodos(id),
  filtros jsonb NOT NULL,
  transferencias_count integer NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  downloaded_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Parámetro de porcentaje de anticipo para EXTERNO
INSERT INTO parametros (clave, valor) VALUES ('PORCENTAJE_ANTICIPO_EXTERNO', '0.50')
  ON CONFLICT (clave) DO NOTHING;
