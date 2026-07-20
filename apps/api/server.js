const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON
app.use(express.json());

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'flyby-api'
  });
});

// Basic root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Flyby API is running',
    version: '1.0.0',
    endpoints: ['/api/health']
  });
});

// Start the server
const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Flyby API server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;