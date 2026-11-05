# Alternativa a Render nativo (cualquier host con Docker). No probado en esta sesión: sin red no pude construir la imagen.
FROM node:22-slim
WORKDIR /app
COPY package.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm install --omit=dev
COPY packages ./packages
ENV NODE_ENV=production PORT=8080 TRUST_PROXY=1
EXPOSE 8080
USER node
CMD ["npm", "start"]
