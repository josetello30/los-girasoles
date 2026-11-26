"""
Tienda del club: catálogo con fotos, precios y stock, y pedidos de los socios.
Todo cambio pasa por la API (/tienda/productos), igual que lo que ve la app.
"""
import pandas as pd
import streamlit as st

import componentes as c
from servicios import api, cache

c.encabezado("Tienda", "Productos que los socios ven y compran en la app")

try:
    productos = pd.DataFrame(api.get("/tienda/admin/productos", c.token()))
except api.ErrorApi as e:
    if e.estado == 401:
        st.session_state.pop("sesion", None)
        st.rerun()
    st.error(f"No se pudo cargar la tienda: {e}", icon=":material/error:")
    st.stop()

productos["imagen_url"] = productos["imagen_url"].astype(object).where(productos["imagen_url"].notna(), None)
activos = productos[productos["activo"]]
k = st.columns(4)
k[0].metric("Productos a la venta", len(activos), border=True,
            delta=f"{len(productos) - len(activos)} ocultos", delta_color="off", delta_arrow="off")
k[1].metric("Unidades vendidas", int(productos["vendidos"].sum()), border=True)
k[2].metric("Con stock bajo", int((activos["stock"] < 10).sum()), border=True, help="Menos de 10 unidades")
k[3].metric("Sin foto", int(activos["imagen_url"].isna().sum()), border=True,
            help="Productos a la venta que en la app se ven con un ícono en lugar de foto")

pestana_catalogo, pestana_nuevo, pestana_pedidos = st.tabs(["Catálogo", "Nuevo producto", "Pedidos"])

# ---------------------------------------------------------------- catálogo + edición
with pestana_catalogo:
    columnas = st.columns(4)
    for i, p in enumerate(productos.itertuples()):
        with columnas[i % 4], st.container(border=True):
            c.mostrar_imagen(p.imagen_url, alto_vacio=150, texto_vacio="Sin foto")
            estado = "" if p.activo else "  · :gray[oculto]"
            st.markdown(f"**{p.nombre}**{estado}  \n{c.soles(p.precio)} · stock {p.stock} · vendidos {p.vendidos}")

    st.divider()
    st.subheader("Editar producto")
    nombres = {f"{p.nombre} ({p.sku})": p for p in productos.itertuples()}
    elegido = st.selectbox("Producto", list(nombres), key="producto_editar")
    p = nombres[elegido]
    col_img, col_form = st.columns([1, 2])
    with col_img:
        c.mostrar_imagen(p.imagen_url, alto_vacio=220, texto_vacio="Sin foto")
    with col_form, st.form(f"editar_{p.id}", border=False):
        a, b = st.columns([2, 1])
        nombre = a.text_input("Nombre", p.nombre, max_chars=80)
        categoria = b.text_input("Categoría", p.categoria, max_chars=30)
        descripcion = st.text_input("Descripción", p.descripcion or "", max_chars=500)
        a, b, d = st.columns(3)
        precio = a.number_input("Precio (S/)", 0.1, 10000.0, float(p.precio), step=1.0)
        stock = b.number_input("Stock", 0, 100000, int(p.stock))
        activo = d.toggle("A la venta", bool(p.activo), help="Si se apaga, deja de mostrarse en la app")
        foto = c.selector_imagen("Cambiar foto", clave=f"foto_{p.id}")
        quitar = st.checkbox("Quitar la foto actual", disabled=pd.isna(p.imagen_url))
        if st.form_submit_button("Guardar cambios", type="primary", icon=":material/save:"):
            cuerpo = {"nombre": nombre.strip(), "categoria": categoria.strip(), "descripcion": descripcion.strip() or None,
                      "precio": round(float(precio), 2), "stock": int(stock), "activo": bool(activo)}
            if foto is not None:
                ruta = c.subir_imagen(foto)
                if ruta:
                    cuerpo["imagen_url"] = ruta
            elif quitar:
                cuerpo["imagen_url"] = None
            if c.accion_api("patch", f"/tienda/productos/{p.id}", cuerpo, exito="Producto actualizado") is not None:
                st.rerun()

# ---------------------------------------------------------------- nuevo producto
with pestana_nuevo:
    with st.form("nuevo_producto", clear_on_submit=True, border=False):
        a, b, d = st.columns([1, 2, 1])
        sku = a.text_input("Código (SKU)", placeholder="POL-NIN-01", max_chars=20)
        nombre = b.text_input("Nombre", placeholder="Polo para niños", max_chars=80)
        categoria = d.selectbox("Categoría", sorted(set(productos["categoria"]) | {"Ropa", "Accesorios", "Souvenirs"}),
                                accept_new_options=True)
        descripcion = st.text_input("Descripción", max_chars=500)
        a, b = st.columns(2)
        precio = a.number_input("Precio (S/)", 0.1, 10000.0, 30.0, step=1.0)
        stock = b.number_input("Stock inicial", 0, 100000, 20)
        foto = c.selector_imagen("Foto del producto", clave="foto_nuevo")
        if st.form_submit_button("Agregar a la tienda", type="primary", icon=":material/add_shopping_cart:"):
            if len(sku.strip()) < 3 or len(nombre.strip()) < 3:
                st.error("El código y el nombre necesitan al menos 3 caracteres.")
            else:
                cuerpo = {"sku": sku.strip().upper(), "nombre": nombre.strip(), "categoria": categoria,
                          "descripcion": descripcion.strip() or None, "precio": round(float(precio), 2),
                          "stock": int(stock)}
                ruta = c.subir_imagen(foto)
                if ruta:
                    cuerpo["imagen_url"] = ruta
                if (foto is None or ruta) and c.accion_api("post", "/tienda/productos", cuerpo, exito="Producto agregado") is not None:
                    st.rerun()

# ---------------------------------------------------------------- pedidos
with pestana_pedidos:
    pedidos = cache.pedidos_tienda()
    if pedidos.empty:
        c.sin_datos("Todavía no hay pedidos")
    else:
        pedidos["creado_en"] = pd.to_datetime(pedidos["creado_en"]).dt.tz_convert("America/Lima")
        pedidos["estado"] = pedidos["estado"].map({"PENDIENTE_PAGO": "Pendiente de pago", "PAGADO": "Pagado",
                                                   "ENTREGADO": "Entregado", "CANCELADO": "Cancelado"})
        st.dataframe(pedidos, hide_index=True, column_config={
            "creado_en": st.column_config.DatetimeColumn("Fecha", format="DD/MM/YYYY HH:mm"),
            "numero_socio": "N° Socio", "socio": "Socio", "estado": "Estado",
            "total": st.column_config.NumberColumn("Total", format="S/ %.2f"), "detalle": "Productos",
        })
