# ── CARE DEM OpenEnv — Dockerfile ──────────────────────
FROM python:3.11-slim

# HuggingFace Spaces metadata
LABEL space.sdk="docker"
LABEL space.tags="openenv,healthcare,dementia,assistive-ai"

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy all project files
COPY . .

# Expose port (HuggingFace Spaces uses 7860 by default)
EXPOSE 7860

# Start the FastAPI server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
