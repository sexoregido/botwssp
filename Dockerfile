# Usar una imagen base de Node.js
FROM node:18

# Instalar dependencias necesarias para Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de la aplicación
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Copiar el archivo .env.local si existe
COPY .env.local* ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Crear directorios para la persistencia de datos y establecer permisos
RUN mkdir -p /usr/src/app/.wwebjs_auth /usr/src/app/.wwebjs_cache /usr/src/app/whatsapp-auth && \
    chown -R node:node /usr/src/app && \
    chmod -R 777 /usr/src/app/.wwebjs_auth /usr/src/app/.wwebjs_cache /usr/src/app/whatsapp-auth && \
    chmod 600 .env.local || true

# Crear volúmenes para persistencia de datos
VOLUME ["/usr/src/app/.wwebjs_auth", "/usr/src/app/.wwebjs_cache", "/usr/src/app/whatsapp-auth"]

# Variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_TLS_REJECT_UNAUTHORIZED=0

USER node

# Exponer el puerto
EXPOSE 3000

# Ejecutar con la salida sin buffer
CMD ["node", "server/server.js"]
