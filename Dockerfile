# Build stage
FROM node:18-alpine

# Copy backend code
COPY backend /app/backend

WORKDIR /app/backend

# Install dependencies
RUN npm ci --only=production

# Copy frontend build (static files)
COPY frontend/dist /app/frontend/dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
