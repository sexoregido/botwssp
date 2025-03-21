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

# Dar permisos de escritura al directorio
RUN chmod -R 777 /usr/src/app

# Exponer el puerto
EXPOSE 3000

# Ejecutar con la salida sin buffer
CMD ["node", "server/server.js"]