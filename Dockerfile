# Stage 1: Build the React/Vite Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# Stage 2: Production Server Runtime
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
ENV DB_PATH=/app/server/data/bhel_portal.sqlite

# Install Server Dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --omit=dev

# Copy Server Source Code
COPY server/ ./server/

# Copy Compiled Frontend from Stage 1
COPY --from=frontend-builder /app/client/dist ./client/dist

# Ensure Persistent Data Directory Exists
RUN mkdir -p /app/server/data

EXPOSE 5000

CMD ["node", "server/src/server.js"]
