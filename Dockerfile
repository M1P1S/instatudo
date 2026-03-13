FROM python:3.11-slim

WORKDIR /app

# Instala dependências do sistema necessárias para instagrapi e Pillow
RUN apt-get update -qq && apt-get install -y -qq \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Instala dependências Python
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copia o código
COPY . .

# Cria diretório do banco de dados (será sobrescrito pelo volume)
RUN mkdir -p /app/backend/db

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
