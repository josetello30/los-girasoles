"""
Noticias y eventos: lo que se publica aquí aparece en la app de los socios (RF03).
"""
from datetime import datetime, time, timedelta

import pandas as pd
import plotly.graph_objects as go
import streamlit as st

import componentes as c
from servicios import cache

c.encabezado("Noticias y eventos", "Contenido que ven los socios en la app")

pestana_noticias, pestana_eventos = st.tabs(["Noticias y alertas", "Eventos"])

with pestana_noticias:
    col1, col2 = st.columns([1, 1.3])
    with col1, st.container(border=True):
        st.subheader("Publicar")
        with st.form("noticia", clear_on_submit=True, border=False):
            titulo = st.text_input("Título", max_chars=120)
            contenido = st.text_area("Mensaje", max_chars=4000, height=140)
            a, b = st.columns(2)
            categoria = a.selectbox("Categoría", ["GENERAL", "IMPORTANTE", "MANTENIMIENTO", "EVENTO"], format_func=str.capitalize)
            dias = b.number_input("Visible por (días)", min_value=1, max_value=90, value=15,
                                  help="Después de esta fecha deja de mostrarse en la app")
            if st.form_submit_button("Publicar en la app", type="primary", icon=":material/send:"):
                if len(titulo.strip()) < 5 or len(contenido.strip()) < 10:
                    st.error("El título necesita al menos 5 caracteres y el mensaje 10.")
                else:
                    expira = (c.ahora() + timedelta(days=int(dias))).isoformat()
                    c.accion_api("post", "/noticias", {"titulo": titulo.strip(), "contenido": contenido.strip(),
                                                       "categoria": categoria, "expira_en": expira},
                                 exito="Noticia publicada")
    with col2, st.container(border=True):
        st.subheader("Publicadas")
        n = cache.noticias()
        for fila in n.head(12).itertuples():
            a, b = st.columns([5, 1], vertical_alignment="center")
            estado = "🟢" if fila.vigente else "⚪"
            a.markdown(f"{estado} **{fila.titulo}**  \n"
                       f"<small>{fila.categoria.capitalize()} · {pd.Timestamp(fila.publicada_en).tz_convert('America/Lima'):%d/%m/%Y}</small>",
                       unsafe_allow_html=True)
            if b.button("", icon=":material/delete:", key=f"borrar_{fila.id}", help="Retirar de la app"):
                c.accion_api("delete", f"/noticias/{fila.id}", exito="Noticia retirada")
                st.rerun()

with pestana_eventos:
    e = cache.eventos()
    col1, col2 = st.columns([1.3, 1])
    with col1, st.container(border=True):
        st.subheader("Próximos eventos")
        e["inicia_en"] = pd.to_datetime(e["inicia_en"]).dt.tz_convert("America/Lima")
        st.dataframe(e.drop(columns=["id", "imagen_url"]), hide_index=True, column_config={
            "titulo": "Evento", "categoria": "Categoría", "lugar": "Lugar",
            "inicia_en": st.column_config.DatetimeColumn("Inicio", format="DD/MM/YYYY HH:mm"),
            "cupo": "Cupo", "inscritos": "Inscritos",
        })
    with col2, st.container(border=True):
        st.subheader("Olimpiadas: inscritos por disciplina")
        d = cache.inscripciones_por_disciplina().sort_values("inscritos")
        if d.empty:
            c.sin_datos()
        else:
            fig = go.Figure(go.Bar(x=d["inscritos"], y=d["disciplina"], orientation="h", marker_color=c.VERDE,
                                   text=d["inscritos"], textposition="outside", cliponaxis=False,
                                   hovertemplate="%{y}: %{x} inscritos<extra></extra>"))
            st.plotly_chart(c.estilo(fig, 280, leyenda=False), config={"displayModeBar": False})

    with st.container(border=True):
        st.subheader("Imagen de un evento")
        if e.empty:
            c.sin_datos("No hay eventos próximos")
        else:
            opciones = {f"{f.titulo} · {f.inicia_en:%d/%m/%Y}": f for f in e.itertuples()}
            elegido = opciones[st.selectbox("Evento", list(opciones), key="evento_imagen")]
            col_img, col_form = st.columns([1, 2])
            with col_img:
                c.mostrar_imagen(elegido.imagen_url, alto_vacio=180, texto_vacio="Sin imagen: la app muestra solo el texto")
            with col_form, st.form(f"imagen_evento_{elegido.id}", border=False):
                foto = c.selector_imagen("Nueva imagen", clave=f"foto_evento_{elegido.id}")
                quitar = st.checkbox("Quitar la imagen actual", disabled=pd.isna(elegido.imagen_url))
                if st.form_submit_button("Guardar imagen", type="primary", icon=":material/image:"):
                    cuerpo = None
                    if foto is not None:
                        ruta = c.subir_imagen(foto)
                        cuerpo = {"imagen_url": ruta} if ruta else None
                    elif quitar:
                        cuerpo = {"imagen_url": None}
                    else:
                        st.warning("Elige una imagen o marca \"Quitar la imagen actual\".")
                    if cuerpo and c.accion_api("patch", f"/eventos/{elegido.id}", cuerpo, exito="Imagen del evento actualizada") is not None:
                        st.rerun()

    with st.container(border=True):
        st.subheader("Crear evento")
        with st.form("evento", clear_on_submit=True, border=False):
            a, b = st.columns([2, 1])
            titulo = a.text_input("Nombre del evento")
            categoria = b.selectbox("Categoría", ["DEPORTE", "FESTIVAL", "CULTURAL", "RELIGIOSO", "SOCIAL"], format_func=str.capitalize)
            descripcion = st.text_area("Descripción", height=90)
            a, b, d, f = st.columns(4)
            lugar = a.text_input("Lugar")
            dia = b.date_input("Fecha", value=c.ahora().date() + timedelta(days=7), format="DD/MM/YYYY")
            hora = d.time_input("Hora", value=time(10, 0))
            duracion = f.number_input("Duración (horas)", 1, 72, 3)
            a, b = st.columns(2)
            cupo = a.number_input("Cupo (0 = sin límite)", 0, 2000, 0)
            costo = b.number_input("Costo (S/)", 0.0, 1000.0, 0.0, step=5.0)
            foto = c.selector_imagen("Imagen del evento (opcional)", clave="foto_evento_nuevo")
            if st.form_submit_button("Crear evento", type="primary", icon=":material/event:"):
                inicio = datetime.combine(dia, hora, tzinfo=c.ZONA)
                cuerpo = {"titulo": titulo.strip(), "descripcion": descripcion.strip(), "categoria": categoria,
                          "lugar": lugar.strip(), "inicia_en": inicio.isoformat(),
                          "termina_en": (inicio + timedelta(hours=int(duracion))).isoformat(), "costo": float(costo)}
                if cupo:
                    cuerpo["cupo"] = int(cupo)
                ruta = c.subir_imagen(foto)
                if ruta:
                    cuerpo["imagen_url"] = ruta
                if foto is None or ruta:
                    c.accion_api("post", "/eventos", cuerpo, exito="Evento creado")
