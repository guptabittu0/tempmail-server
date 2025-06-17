# TempMail Server

A powerful temporary email server built with Node.js, PostgreSQL, and Postfix integration. This server provides a complete solution for temporary email services with automatic cleanup, API access, and email processing capabilities.

## Features

- 🚀 **Fast & Scalable**: Built with Node.js and Express
- 📧 **Email Processing**: Full Postfix integration for incoming emails
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
- Postfix (for email handling)

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

4. **Start the server:**
```bash
# Development
npm run dev

# Production
npm start
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
SMTP_PORT=25000

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

### Postfix Integration

Configure Postfix to forward emails to the TempMail server:

1. **Add to `/etc/postfix/main.cf`:**
```
# TempMail configuration
mydestination = yourdomain.com, localhost
virtual_alias_domains = yourdomain.com
virtual_alias_maps = hash:/etc/postfix/virtual
transport_maps = hash:/etc/postfix/transport
```

2. **Create `/etc/postfix/transport`:**
```
yourdomain.com    smtp:[localhost]:25000
```

3. **Create `/etc/postfix/virtual`:**
```
@yourdomain.com   tempmail
```

4. **Update Postfix maps:**
```bash
sudo postmap /etc/postfix/transport
sudo postmap /etc/postfix/virtual
sudo systemctl reload postfix
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
├── database/          # Database configuration and initialization
├── models/           # Data models (TempEmail, Email)
├── routes/           # API routes
├── services/         # Business logic (EmailService, PostfixHandler)
├── middleware/       # Express middleware (rate limiting, validation)
└── server.js         # Main server file
```

### Running Tests
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

## Deployment

### Production Setup

1. **Set environment to production:**
```env
NODE_ENV=production
```

2. **Use process manager:**
```bash
# Using PM2
npm install -g pm2
pm2 start src/server.js --name tempmail-server

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

### Docker Deployment

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY src/ ./src/
EXPOSE 3000
CMD ["node", "src/server.js"]
```

## Features in Detail

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

2. **Emails not received:**
   - Check Postfix configuration
   - Verify SMTP handler is running
   - Check firewall settings

3. **Rate limiting too aggressive:**
   - Adjust `RATE_LIMIT_MAX_REQUESTS` and `RATE_LIMIT_WINDOW_MS`
   - Check IP detection with reverse proxy

### Logs
Server logs include detailed information about:
- Email processing
- Database operations
- Cleanup operations
- Error conditions

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