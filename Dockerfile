FROM node:18-alpine

# Cache-busting ARG to force rebuild when needed
ARG BUILD_DATE=2026-08-08T13-05

# Set working directory
WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN echo "Building at ${BUILD_DATE}" && npm install --production

# Copy backend source code
COPY backend ./

# Copy frontend build (pre-built static files)
COPY frontend/dist ../frontend/dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
