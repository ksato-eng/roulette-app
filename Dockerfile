FROM node:18-alpine

# Set working directory
WORKDIR /app/backend

# Copy backend package files
COPY backend/package*.json ./

# Install backend dependencies
RUN npm install --production

# Copy backend source code
COPY backend ./

# Copy frontend build (pre-built static files)
COPY frontend/dist ../frontend/dist

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "server.js"]
