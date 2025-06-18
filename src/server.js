const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config();

// Import routes and services
const tempEmailRoutes = require('./routes/tempEmailRoutes');
const cleanupScheduler = require('./services/cleanupScheduler');
const { initializeDatabase } = require('./database/init');
const SMTPHandler = require('./services/smptServer');

const app = express();
const PORT = process.env.PORT || 3000;
const SMTP_PORT = parseInt(process.env.SMTP_PORT) || 25;

// Performance optimization: Gzip compression
app.use(compression({
  level: 6, // Balanced compression level
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    // Don't compress if the user doesn't want it
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Fallback to standard filter function
    return compression.filter(req, res);
  }
}));

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Request parsing middleware with optimized limits
app.use(express.json({ 
  limit: '10mb',
  reviver: null // Disable JSON parsing reviver for performance
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  parameterLimit: 1000 // Limit URL parameters for security
}));

// Optimized logging middleware (production-ready)
const logFormat = process.env.NODE_ENV === 'production' 
  ? 'combined' 
  : 'dev';
app.use(morgan(logFormat, {
  skip: (req, res) => {
    // Skip health check logs in production for performance
    return process.env.NODE_ENV === 'production' && req.url === '/health';
  }
}));

// Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// Optimize JSON responses
app.set('json replacer', null);
app.set('json spaces', process.env.NODE_ENV === 'production' ? 0 : 2);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    smtpPort: SMTP_PORT,
    emailDomain: process.env.EMAIL_DOMAIN
  });
});

// API routes
app.use('/api/temp-email', tempEmailRoutes);

// Admin routes for server management
app.get('/api/admin/stats', async (req, res) => {
  try {
    const TempEmail = require('./models/TempEmail');
    const Email = require('./models/Email');
    
    const tempEmailStats = await TempEmail.getStats();
    const emailStats = await Email.getStats();
    const schedulerStatus = await cleanupScheduler.getSchedulerStatus();

    res.json({
      success: true,
      data: {
        tempEmails: tempEmailStats,
        emails: emailStats,
        scheduler: schedulerStatus,
        server: {
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage(),
          nodeVersion: process.version,
          smtpPort: SMTP_PORT,
          emailDomain: process.env.EMAIL_DOMAIN
        }
      }
    });
  } catch (error) {
    console.error('Error getting admin stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics'
    });
  }
});

app.post('/api/admin/cleanup', async (req, res) => {
  try {
    const result = await cleanupScheduler.runCleanupNow();
    res.json({
      success: true,
      message: 'Cleanup completed successfully',
      data: result
    });
  } catch (error) {
    console.error('Error running manual cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run cleanup'
    });
  }
});

