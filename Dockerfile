# Usar una imagen base de Node.js
FROM node:18

# Crear directorio de la aplicación
WORKDIR /usr/src/app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente
COPY . .

# Crear directorios y dar permisos
RUN mkdir -p .wwebjs_auth .wwebjs_cache && \
    chmod -R 777 .wwebjs_auth .wwebjs_cache

# Exponer el puerto
EXPOSE 3000

# Ejecutar con la salida sin buffer
CMD ["node", "server/server.js"]