# TempMail Server

A powerful temporary email server built with Node.js and PostgreSQL with **Direct SMTP** integration. This server provides a complete solution for temporary email services with automatic cleanup, API access, and built-in email processing capabilities.

## Features

- 🚀 **Fast & Scalable**: Built with Node.js and Express
- 📧 **Direct SMTP Server**: Built-in SMTP server for receiving emails (no Postfix needed!)
- 🗄️ **PostgreSQL Storage**: Reliable database for emails and temporary addresses
- 🔄 **Auto Cleanup**: Configurable automatic cleanup of expired emails
- 🔒 **Rate Limited**: Built-in rate limiting to prevent abuse
- 📊 **Statistics**: Comprehensive stats and monitoring
- 🛡️ **Security**: Input validation, CORS, and security headers
- 📱 **RESTful API**: Clean API for all operations

## Quick Start

### Prerequisites

- Node.js (v14 or higher)
- PostgreSQL (v12 or higher)
- **No Postfix required!** (Direct SMTP server included)

### Installation

1. **Clone and install dependencies:**
```bash
git clone <your-repo>
cd tempmail-server
npm install
```

2. **Setup environment variables:**
```bash
cp config.env.template .env
# Edit .env with your configuration
```

3. **Initialize the database:**
```bash
npm run init-db
```

4. **Start the direct SMTP server:**
```bash
# Start both HTTP API and SMTP server
npm run start-smtp

# Or separately:
# HTTP API only
npm start

# SMTP server only
npm run smtp-only
```

## Configuration

### Environment Variables

Copy `config.env.template` to `.env` and configure:

```env
# Server Configuration
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tempmail_db
DB_USER=tempmail_user
DB_PASSWORD=your_secure_password

# Email Configuration
EMAIL_DOMAIN=yourdomain.com
SMTP_PORT=2525

# Cleanup Configuration
EMAIL_RETENTION_HOURS=24
CLEANUP_INTERVAL_MINUTES=60
```

### Database Setup

1. **Create PostgreSQL database and user:**
```sql
CREATE DATABASE tempmail_db;
CREATE USER tempmail_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE tempmail_db TO tempmail_user;
```

2. **Initialize tables:**
```bash
npm run init-db
```

### SMTP Server Setup

The built-in SMTP server handles email reception directly:

- **Development**: Port 2525 (non-privileged)
- **Production**: Port 25 (requires sudo/root)

Configure your MX records to point to your server:
```
yourdomain.com.    IN  MX  10  your-server-ip
```

## API Documentation

### Base URL
```
http://localhost:3000/api
```

### Authentication
Most endpoints require an access token obtained when generating a temporary email.

### Endpoints

#### Generate Temporary Email
```http
POST /temp-email/generate
Content-Type: application/json

{
  "customAddress": "myemail@yourdomain.com",  // optional
  "expiryHours": 24                          // optional, default 24, max 168
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "email": "abc123@yourdomain.com",
    "token": "uuid-token-here",
    "expiresAt": "2024-01-01T12:00:00.000Z",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

#### Get Emails
```http
GET /temp-email/{token}/emails?limit=50&offset=0&onlyUnread=false
```

#### Get Specific Email
```http
GET /temp-email/{token}/emails/{emailId}
```

#### Delete Email
```http
DELETE /temp-email/{token}/emails/{emailId}
```

#### Search Emails
```http
POST /temp-email/{token}/search
Content-Type: application/json

{
  "query": "search term",
  "limit": 20,
  "offset": 0
}
```

#### Extend Email Expiry
```http
PUT /temp-email/{token}/extend
Content-Type: application/json

{
  "hours": 24
}
```

#### Get Statistics
```http
GET /temp-email/{token}/stats
```

### Admin Endpoints

#### Server Statistics
```http
GET /api/admin/stats
```

#### Manual Cleanup
```http
POST /api/admin/cleanup
```

## Development

### Project Structure
```
src/
├── database/             # Database configuration and initialization
├── models/              # Data models (TempEmail, Email)
├── routes/              # API routes
├── services/            # Business logic (EmailService, SMTPHandler)
├── middleware/          # Express middleware (rate limiting, validation)
├── standalone-smtp-server.js  # Direct SMTP server (recommended)
└── server.js            # HTTP API server only
```

### Running in Development
```bash
# Full server (HTTP + SMTP)
npm run start-smtp

# HTTP API only
npm run dev

# SMTP server only
npm run smtp-only
```

### Running Tests
```bash
npm test
```

## Deployment

### Production Setup

1. **Set environment to production:**
```env
NODE_ENV=production
SMTP_PORT=25
```

2. **Use process manager:**
```bash
# Using PM2
npm install -g pm2
pm2 start src/standalone-smtp-server.js --name tempmail-server

# Using systemd (create service file)
sudo systemctl enable tempmail-server
sudo systemctl start tempmail-server
```

3. **Setup reverse proxy (nginx example):**
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

4. **DNS Configuration:**
```
yourdomain.com.    IN  A     your-server-ip
yourdomain.com.    IN  MX    10  yourdomain.com.
```

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000 25
CMD ["node", "src/standalone-smtp-server.js"]
```

## Features in Detail

### Direct SMTP Server
- Built-in SMTP server (no external dependencies)
- Handles email reception and parsing
- Attachment support
- Real-time email processing

### Automatic Cleanup
- Configurable retention period for emails
- Scheduled cleanup jobs using cron
- Manual cleanup via API
- Statistics tracking

### Rate Limiting
- IP-based rate limiting
- Separate limits for email generation
- Configurable limits and windows

### Security
- Input validation using Joi
- SQL injection protection
- XSS protection headers
- CORS configuration

### Monitoring
- Health check endpoint
- Server statistics
- Memory and performance monitoring
- Cleanup job status

## Troubleshooting

### Common Issues

1. **Database connection fails:**
   - Check PostgreSQL is running
   - Verify credentials in `.env`
   - Ensure database exists
   - Run `npm run init-db` to setup tables

2. **SMTP port in use:**
   - Change `SMTP_PORT` in `.env` (use 2525 for development)
   - Check if another service is using the port

3. **Emails not received:**
   - Verify MX records point to your server
   - Check firewall allows traffic on SMTP port
   - Ensure SMTP server is running

4. **Rate limiting too aggressive:**
   - Adjust `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`

### Logs
Server logs include detailed information about:
- Email processing
- Database operations
- SMTP server events
- Cleanup operations
- Error conditions

## Migration from Postfix

If you were previously using Postfix integration:

1. **Remove Postfix configuration:**
```bash
chmod +x scripts/remove-postfix-config.sh
sudo ./scripts/remove-postfix-config.sh
```

2. **Update MX records** to point directly to your server

3. **Switch to direct SMTP:**
```bash
npm run start-smtp
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review server logs
3. Create an issue with detailed information

---

Built with ❤️ using Node.js, PostgreSQL, and Express.  
**Now with Direct SMTP - No Postfix required!** 🚀 