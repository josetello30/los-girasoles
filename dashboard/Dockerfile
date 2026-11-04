# =============================================================================
# Panel administrativo (Streamlit) - imagen multi-etapa
#   pruebas    -> incluye pytest (make test-dashboard)
#   produccion -> solo lo necesario para ejecutar el panel, sin root
# =============================================================================
FROM python:3.13-slim AS base
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    TZ=America/Lima
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

FROM base AS pruebas
COPY requirements-dev.txt .
RUN pip install -r requirements-dev.txt
COPY . .
CMD ["pytest", "-v"]

FROM base AS produccion
COPY . .
RUN useradd --create-home panel && chown -R panel /app
USER panel
EXPOSE 8501
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8501/_stcore/health')" || exit 1
CMD ["streamlit", "run", "app.py", "--server.port=8501", "--server.address=0.0.0.0"]
