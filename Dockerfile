FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    KOPIT_HOST=0.0.0.0 PORT=8000 KOPIT_DB=/data/kopit.sqlite3
WORKDIR /app
RUN groupadd --gid 10001 kopit && useradd --uid 10001 --gid kopit --no-create-home kopit \
    && mkdir /data && chown kopit:kopit /data
COPY --chown=kopit:kopit server.py finance.py /app/
COPY --chown=kopit:kopit web/ /app/web/
USER kopit
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/', timeout=3).close()"
CMD ["python", "server.py"]
