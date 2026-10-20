import client from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, event loop, etc.)
client.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDurationMicroseconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const apiRequestsTotal = new client.Counter({
  name: 'api_requests_total',
  help: 'Total number of API requests',
  labelNames: ['method', 'route']
});

const activeConnections = new client.Gauge({
  name: 'active_connections',
  help: 'Number of active connections'
});

const errorTotal = new client.Counter({
  name: 'errors_total',
  help: 'Total number of errors',
  labelNames: ['type']
});

// Middleware to track request duration
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path || 'unknown';
    
    httpRequestDurationMicroseconds
      .labels(req.method, route, res.statusCode.toString())
      .observe(duration);
    
    apiRequestsTotal.labels(req.method, route).inc();
  });
  
  next();
}

// Export register for the /metrics endpoint
export { register, httpRequestDurationMicroseconds, apiRequestsTotal, activeConnections, errorTotal };