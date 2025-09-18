# Running the Distributed Inventory System

This document provides detailed instructions for running and operating the distributed inventory system.

## Prerequisites

### System Requirements

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher (comes with Node.js)
- **Operating System**: Linux, macOS, or Windows
- **Memory**: Minimum 512MB RAM
- **Disk Space**: 100MB for application and data

### Installation Steps

1. **Install Node.js**
   ```bash
   # Using Node Version Manager (recommended)
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   nvm install 18
   nvm use 18
   
   # Or download from https://nodejs.org/
   ```

2. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd distributed-inventory-meli
   npm install
   ```

## Running the Application

### Development Mode

```bash
# Start with auto-reload
npm run dev

# Or start manually
npm start
```

The server will start on `http://localhost:3000` by default.

### Production Mode

```bash
# Set production environment
export NODE_ENV=production

# Start the application
npm start
```

### Environment Configuration

Create a `.env` file in the project root:

```env
# Server Configuration
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Logging
LOG_LEVEL=info

# Data Storage
DATA_DIR=./data

# CORS (comma-separated origins)
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
```

## API Testing

### Using curl

```bash
# Health check
curl http://localhost:3000/health

# Add inventory item
curl -X POST http://localhost:3000/api/inventory/items \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "LAPTOP-001",
    "name": "Gaming Laptop",
    "quantity": 50
  }'

# Get all items
curl http://localhost:3000/api/inventory/items

# Reserve inventory
curl -X POST http://localhost:3000/api/inventory/items/LAPTOP-001/reserve \
  -H "Content-Type: application/json" \
  -d '{"quantity": 2}'

# Check metrics
curl http://localhost:3000/api/metrics/health
```

### Using Postman

1. Import the API collection (if available)
2. Set base URL to `http://localhost:3000`
3. Use the provided examples in the collection

### Using HTTPie

```bash
# Install HTTPie
pip install httpie

# Test endpoints
http GET localhost:3000/health
http POST localhost:3000/api/inventory/items sku=LAPTOP-001 name="Gaming Laptop" quantity:=50
http GET localhost:3000/api/inventory/items
```

## Monitoring and Observability

### Health Checks

```bash
# Basic health check
curl http://localhost:3000/health

# Detailed health status
curl http://localhost:3000/api/metrics/health
```

### Metrics Endpoints

```bash
# All metrics
curl http://localhost:3000/api/metrics

# Request metrics
curl http://localhost:3000/api/metrics/requests

# Inventory metrics
curl http://localhost:3000/api/metrics/inventory

# System metrics
curl http://localhost:3000/api/metrics/system
```

### Log Monitoring

```bash
# View application logs
tail -f logs/combined.log

# View error logs
tail -f logs/error.log

# Filter by log level
grep "ERROR" logs/combined.log
```

## Data Management

### Data Directory Structure

```
data/
├── inventory_default.json    # Main inventory data
├── inventory_store1.json     # Store-specific data
└── logs/                     # Application logs
    ├── combined.log
    └── error.log
```

### Backup and Recovery

```bash
# Create backup
cp -r data/ data_backup_$(date +%Y%m%d_%H%M%S)/

# Restore from backup
cp -r data_backup_20231201_120000/* data/
```

### Data Cleanup

```bash
# Clean test data
rm -f data/inventory_test*.json

# Clean logs (keep last 5 files)
find logs/ -name "*.log" -type f -mtime +7 -delete
```

## Performance Testing

### Load Testing with Apache Bench

```bash
# Install Apache Bench
# Ubuntu/Debian: sudo apt-get install apache2-utils
# macOS: brew install httpd

# Test health endpoint
ab -n 1000 -c 10 http://localhost:3000/health

# Test inventory operations
ab -n 100 -c 5 -p add_item.json -T application/json http://localhost:3000/api/inventory/items
```

### Load Testing with Artillery

```bash
# Install Artillery
npm install -g artillery

# Create test scenario
cat > load_test.yml << EOF
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
scenarios:
  - name: "Inventory Operations"
    weight: 100
    flow:
      - get:
          url: "/health"
      - post:
          url: "/api/inventory/items"
          json:
            sku: "TEST-{{ $randomString() }}"
            name: "Test Item"
            quantity: 10
EOF

# Run load test
artillery run load_test.yml
```

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port 3000
   lsof -i :3000
   
   # Kill process
   kill -9 <PID>
   
   # Or use different port
   PORT=3001 npm start
   ```

2. **Permission Denied**
   ```bash
   # Fix data directory permissions
   chmod 755 data/
   chmod 644 data/*.json
   ```

3. **Memory Issues**
   ```bash
   # Check memory usage
   node --max-old-space-size=512 src/index.js
   ```

4. **File Lock Issues**
   ```bash
   # Check for file locks
   lsof data/
   
   # Force unlock (be careful!)
   fuser -k data/inventory_default.json
   ```

### Debug Mode

```bash
# Enable debug logging
LOG_LEVEL=debug npm start

# Enable Node.js debugger
node --inspect src/index.js
```

### Log Analysis

```bash
# Count errors
grep -c "ERROR" logs/combined.log

# Find slow requests
grep "Slow request" logs/combined.log

# Analyze request patterns
grep "POST /api/inventory" logs/combined.log | wc -l
```

## Production Deployment

### Using PM2

```bash
# Install PM2
npm install -g pm2

# Create ecosystem file
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'inventory-system',
    script: 'src/index.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### Using Docker

```bash
# Create Dockerfile
cat > Dockerfile << EOF
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ src/
EXPOSE 3000
CMD ["node", "src/index.js"]
EOF

# Build and run
docker build -t inventory-system .
docker run -p 3000:3000 -v $(pwd)/data:/app/data inventory-system
```

### Using systemd

```bash
# Create service file
sudo cat > /etc/systemd/system/inventory-system.service << EOF
[Unit]
Description=Distributed Inventory System
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/inventory-system
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl enable inventory-system
sudo systemctl start inventory-system
```

## Maintenance

### Regular Tasks

1. **Log Rotation**: Configure logrotate for automatic log management
2. **Data Backup**: Schedule regular backups of the data directory
3. **Health Monitoring**: Set up monitoring for the health endpoints
4. **Performance Monitoring**: Track metrics and alert on anomalies

### Monitoring Setup

```bash
# Simple monitoring script
cat > monitor.sh << EOF
#!/bin/bash
while true; do
  if ! curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "$(date): Service is down!" | mail -s "Inventory System Alert" admin@example.com
  fi
  sleep 60
done
EOF

chmod +x monitor.sh
nohup ./monitor.sh &
```
