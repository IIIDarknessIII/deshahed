# Inherits the API image so we share Python deps, SQLAlchemy models, config, etc.
# Build prerequisite: `deshahed-api:dev` must exist (compose handles ordering).
FROM deshahed-api:dev

# Mount parser source on top of /app so `python -m parser.alerts_poller` works
# (cwd=/app puts /app on sys.path, and `parser/__init__.py` makes it a package).
COPY . /app/parser/

ENV PYTHONUNBUFFERED=1

CMD ["python", "-m", "parser.alerts_poller"]
