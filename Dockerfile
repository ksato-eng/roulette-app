# Build stage
FROM node:18-alpine

WORKDIR /app/backend

# Copy package files first
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy backend code
COPY backend ./

# Copy frontend build
COPY frontend/dist ../frontend/dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
