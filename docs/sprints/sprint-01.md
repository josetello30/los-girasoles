# Sprint 1 · Base de datos e infraestructura

**Objetivo del sprint:** contar con una base de datos PostgreSQL contenerizada, con datos realistas,
que soporte los módulos de socios, reservas, pagos/morosidad, control de acceso, tienda y nómina.

## Historias completadas

| ID | Historia | Criterio de aceptación | Estado |
|---|---|---|---|
| HU-01 | Como administrador quiero registrar socios titulares y dependientes | La BD exige titular y parentesco a todo dependiente | ✅ |
| HU-02 | Como socio quiero reservar sin que otro socio me "gane" la misma franja | Restricción `EXCLUDE` rechaza solapamientos (prueba R01) | ✅ |
| HU-03 | Como administrador quiero conocer la morosidad real | Vista `v_estado_cuenta` con periodo de gracia configurable | ✅ |
| HU-04 | Como auditor quiero que el log de accesos sea inalterable | El rol del backend no puede editar ni borrar (prueba S01) | ✅ |
| HU-05 | Como jefe de personal quiero la asistencia del personal para la nómina | `v_asistencia_personal` y `fn_generar_planilla` | ✅ |
| HU-06 | Como equipo queremos levantar todo con un comando en Fedora | `make up` con Docker y SELinux (`:Z`) | ✅ |

## Decisiones técnicas

1. **Estados calculados, no almacenados.** "Al día / Pendiente / Vencido" sale de una vista sobre cuotas y pagos;
   no puede desincronizarse.
2. **Periodo de gracia de 30 días** antes de considerar moroso a un titular (parámetro editable).
   Sin él, el día 3 de cada mes el 70 % de socios figuraba como pendiente.
3. **La morosidad no bloquea el ingreso.** Solo bloquea reservas: los socios viven en el club.
4. **Mínimo privilegio.** Tres roles: superusuario (solo migraciones), `girasoles_app` (backend, sin DDL,
   auditoría de solo inserción) y `girasoles_dashboard` (solo lectura, sin datos sensibles).
5. **Personal sin login.** Limpieza, mantenimiento y jardinería existen como `trabajador` con tarjeta RFID,
   pero sin `usuario`: marcan asistencia, no usan la app.
6. **Semilla relativa a la fecha actual** con `setseed()`: datos reproducibles y siempre "de hoy".

## Evidencias para el informe

- `make test-db` → 19 pruebas de integridad en verde (capturar la salida de la terminal).
- `make estado` → KPIs generados por la vista `v_kpi_resumen`.
- Diagramas del modelo en [`docs/MER.md`](../MER.md).
- Latencia simulada de validación de acceso: promedio ≈ 480 ms, p95 ≈ 880 ms (umbral RNF02: 2000 ms).
  En el Sprint 3 se reemplaza por la latencia **medida** desde el ESP32.
