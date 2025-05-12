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
    libxshmfence1 \
    libglu1 \
    fonts-liberation \
    xvfb \
    xauth \
    wget \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Crear directorio de la aplicación
WORKDIR /usr/src/app

# Crear usuario no root
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Copiar el archivo .env si existe
COPY .env* ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Crear y configurar directorios necesarios
RUN mkdir -p /usr/src/app/.wwebjs_auth /usr/src/app/.wwebjs_cache /usr/src/app/whatsapp-auth \
    && chown -R pptruser:pptruser /usr/src/app/.wwebjs_auth \
    && chown -R pptruser:pptruser /usr/src/app/.wwebjs_cache \
    && chown -R pptruser:pptruser /usr/src/app/whatsapp-auth \
    && chmod -R 777 /usr/src/app/.wwebjs_auth \
    && chmod -R 777 /usr/src/app/.wwebjs_cache \
    && chmod -R 777 /usr/src/app/whatsapp-auth

# Variables de entorno para Puppeteer
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_TLS_REJECT_UNAUTHORIZED=0 \
    DISPLAY=:99

# Crear script de inicio
RUN echo '#!/bin/bash\n\
Xvfb :99 -screen 0 1280x720x16 & \
sleep 2\n\
exec node server/server.js' > /usr/src/app/start.sh && \
    chmod +x /usr/src/app/start.sh

# Cambiar al usuario no root
USER pptruser

# Exponer el puerto
EXPOSE 3000

# Ejecutar con la salida sin buffer
CMD ["/usr/src/app/start.sh"]
