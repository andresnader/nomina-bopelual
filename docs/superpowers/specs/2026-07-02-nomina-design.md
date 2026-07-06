# Nomina BOPELUAL — Diseño del Sistema

**Fecha:** 2026-07-02  
**Estado:** Aprobado  
**Proyecto:** Nomina BOPELUAL SA  
**Referencia visual:** [seguimiento-bopelual](https://github.com/andresnader/seguimiento-bopelual)

---

## 1. Contexto y objetivo

Sistema de gestión de nómina quincenal para BOPELUAL SA (15–50 colaboradores). Maneja dos tipos de colaborador: **afiliados al IESS** (empleados bajo relación de dependencia) y **proveedores externos** (honorarios con o sin factura). Reemplaza el manejo manual en Excel por un sistema web con historial auditable, cálculo automático de beneficios de ley ecuatorianos y comprobantes de pago por colaborador.

---

## 2. Stack y arquitectura

### Tecnología
- **Frontend:** React + Vite + Tailwind CSS + react-router + lucide-react
- **Backend:** Node.js + Express (REST API en `/api/...`)
- **Base de datos:** PostgreSQL (Railway, proyecto separado `nomina-bopelual`)
- **Auth:** Google SSO restringido al dominio del Workspace de BOPELUAL
- **Despliegue:** Railway — proyecto independiente del seguimiento-bopelual

### Estructura de repo
```
nomina-bopelual/
  client/          React + Vite + Tailwind
  server/          Express + migraciones automáticas al arrancar
  db/
    schema.sql     Bootstrap destructivo (solo desarrollo)
    migrations/    NNN_*.sql — aplicadas automáticamente al arrancar el servidor
  docs/
    superpowers/specs/   Especificaciones de diseño
```

### Identidad visual
Se reutiliza el sistema de diseño de `seguimiento-bopelual`:
- Tokens Tailwind: `brand-dark` (#0f172a), `brand-yellow` (#ffca3f), `brand-darker` (#0a0a0a)
- Tipografía: Inter (cuerpo), Manrope (titulares)
- Componentes compartidos: `Card`, `KpiCard`, `PageTitle`, badges de estado
- Layout: sidebar oscuro en escritorio + bottom nav en móvil

### Roles del sistema
| Rol | Permisos |
|-----|----------|
| `ADMIN` | Configuración completa: usuarios, parámetros IESS, tipos de línea |
| `RRHH` | Crear/editar períodos, aprobar y cerrar nómina, gestionar colaboradores |
| `COLABORADOR` | Ver únicamente sus propios roles de pago e historial |
| `GERENCIA` | Dashboard y reportes de solo lectura |

---

## 3. Modelo de datos

### Tipos colaborador y flujo de nómina

```
IESS:     contrato → periodo → rol_pago → lineas_rol (ingresos + descuentos + provisiones)
EXTERNO:  - Modalidad A (factura): factura_proveedor con retención 10%
          - Modalidad B (planilla interna): mismo flujo que IESS sin aportes ni beneficios de ley
```

### Tablas

#### `colaboradores`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| tipo | enum(`IESS`, `EXTERNO`) | Tipo de vínculo laboral |
| cedula | text UNIQUE | Cédula o RUC |
| nombre | text NOT NULL | Nombre completo |
| email | text | Correo personal (opcional) |
| departamento | text | Área o departamento |
| cargo | text | |
| fecha_ingreso | date | |
| activo | boolean | Para dar de baja sin eliminar |
| creado_en | timestamptz | |

#### `contratos`
Historial de sueldos/tarifas — un nuevo registro por cada aumento.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| colaborador_id | uuid FK → colaboradores | |
| sueldo_base | numeric(12,2) | Remuneración mensual acordada |
| fecha_inicio | date | Inicio de vigencia |
| fecha_fin | date NULLABLE | NULL = contrato activo |
| notas | text | Motivo del cambio (aumento, ajuste, etc.) |
| creado_en | timestamptz | |

#### `periodos`
Cada quincena tiene su propio ciclo de vida.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| nombre | text | Ej: "1ra quincena julio 2026" |
| fecha_inicio | date | |
| fecha_fin | date | |
| estado | enum(`BORRADOR`, `APROBADO`, `CERRADO`) | |
| creado_por | uuid FK → usuarios | |
| aprobado_por | uuid FK → usuarios NULLABLE | |
| cerrado_en | timestamptz NULLABLE | |
| creado_en | timestamptz | |

#### `roles_pago`
Un registro por colaborador por período.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| periodo_id | uuid FK → periodos | |
| colaborador_id | uuid FK → colaboradores | |
| total_ingresos | numeric(12,2) | Calculado desde lineas_rol; se actualiza en cada cambio mientras el período esté en BORRADOR |
| total_descuentos | numeric(12,2) | Ídem |
| neto | numeric(12,2) | total_ingresos - total_descuentos; congelado al cerrar el período |
| estado_pago | enum(`PENDIENTE`, `PAGADO`) | |
| pagado_en | timestamptz NULLABLE | |

#### `lineas_rol`
El corazón auditable del sistema — cada ingreso o descuento es una fila.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| rol_pago_id | uuid FK → roles_pago | |
| tipo_linea | text | Ver catálogo de tipos abajo |
| clase | enum(`INGRESO`, `DESCUENTO`) | |
| monto | numeric(12,2) | |
| descripcion | text NULLABLE | Detalle libre |
| es_provision | boolean | true = beneficio de ley acumulado |
| creado_en | timestamptz | |

**Catálogo de tipos de línea (configurables por ADMIN):**
- Ingresos: `SUELDO_BASE`, `HORAS_EXTRA`, `COMISION`, `BONO_DESEMPENO`, `VIATICO`, `OTRO_INGRESO`
- Descuentos: `IESS_PERSONAL` (9.45%), `RETENCION_FUENTE`, `ANTICIPO_QUINCENA`, `MULTA`, `CUOTA_PRESTAMO`, `OTRO_DESCUENTO`
- Provisiones (ingresos contables, no cash): `PROVISION_DECIMO_TERCERO`, `PROVISION_DECIMO_CUARTO`, `PROVISION_FONDOS_RESERVA`, `PROVISION_UTILIDADES`

#### `provisiones`
Acumulado de beneficios de ley por colaborador — se actualiza cada período.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| colaborador_id | uuid FK → colaboradores | |
| anio | int | Año de acumulación |
| decimo_tercero | numeric(12,2) | Acumulado del año |
| decimo_cuarto | numeric(12,2) | Acumulado del año |
| fondos_reserva | numeric(12,2) | Aplica solo tras 1 año IESS |
| utilidades | numeric(12,2) | Estimado según utilidad declarada |
| actualizado_en | timestamptz | |

#### `prestamos`
Créditos internos con amortización automática por período.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| colaborador_id | uuid FK → colaboradores | |
| monto_total | numeric(12,2) | |
| cuota_quincena | numeric(12,2) | Descuento fijo por período |
| saldo_pendiente | numeric(12,2) | |
| activo | boolean | false cuando está saldado |
| fecha_inicio | date | |
| notas | text | |

#### `facturas_proveedor`
Solo para proveedores EXTERNOS en modalidad factura.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| colaborador_id | uuid FK → colaboradores(tipo=EXTERNO) | |
| periodo_id | uuid FK → periodos NULLABLE | Período al que pertenece |
| numero_factura | text | |
| fecha_factura | date | |
| monto_bruto | numeric(12,2) | |
| retencion_10pct | numeric(12,2) | Calculado automáticamente |
| neto | numeric(12,2) | monto_bruto - retencion_10pct |
| estado | enum(`PENDIENTE`, `PAGADA`) | |
| pagada_en | timestamptz NULLABLE | |

#### `usuarios`
| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | uuid PK | |
| email | text UNIQUE | Correo del Workspace |
| nombre | text | |
| rol | enum(`ADMIN`, `RRHH`, `COLABORADOR`, `GERENCIA`) | |
| colaborador_id | uuid FK NULLABLE | Vincula usuario → colaborador |
| activo | boolean | |
| creado_en | timestamptz | |

---

## 4. Cálculos automáticos (Ecuador)

### Aportes IESS (afiliados)
- Aporte personal: 9.45% del sueldo base → línea `IESS_PERSONAL` (descuento)
- Aporte patronal: 12.15% → no sale del rol del colaborador, es costo del empleador (se muestra en reportes)
- Fondos de reserva: 8.33% mensual a partir del 13er mes de afiliación

### Beneficios de ley — provisiones mensuales
| Beneficio | Cálculo | Pago |
|-----------|---------|------|
| Décimo tercero | Sueldo mensual / 12 | Diciembre (o mensual si acordado) |
| Décimo cuarto | SBU vigente / 12 | Agosto (Sierra) |
| Fondos de reserva | Sueldo mensual × 8.33% | Mensual al IESS (o acumulado) |
| Utilidades | 15% utilidad líquida / empleados | Abril del año siguiente |

### Retención en la fuente (proveedores externos)
- 10% sobre el monto bruto de la factura → campo `retencion_10pct`

### Quincenas
- Primera quincena (días 1–15): anticipo ≈ 50% del sueldo neto estimado
- Segunda quincena (días 16–fin de mes): liquidación real con todos los descuentos y beneficios

---

## 5. Pantallas

| Página | Roles con acceso | Descripción |
|--------|-----------------|-------------|
| Dashboard | Todos | KPIs: total nómina período actual, por pagar, colaboradores activos, provisiones acumuladas |
| Colaboradores | ADMIN, RRHH | Lista, filtro por tipo/estado, ficha completa con historial |
| Colaborador Detalle | ADMIN, RRHH, COLABORADOR* | Contratos, roles de pago históricos, préstamos |
| Períodos | ADMIN, RRHH, GERENCIA | Lista de quincenas con estado y totales |
| Período Detalle | ADMIN, RRHH, GERENCIA | Tabla de roles de pago, acciones de flujo (aprobar/cerrar) |
| Rol de Pago | ADMIN, RRHH, COLABORADOR* | Detalle con líneas, comprobante imprimible |
| Proveedores / Facturas | ADMIN, RRHH | Gestión de facturas con retención 10% |
| Préstamos | ADMIN, RRHH | Créditos internos, amortización, saldo |
| Reportes | ADMIN, RRHH, GERENCIA | Resumen anual, proyección provisiones, costo por departamento, CSV |
| Configuración | ADMIN | Usuarios, tipos de línea, parámetros IESS |
| Login | — | Google SSO |

*COLABORADOR ve únicamente sus propios datos.

---

## 6. Flujo de período (ciclo de vida)

```
RRHH crea período (BORRADOR)
  └─> Sistema genera roles_pago para todos los colaboradores activos
  └─> Calcula líneas automáticas: sueldo base, IESS, provisiones, cuotas de préstamos
  └─> RRHH revisa y ajusta líneas manuales (bonos, multas, viáticos)
  └─> RRHH aprueba (APROBADO)
       └─> Gerencia revisa totales
       └─> RRHH cierra (CERRADO) — irreversible, congela todos los valores
            └─> Colaboradores pueden ver sus comprobantes
```

---

## 7. Fases de desarrollo

Esta especificación cubre la Fase 1 completa. Capacidades futuras (fuera de alcance ahora):
- Integración con IESS en línea (aviso de entrada/salida)
- Firma electrónica de comprobantes
- Importación masiva de colaboradores desde Excel
- Integración con contabilidad (asientos contables automáticos)

---

## 8. Decisiones de diseño clave

| Decisión | Razón |
|----------|-------|
| Períodos con `lineas_rol` en lugar de campos planos | Auditabilidad: cualquier quincena histórica puede reconstruirse línea por línea |
| Estado `CERRADO` irreversible | Integridad contable: una nómina pagada no se puede modificar |
| Provisiones como `lineas_rol` con `es_provision=true` | Visibles en el comprobante pero marcadas para excluirlas del cálculo de pago efectivo |
| Proveedor EXTERNO puede tener ambas modalidades | Flexibilidad: el mismo proveedor puede tener facturas y estar en planilla interna |
| Repo y BD independientes del seguimiento-bopelual | Separación de dominios: nómina es información sensible que no debe mezclarse con casos legales |
