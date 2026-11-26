"""
Capa de caché de Streamlit sobre servicios/datos.py.
- El motor de la BD se crea una sola vez (cache_resource).
- Las consultas se cachean pocos segundos: el panel se siente en tiempo real
  sin consultar la BD en cada clic.
- El modelo de riesgo se entrena una vez por hora.
"""
from __future__ import annotations

from datetime import date

import pandas as pd
import streamlit as st

from modelo import riesgo
from . import datos


@st.cache_resource(show_spinner=False)
def motor():
    return datos.crear_motor()


def _leer(funcion, *args, **kwargs):
    return funcion(motor(), *args, **kwargs)


@st.cache_data(ttl=30, show_spinner=False)
def kpis():
    return _leer(datos.kpis)


@st.cache_data(ttl=300, show_spinner=False)
def kpis_mes_anterior():
    return _leer(datos.kpis_mes_anterior)


@st.cache_data(ttl=30, show_spinner=False)
def estado_pagos():
    return _leer(datos.estado_pagos)


@st.cache_data(ttl=60, show_spinner=False)
def reservas_por_dia(dias_atras=6, dias_adelante=0):
    return _leer(datos.reservas_por_dia, dias_atras, dias_adelante)


@st.cache_data(ttl=300, show_spinner=False)
def ocupacion():
    return _leer(datos.ocupacion)


@st.cache_data(ttl=60, show_spinner=False)
def recaudacion_mensual():
    return _leer(datos.recaudacion_mensual)


@st.cache_data(ttl=30, show_spinner=False)
def estado_cuenta():
    return _leer(datos.estado_cuenta)


@st.cache_data(ttl=60, show_spinner=False)
def padron():
    return _leer(datos.padron)


def accesos_recientes(limite=50):
    # Sin caché: es el registro "en vivo"
    return _leer(datos.accesos_recientes, limite)


def resumen_accesos_hoy():
    return _leer(datos.resumen_accesos_hoy)


@st.cache_data(ttl=60, show_spinner=False)
def accesos_por_hora(dias=7):
    return _leer(datos.accesos_por_hora, dias)


@st.cache_data(ttl=120, show_spinner=False)
def latencias(dias=7):
    return _leer(datos.latencias, dias)


@st.cache_data(ttl=300, show_spinner=False)
def mapa_calor_reservas(dias=60):
    return _leer(datos.mapa_calor_reservas, dias)


@st.cache_data(ttl=30, show_spinner=False)
def agenda(fecha):
    return _leer(datos.agenda, fecha)


@st.cache_data(ttl=600, show_spinner=False)
def instalaciones():
    return _leer(datos.instalaciones)


@st.cache_data(ttl=30, show_spinner=False)
def bloqueos():
    return _leer(datos.bloqueos)


@st.cache_data(ttl=30, show_spinner=False)
def noticias():
    return _leer(datos.noticias)


@st.cache_data(ttl=60, show_spinner=False)
def eventos():
    return _leer(datos.eventos)


@st.cache_data(ttl=60, show_spinner=False)
def inscripciones_por_disciplina():
    return _leer(datos.inscripciones_por_disciplina)


@st.cache_data(ttl=300, show_spinner=False)
def asistencia(dias=30):
    return _leer(datos.asistencia, dias)


# ------------------------------------------------------------ modelo de riesgo
@st.cache_resource(ttl=3600, show_spinner="Entrenando el modelo de riesgo...")
def modelo_riesgo(dia: date):
    """Entrena con el historial completo. `dia` en la firma renueva el modelo cada día."""
    d = datos.datos_modelo(motor())
    cuotas = riesgo.preparar_cuotas(d["cuotas"], d["pagos"])
    resultado = riesgo.entrenar(cuotas, d["socios"], d["reservas"], dia)
    prediccion = riesgo.predecir_actual(resultado, cuotas, d["socios"], d["reservas"], dia)
    prediccion = prediccion.join(d["socios"].set_index("socio_id")[["numero_socio", "socio", "lote", "estado_socio"]])
    return resultado, prediccion


def limpiar_todo():
    st.cache_data.clear()


def tabla_vacia(columnas) -> pd.DataFrame:
    return pd.DataFrame(columns=columnas)


@st.cache_data(ttl=60, show_spinner=False)
def pedidos_tienda():
    return _leer(datos.pedidos_tienda)
