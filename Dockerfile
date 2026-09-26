FROM ghcr.io/astral-sh/uv:0.12.19 AS uv
FROM python:3.12-slim
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1
COPY pyproject.toml uv.lock README.md LICENSE ./
RUN uv sync --frozen --no-dev --extra web --no-install-project
COPY ascii_gen ./ascii_gen
RUN uv sync --frozen --no-dev --extra web
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD ["/app/.venv/bin/python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz', timeout=3)"]
CMD ["/app/.venv/bin/python", "-m", "uvicorn", "ascii_gen.web:app", "--host", "0.0.0.0", "--port", "8000", "--limit-concurrency", "8", "--timeout-keep-alive", "5", "--no-access-log"]
