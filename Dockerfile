# Build frontend first
FROM node:18-alpine as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend ./
RUN npm run build

# Build backend
FROM node:18-alpine as backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --only=production

# Final stage
FROM node:18-alpine
WORKDIR /app/backend

# Copy backend dependencies
COPY --from=backend-builder /app/backend/node_modules ./node_modules

# Copy backend code
COPY backend .

# Copy frontend build from frontend builder
COPY --from=frontend-builder /app/frontend/dist ../frontend/dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
