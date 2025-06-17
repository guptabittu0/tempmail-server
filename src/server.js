const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import routes and services
const tempEmailRoutes = require('./routes/tempEmailRoutes');
const { SMTPHandler } = require('./services/postfixHandler');
const cleanupScheduler = require('./services/cleanupScheduler');
const { initializeDatabase } = require('./database/init');

const app = express();
const PORT = process.env.PORT || 3000;

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

// Request parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined'));

// Trust proxy (for rate limiting and IP detection)
app.set('trust proxy', 1);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
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
          nodeVersion: process.version
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

// API documentation endpoint
app.get('/api/docs', (req, res) => {
  const docs = {
    name: 'TempMail Server API',
    version: '1.0.0',
    description: 'Temporary email service with PostgreSQL backend',
    baseUrl: `${req.protocol}://${req.get('host')}/api`,
    endpoints: {
      'POST /temp-email/generate': {
        description: 'Generate a new temporary email address',
        body: {
          customAddress: 'string (optional) - Custom email address',
          expiryHours: 'number (optional) - Hours until expiry (default: 24, max: 168)'
        },
        response: {
          email: 'string - Generated email address',
          token: 'string - Access token for this email',
          expiresAt: 'string - ISO date when email expires',
          createdAt: 'string - ISO date when email was created'
        }
      },
      'GET /temp-email/:token/emails': {
        description: 'Get emails for a temporary email address',
        params: {
          token: 'string - Access token'
        },
        query: {
          limit: 'number (optional) - Number of emails to return (default: 50, max: 100)',
          offset: 'number (optional) - Number of emails to skip (default: 0)',
          onlyUnread: 'boolean (optional) - Only return unread emails (default: false)'
        }
      },
      'GET /temp-email/:token/emails/:emailId': {
        description: 'Get specific email content',
        params: {
          token: 'string - Access token',
          emailId: 'string - Email ID'
        }
      },
      'DELETE /temp-email/:token/emails/:emailId': {
        description: 'Delete specific email',
        params: {
          token: 'string - Access token',
          emailId: 'string - Email ID'
        }
      },
      'DELETE /temp-email/:token/emails': {
        description: 'Delete all emails for temporary email address',
        params: {
          token: 'string - Access token'
        }
      },
      'POST /temp-email/:token/search': {
        description: 'Search emails',
        params: {
          token: 'string - Access token'
        },
        body: {
          query: 'string - Search query',
          limit: 'number (optional) - Max results (default: 20)',
          offset: 'number (optional) - Results offset (default: 0)'
        }
      },
      'PUT /temp-email/:token/extend': {
        description: 'Extend temporary email expiry',
        params: {
          token: 'string - Access token'
        },
        body: {
          hours: 'number - Additional hours (default: 24, max: 168)'
        }
      },
      'GET /temp-email/:token/stats': {
        description: 'Get email statistics',
        params: {
          token: 'string - Access token'
        }
      }
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
      'POST /api/temp-email/generate',
      'GET /api/temp-email/:token/emails',
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
  
  server.close(() => {
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
    console.log('Initializing TempMail Server...');
    
    // Initialize database
    await initializeDatabase();
    console.log('Database initialized successfully');
    
    // Start HTTP server
    const server = app.listen(PORT, () => {
      console.log(`TempMail Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
      console.log(`API Documentation: http://localhost:${PORT}/api/docs`);
    });

    // Make server available for graceful shutdown
    global.server = server;
    
    // Start cleanup scheduler
    cleanupScheduler.start();
    console.log('Cleanup scheduler started');
    
    // Start SMTP handler for incoming emails
    const smtpPort = parseInt(process.env.SMTP_PORT) || 25000;
    const smtpHandler = new SMTPHandler({ port: smtpPort });
    
    try {
      await smtpHandler.start();
      global.smtpHandler = smtpHandler;
      console.log(`SMTP handler listening on port ${smtpPort}`);
    } catch (smtpError) {
      console.warn('Could not start SMTP handler:', smtpError.message);
      console.log('Email processing will be available via file processing only');
    }
    
    console.log('TempMail Server started successfully!');
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startServer();
}

module.exports = app;