# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    postgresql-client \
    curl \
    bash

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S tempmail -u 1001

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY scripts/ ./scripts/

# Create required directories
RUN mkdir -p logs stats tmp && \
    chown -R tempmail:nodejs /app

# Switch to non-root user
USER tempmail

# Expose ports
EXPOSE 3000 25000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["node", "src/server.js"] 