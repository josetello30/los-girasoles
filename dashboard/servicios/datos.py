"""
Lectura de datos con el rol de solo lectura `girasoles_dashboard`.

Todas las consultas usan las VISTAS de la base de datos (v_kpi_resumen,
v_estado_cuenta, v_accesos_detalle...) o tablas sin datos sensibles.
El rol no puede leer contraseñas, tokens QR ni API keys (ver 06_roles.sh).

No depende de Streamlit: la caché se aplica en servicios/cache.py.
"""
from __future__ import annotations

import pandas as pd
from sqlalchemy import Engine, create_engine, text

from . import config


def crear_motor() -> Engine:
    url = (f"postgresql+psycopg://{config.DB_USER}:{config.DB_PASSWORD}"
           f"@{config.DB_HOST}:{config.DB_PORT}/{config.DB_NAME}")
    return create_engine(
        url,
        pool_pre_ping=True,          # se recupera si la BD se reinició
        pool_size=5,
        connect_args={"options": f"-c timezone={config.ZONA}", "application_name": "girasoles-dashboard"},
    )


def consultar(motor: Engine, sql: str, **parametros) -> pd.DataFrame:
    with motor.connect() as conexion:
        return pd.read_sql(text(sql), conexion, params=parametros)


# ============================================================ resumen
def kpis(motor) -> pd.Series:
    return consultar(motor, "SELECT * FROM v_kpi_resumen").iloc[0]


def kpis_mes_anterior(motor) -> pd.Series:
    """Valores del mes anterior a la misma fecha, para mostrar la variación."""
    return consultar(motor, """
        WITH r AS (
            SELECT date_trunc('month', now()) - interval '1 month' AS ini,
                   now() - interval '1 month'                       AS fin
        )
        SELECT
          (SELECT count(*) FROM reserva x, r WHERE x.estado <> 'CANCELADA'
             AND lower(x.periodo) >= r.ini AND lower(x.periodo) < r.ini + interval '1 month') AS reservas_mes,
          (SELECT COALESCE(sum(p.monto), 0) FROM pago p, r WHERE p.estado = 'APROBADO'
             AND p.pagado_en >= r.ini AND p.pagado_en < r.fin)                                  AS recaudacion_mes,
          (SELECT count(*) FROM log_acceso WHERE direccion = 'ENTRADA' AND resultado = 'PERMITIDO'
             AND ocurrido_en >= date_trunc('day', now()) - interval '7 days'
             AND ocurrido_en <  now() - interval '7 days')                                        AS accesos_semana_pasada
    """).iloc[0]


def estado_pagos(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT estado_pago, count(*) AS titulares, sum(deuda_vencida) AS deuda_vencida
        FROM v_estado_cuenta WHERE estado_socio <> 'BAJA'
        GROUP BY estado_pago
    """)


def reservas_por_dia(motor, dias_atras: int = 6, dias_adelante: int = 0) -> pd.DataFrame:
    return consultar(motor, """
        SELECT fecha, sum(reservas) AS reservas
        FROM v_reservas_diarias
        WHERE fecha BETWEEN CURRENT_DATE - :atras AND CURRENT_DATE + :adelante
        GROUP BY fecha ORDER BY fecha
    """, atras=dias_atras, adelante=dias_adelante)


def ocupacion(motor) -> pd.DataFrame:
    return consultar(motor, "SELECT nombre, tipo, ocupacion_pct, horas_reservadas FROM v_ocupacion_instalacion ORDER BY ocupacion_pct DESC")


def recaudacion_mensual(motor) -> pd.DataFrame:
    return consultar(motor, "SELECT mes, concepto, metodo, pagos, total FROM v_recaudacion_mensual ORDER BY mes")


# ============================================================ socios y morosidad
def estado_cuenta(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT socio_id, numero_socio, nombres || ' ' || apellidos AS socio, lote, estado_socio,
               estado_pago, deuda_total, deuda_vencida, cuotas_vencidas, dias_mora_max
        FROM v_estado_cuenta ORDER BY numero_socio
    """)


