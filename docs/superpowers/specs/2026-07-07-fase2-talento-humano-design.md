# Fase 2 — Talento Humano y Descuentos Recurrentes

**Fecha**: 2026-07-07 · **Estado**: aprobado por Andrés

## Objetivo

Convertir la app de nómina en un sistema de gestión de talento humano sencillo:
la ficha del colaborador como centro del sistema, descuentos recurrentes que se
aplican solos al generar cada período, y portal básico para el colaborador.

## Alcance aprobado

1. **Ficha completa del colaborador** — editable desde la UI, incluyendo datos
   bancarios (banco, cuenta, tipo, código Pichincha), empresa, centro de costo
   y cargas personales. `ColaboradorDetalle` pasa a pestañas: Ficha · Contratos ·
   Descuentos · Ausencias · Documentos · Evaluaciones · Roles de pago.
2. **Descuentos recurrentes** — tabla `descuentos_recurrentes` por colaborador:
   tipo (catálogo de conceptos reales: ALIMENTACION, SALUDSA, MEC, COMISARIATO,
   CUOTA_PLAN, PLAN_VEHICULAR, UNIFORMES, SEGURO, PENSION_ALIMENTICIA, LENTES,
   NEC, DESCUENTO_VARIOS…), monto, quincena de aplicación (1/2/ambas) y cuotas
   restantes opcionales. `generarRoles` los aplica automáticamente igual que los
   préstamos; con cuotas definidas se decrementan y desactivan en 0.
3. **Vacaciones y permisos** — tabla `ausencias` (VACACIONES, PERMISO,
   ENFERMEDAD, LICENCIA) con flujo SOLICITADA → APROBADA/RECHAZADA (RRHH).
   Saldo de vacaciones = 15 días/año trabajado proporcional (parámetro
   `DIAS_VACACIONES_ANIO`) − días de vacaciones aprobadas.
4. **Documentos** — tabla `documentos` con archivo `bytea` (máx 5 MB) porque
   Railway no tiene disco persistente y el volumen es bajo. Subida con
   `express.raw`, sin dependencias nuevas.
5. **Evaluaciones** — registro simple: fecha, calificación 1–5, fortalezas,
   oportunidades, evaluador.
6. **Portal del colaborador** — dashboard del rol COLABORADOR: sus roles de
   pago, saldo de vacaciones y solicitudes (crear/ver). Vínculo
   usuario↔colaborador ya existente en Configuración.

## Fuera de alcance (YAGNI)

Asistencia/marcaciones, organigrama, reclutamiento, liquidaciones de salida,
notificaciones por email.

## Arquitectura

Sigue los patrones existentes: migración SQL numerada aplicada al arrancar,
rutas Express con `requireRole`, lógica pura en `src/lib/` con tests vitest,
páginas React con Tailwind y componentes `Card/Badge/PageTitle`.

- Migración `003_talento_humano.sql`: 4 tablas + parámetro.
- `lib/vacaciones.js`: cálculo puro de saldo (testeable sin DB).
- `lib/tipos-descuento.js`: catálogo compartido de conceptos.
- `services/periodos.js#generarRoles`: aplica descuentos recurrentes tras los
  préstamos, respetando la quincena configurada.
- Rutas nuevas: `/api/descuentos`, `/api/ausencias`, colaborador-anidadas
  `/api/colaboradores/:id/{documentos,evaluaciones,vacaciones}`.
- Autorización: gestión ADMIN/RRHH; el colaborador ve/crea lo propio vía
  `requireSelfOrRole` (ya existente).
- Sidebar por secciones: NÓMINA (Dashboard, Períodos, Descuentos, Préstamos,
  Proveedores, Reportes) y TALENTO HUMANO (Colaboradores, Ausencias), más
  Configuración.

## Modelo de datos

```sql
descuentos_recurrentes(id, colaborador_id FK, tipo_linea text, monto numeric,
  aplicar_en int CHECK IN (0,1,2) -- 0=ambas, 1=q1, 2=q2
  cuotas_restantes int NULL, activo bool, notas, creado_en)

ausencias(id, colaborador_id FK, tipo CHECK (VACACIONES|PERMISO|ENFERMEDAD|LICENCIA),
  fecha_desde, fecha_hasta, dias numeric, estado CHECK (SOLICITADA|APROBADA|RECHAZADA),
  motivo, aprobado_por FK usuarios, creado_en)

documentos(id, colaborador_id FK, nombre, tipo CHECK (CONTRATO|CEDULA|CERTIFICADO|OTRO),
  mime, archivo bytea, subido_por FK usuarios, creado_en)

evaluaciones(id, colaborador_id FK, fecha, calificacion int 1..5,
  fortalezas, oportunidades, evaluador_id FK usuarios, creado_en)
```

## Errores y pruebas

- Descuento recurrente nunca deja el neto negativo: si el descuento supera el
  neto disponible se aplica igual (RRHH lo ve en el rol y decide); sin lógica
  mágica.
- Tests: unitarios de `vacaciones.js` y aplicación de descuentos en
  `generarRoles` (quincena correcta, cuotas decrecientes, desactivación);
  API de ausencias (flujo de aprobación y permisos self); documentos (subir y
  descargar íntegro).
