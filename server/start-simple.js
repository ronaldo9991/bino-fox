#!/usr/bin/env node

console.log('🚀 Starting Binofox App Runner application...');

// Set default environment variables
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = process.env.PORT || '8080';

// Basic startup without database dependency
const startServer = async () => {
  try {
    console.log('📦 Loading application modules...');
    
    // Import and start the application
    const { createServer } = await import('http');
    
    // Create a simple Express app for initial startup
    const express = await import('express');
    const app = express.default();
    
    // Basic middleware
    app.use(express.json());
    
    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        platform: 'AWS App Runner',
        database: {
          status: 'not_configured',
          type: 'PostgreSQL'
        },
        version: {
          app: '1.0.0',
          node: process.version
        }
      });
    });
    
    // Root endpoint
    app.get('/', (req, res) => {
      res.json({
        message: 'Binofox Trading Platform',
        status: 'running',
        environment: process.env.NODE_ENV
      });
    });
    
    const PORT = parseInt(process.env.PORT || '8080', 10);
    const server = createServer(app);
    
    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down gracefully');
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
    
    // Start server
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Binofox App Runner server running on port ${PORT}`);
      console.log(`📊 Health check available at: http://localhost:${PORT}/api/health`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
      
      // Check database configuration
      if (!process.env.DATABASE_URL || process.env.DATABASE_URL.includes('localhost')) {
        console.log('⚠️  WARNING: Using local database configuration');
        console.log('💡 Please update DATABASE_URL in App Runner environment variables for production');
      } else {
        console.log('✅ Database URL configured');
      }
    });
    
    // Handle server errors
    server.on('error', (error) => {
      if (error.syscall !== 'listen') {
        throw error;
      }

      const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

      switch (error.code) {
        case 'EACCES':
          console.error(bind + ' requires elevated privileges');
          process.exit(1);
          break;
        case 'EADDRINUSE':
          console.error(bind + ' is already in use');
          process.exit(1);
          break;
        default:
          throw error;
      }
    });
    
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
};

// Start the application
startServer();
