# Prometheus Metrics

The Flyby API exposes Prometheus-compatible metrics at `/metrics`.

## Available Metrics

### Default Metrics (via `prom-client`)
- `nodejs_eventloop_lag_seconds` - Event loop lag
- `nodejs_heap_space_size_used_bytes` - Heap usage by space
- `nodejs_active_handles_total` - Number of active handles
- `nodejs_active_requests_total` - Number of active requests
- `process_cpu_seconds_total` - CPU time consumed
- `process_resident_memory_bytes` - Resident memory size

### Custom Metrics

#### `http_request_duration_seconds` (Histogram)
Duration of HTTP requests in seconds.

**Labels:**
- `method` - HTTP method (GET, POST, etc.)
- `route` - Route path (e.g., `/api/checkpoints`)
- `status_code` - HTTP status code (200, 404, 500, etc.)

**Buckets:** 0.1s, 0.5s, 1s, 2s, 5s, 10s

#### `api_requests_total` (Counter)
Total number of API requests.

**Labels:**
- `method` - HTTP method
- `route` - Route path

#### `active_connections` (Gauge)
Number of active connections (currently 0, can be incremented by middleware).

#### `errors_total` (Counter)
Total number of errors.

**Labels:**
- `type` - Error type (e.g., `ValidationError`, `NotFoundError`)

## Example Queries

### Request Rate (requests per second)
```promql
rate(api_requests_total[5m])
```

### 95th Percentile Latency
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

### Error Rate
```promql
rate(errors_total[5m])
```

### Requests by Status Code
```promql
sum by (status_code) (rate(http_request_duration_seconds_count[5m]))
```

## Alerting Examples

### High Error Rate (> 5% of requests)
```promql
rate(errors_total[5m]) / rate(api_requests_total[5m]) > 0.05
```

### High Latency (p95 > 2s)
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
```

### High Memory Usage (> 500MB)
```promql
process_resident_memory_bytes > 524288000
```

## Usage

### Manual Check
```bash
curl http://localhost:3001/metrics
```

### Prometheus Configuration
```yaml
scrape_configs:
  - job_name: 'flyby-api'
    static_configs:
      - targets: ['localhost:3001']
    scrape_interval: 15s
```

## Notes
- Metrics are collected automatically for all HTTP requests
- The `/metrics` endpoint itself is not tracked to avoid self-referential metrics
- Default metrics collection starts immediately on app initialization