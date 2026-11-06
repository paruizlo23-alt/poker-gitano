# Alternativa a Render nativo (cualquier host con Docker).
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install --omit=dev
COPY packages ./packages
# carpeta de datos escribible por el usuario no privilegiado (sin esto: EACCES al arrancar)
RUN mkdir -p /app/data && chown -R node:node /app/data
# Render usa 10000 por defecto y lo inyecta en PORT
ENV NODE_ENV=production PORT=10000 TRUST_PROXY=1
EXPOSE 10000
USER node
CMD ["npm", "start"]
