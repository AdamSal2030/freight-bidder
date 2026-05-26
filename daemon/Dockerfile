# Microsoft's official Playwright image — Chromium + all system deps pre-installed
FROM mcr.microsoft.com/playwright/python:v1.44.0-jammy

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy daemon source
COPY . .

# Railway sets RAILWAY_ENVIRONMENT — daemon auto-uses 15-min loop
CMD ["python3", "main.py"]
