# Build stage
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/

# Copy backend code
COPY backend ./backend/

WORKDIR /app/backend

# Install dependencies
RUN npm ci --only=production

# Copy frontend build if exists
COPY frontend/dist ./public/frontend-dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
