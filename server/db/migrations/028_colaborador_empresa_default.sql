-- Todo colaborador pertenece a una empresa (por defecto BOPELUAL S.A.). Antes
-- la columna era nullable sin default, y un empresa NULL rompía la aprobación
-- por grupo (aprobaciones_grupo.empresa es NOT NULL). Se rellenan los nulos y
-- se fija el default + NOT NULL para que el agrupado por empresa sea siempre
-- consistente.
UPDATE colaboradores SET empresa = 'BOPELUAL S.A.' WHERE empresa IS NULL;
ALTER TABLE colaboradores ALTER COLUMN empresa SET DEFAULT 'BOPELUAL S.A.';
ALTER TABLE colaboradores ALTER COLUMN empresa SET NOT NULL;
