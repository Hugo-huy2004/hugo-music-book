FROM node:26-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg python3 python3-venv \
 && python3 -m venv /opt/visqol && /opt/visqol/bin/pip install --no-cache-dir visqol-python \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY analyzers ./analyzers
ENV PSL_PYTHON=/opt/visqol/bin/python NODE_ENV=production
CMD ["node", "src/main.ts"]