def padron(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT socio_id, numero_socio, tipo, parentesco, nombres || ' ' || apellidos AS socio, dni, lote,
               email, telefono, estado_socio, fecha_afiliacion, numero_titular, estado_pago, deuda_vencida
        FROM v_socio_detalle ORDER BY numero_socio
    """)


def datos_modelo(motor) -> dict[str, pd.DataFrame]:
    """Insumos del modelo de riesgo: historial completo de cuotas y pagos de mantenimiento."""
    return {
        "cuotas": consultar(motor, """
            SELECT id AS cuota_id, socio_id, periodo, fecha_vencimiento, monto
            FROM cuota WHERE concepto = 'MANTENIMIENTO' AND NOT anulada
        """),
        "pagos": consultar(motor, """
            SELECT p.cuota_id, p.monto, p.pagado_en
            FROM pago p JOIN cuota c ON c.id = p.cuota_id
            WHERE p.estado = 'APROBADO' AND c.concepto = 'MANTENIMIENTO'
        """),
        "socios": consultar(motor, """
            SELECT t.id AS socio_id, t.numero_socio, t.nombres || ' ' || t.apellidos AS socio, t.lote,
                   t.fecha_afiliacion, t.estado AS estado_socio,
                   (SELECT count(*) FROM socio d WHERE d.titular_id = t.id) AS dependientes
            FROM socio t WHERE t.tipo = 'TITULAR'
        """),
        "reservas": consultar(motor, """
            SELECT COALESCE(s.titular_id, s.id) AS titular_id,
                   (lower(r.periodo) AT TIME ZONE 'America/Lima') AS inicio
            FROM reserva r JOIN socio s ON s.id = r.socio_id
            WHERE r.estado <> 'CANCELADA'
        """),
    }


# ============================================================ accesos (IoT)
def accesos_recientes(motor, limite: int = 50) -> pd.DataFrame:
    return consultar(motor, """
        SELECT ocurrido_en, punto_acceso, tipo_persona, persona, referencia, lote, metodo,
               direccion, resultado, motivo, latencia_ms
        FROM v_accesos_detalle ORDER BY ocurrido_en DESC LIMIT :limite
    """, limite=limite)


def accesos_por_hora(motor, dias: int = 7) -> pd.DataFrame:
    return consultar(motor, """
        SELECT (ocurrido_en AT TIME ZONE 'America/Lima')::date AS fecha,
               extract(hour FROM ocurrido_en AT TIME ZONE 'America/Lima')::int AS hora,
               count(*) FILTER (WHERE resultado = 'PERMITIDO') AS permitidos,
               count(*) FILTER (WHERE resultado = 'DENEGADO')  AS denegados
        FROM log_acceso
        WHERE ocurrido_en >= date_trunc('day', now()) - make_interval(days => :dias)
        GROUP BY 1, 2 ORDER BY 1, 2
    """, dias=dias)


def latencias(motor, dias: int = 7) -> pd.DataFrame:
    return consultar(motor, """
        SELECT metodo::text AS metodo, latencia_ms
        FROM log_acceso
        WHERE latencia_ms IS NOT NULL AND ocurrido_en >= now() - make_interval(days => :dias)
    """, dias=dias)


def resumen_accesos_hoy(motor) -> pd.Series:
    return consultar(motor, """
        SELECT count(*) FILTER (WHERE resultado = 'PERMITIDO' AND direccion = 'ENTRADA') AS ingresos,
               count(*) FILTER (WHERE resultado = 'PERMITIDO' AND direccion = 'SALIDA')  AS salidas,
               count(*) FILTER (WHERE resultado = 'DENEGADO')                            AS denegados,
               count(*) FILTER (WHERE tipo_persona = 'INVITADO')                         AS invitados,
               percentile_cont(0.95) WITHIN GROUP (ORDER BY latencia_ms)                 AS p95_ms
        FROM v_accesos_detalle WHERE ocurrido_en >= date_trunc('day', now())
    """).iloc[0]


# ============================================================ reservas
def mapa_calor_reservas(motor, dias: int = 60) -> pd.DataFrame:
    return consultar(motor, """
        SELECT extract(isodow FROM lower(r.periodo) AT TIME ZONE 'America/Lima')::int AS dia,
               extract(hour  FROM lower(r.periodo) AT TIME ZONE 'America/Lima')::int AS hora,
               count(*) AS reservas
        FROM reserva r JOIN instalacion i ON i.id = r.instalacion_id
        WHERE r.estado <> 'CANCELADA' AND i.exclusiva
          AND lower(r.periodo) >= now() - make_interval(days => :dias) AND lower(r.periodo) < now()
        GROUP BY 1, 2
    """, dias=dias)


def agenda(motor, fecha) -> pd.DataFrame:
    return consultar(motor, """
        SELECT to_char(lower(r.periodo) AT TIME ZONE 'America/Lima', 'HH24:MI') AS hora,
               i.nombre AS instalacion, s.numero_socio, s.nombres || ' ' || s.apellidos AS socio,
               r.estado, r.monto
        FROM reserva r JOIN instalacion i ON i.id = r.instalacion_id JOIN socio s ON s.id = r.socio_id
        WHERE (lower(r.periodo) AT TIME ZONE 'America/Lima')::date = :fecha AND i.exclusiva
        ORDER BY 1, 2
    """, fecha=fecha)


def instalaciones(motor) -> pd.DataFrame:
    return consultar(motor, "SELECT id, codigo, nombre, tipo FROM instalacion WHERE activa ORDER BY nombre")


def bloqueos(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT i.nombre AS instalacion, lower(b.periodo) AS desde, upper(b.periodo) AS hasta, b.motivo
        FROM bloqueo_instalacion b JOIN instalacion i ON i.id = b.instalacion_id
        WHERE upper(b.periodo) >= now() ORDER BY lower(b.periodo)
    """)


# ============================================================ comunicación y nómina
def noticias(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT id, titulo, categoria, publicada_en, expira_en,
               (expira_en IS NULL OR expira_en > now()) AS vigente
        FROM noticia ORDER BY publicada_en DESC
    """)


def eventos(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT e.titulo, e.categoria, e.inicia_en, e.lugar, e.cupo,
               (SELECT count(*) FROM inscripcion_evento ie WHERE ie.evento_id = e.id AND ie.estado = 'INSCRITO') AS inscritos
        FROM evento e WHERE e.termina_en >= now() ORDER BY e.inicia_en
    """)


def inscripciones_por_disciplina(motor) -> pd.DataFrame:
    return consultar(motor, """
        SELECT ie.disciplina, count(*) AS inscritos
        FROM inscripcion_evento ie JOIN evento e ON e.id = ie.evento_id
        WHERE e.titulo ILIKE 'Olimpiadas%' AND ie.estado = 'INSCRITO' AND ie.disciplina IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC
    """)


def asistencia(motor, dias: int = 30) -> pd.DataFrame:
    return consultar(motor, """
        SELECT trabajador, cargo::text AS cargo, count(DISTINCT fecha) AS dias_asistidos
        FROM v_asistencia_personal
        WHERE fecha >= CURRENT_DATE - :dias
        GROUP BY 1, 2 ORDER BY 2, 1
    """, dias=dias)