// SMTP Server info endpoint
app.get('/api/smtp/info', (req, res) => {
  res.json({
    success: true,
    data: {
      smtpPort: SMTP_PORT,
      smtpHost: '0.0.0.0',
      emailDomain: process.env.EMAIL_DOMAIN,
      isDirectSMTP: true,
      postfixRequired: false,
      instructions: {
        dns: `Set MX record: ${process.env.EMAIL_DOMAIN} -> your-server-ip`,
        firewall: `Open port ${SMTP_PORT} for incoming emails`,
        testing: `Send email to: anything@${process.env.EMAIL_DOMAIN}`
      }
    }
  });
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  const docs = {
    name: 'TempMail Server API (Direct SMTP)',
    version: '1.0.0',
    description: 'Temporary email service with direct SMTP server (no Postfix required)',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    smtpServer: {
      port: SMTP_PORT,
      domain: process.env.EMAIL_DOMAIN,
      type: 'Direct SMTP (no relay required)'
    },
    setup: {
      dns: `MX record: ${process.env.EMAIL_DOMAIN} 10 your-server-ip`,
      firewall: `Allow port ${SMTP_PORT}`,
      postfix: 'Not required - direct SMTP server'
    },
    endpoints: {
      'GET /smtp/info': 'Get SMTP server configuration',
      'POST /temp-email/generate': 'Generate temporary email',
      'GET /temp-email/:token/emails': 'Get emails for temp address',
      'GET /admin/stats': 'Server statistics'
    }
  };

  res.json(docs);
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    available: [
      'GET /health',
      'GET /api/docs',
      'GET /api/smtp/info',
      'POST /api/temp-email/generate',
      'GET /api/admin/stats'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : error.message,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handling
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Starting graceful shutdown...`);
  
  httpServer.close(() => {
    console.log('HTTP server closed.');
    
    // Stop cleanup scheduler
    cleanupScheduler.stop();
    
    // Stop SMTP handler if running
    if (global.smtpHandler) {
      global.smtpHandler.stop();
    }
    
    // Close database connections
    const { pool } = require('./database/config');
    pool.end(() => {
      console.log('Database connections closed.');
      process.exit(0);
    });
  });
}

// Start the server
async function startServer() {
  try {
    console.log('🚀 Initializing TempMail Direct SMTP Server...');
    console.log(`📧 Email Domain: ${process.env.EMAIL_DOMAIN}`);
    console.log(`🔌 SMTP Port: ${SMTP_PORT}`);
    console.log(`🌐 HTTP Port: ${PORT}`);
    
    // Check if we can bind to SMTP port
    if (SMTP_PORT < 1024 && process.getuid && process.getuid() !== 0) {
      console.warn('⚠️  Warning: Binding to port < 1024 requires root privileges');
      console.log('💡 Consider using port 2525 for development or run with sudo for production');
    }
    
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database initialized successfully');
    
    // Start HTTP server
    const httpServer = app.listen(PORT, () => {
      console.log(`✅ HTTP Server running on port ${PORT}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`📖 API Documentation: http://localhost:${PORT}/api/docs`);
      console.log(`🔧 SMTP Info: http://localhost:${PORT}/api/smtp/info`);
    });

    // Make server available for graceful shutdown
    global.httpServer = httpServer;
    
    // Start cleanup scheduler
    cleanupScheduler.start();
    console.log('✅ Cleanup scheduler started');
    
    // Start SMTP handler for incoming emails (DIRECT MODE)
    const smtpHandler = new SMTPHandler({ 
      port: SMTP_PORT,
      host: '0.0.0.0'  // Listen on all interfaces
    });
    
    try {
      await smtpHandler.start();
      global.smtpHandler = smtpHandler;
      console.log(`✅ Direct SMTP server listening on port ${SMTP_PORT}`);
      console.log(`📬 Ready to receive emails at: *@${process.env.EMAIL_DOMAIN}`);
      console.log('');
      console.log('🎉 TempMail Direct SMTP Server started successfully!');
      console.log('');
      console.log('📋 Setup Instructions:');
      console.log(`1. Set DNS MX record: ${process.env.EMAIL_DOMAIN} -> your-server-ip`);
      console.log(`2. Open firewall port: ${SMTP_PORT}`);
      console.log(`3. Send test email to: test@${process.env.EMAIL_DOMAIN}`);
      console.log('');
      
    } catch (smtpError) {
      console.error('❌ Could not start SMTP handler:', smtpError.message);
      
      if (smtpError.code === 'EADDRINUSE') {
        console.log('');
        console.log('🔧 Solutions for port conflict:');
        console.log('1. Stop other services using this port:');
        console.log(`   sudo netstat -tlnp | grep :${SMTP_PORT}`);
        console.log('2. Use a different port (edit SMTP_PORT in .env):');
        console.log('   SMTP_PORT=2525  # Non-privileged port');
        console.log('3. Run with admin privileges:');
        console.log('   sudo node src/standalone-smtp-server.js');
      } else if (smtpError.code === 'EACCES') {
        console.log('');
        console.log('🔧 Permission error - try one of:');
        console.log('1. Use non-privileged port: SMTP_PORT=2525');
        console.log('2. Run with admin privileges: sudo npm start');
        console.log('3. Use port forwarding: iptables -t nat -A PREROUTING -p tcp --dport 25 -j REDIRECT --to-ports 2525');
      }
      
      console.log('');
      console.log('⚠️  SMTP server failed to start, but HTTP API is still available');
    }
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startServer();
}

module.exports = app; 