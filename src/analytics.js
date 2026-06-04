/**
 * API Analytics Tracker
 *
 * In-memory analytics for API usage patterns.
 * Tracks requests, endpoints, plans, top IPs, top countries, response times.
 *
 * Resets on server restart. For persistence, upgrade to Redis/MongoDB.
 */

class AnalyticsTracker {
  constructor() {
    this.startedAt = new Date();
    this._reset();
  }

  _reset() {
    this.metrics = {
      totalRequests: 0,
      todayRequests: 0,
      thisHourRequests: 0,
      todayDate: this._todayKey(),
      thisHour: new Date().getHours(),

      // Per-endpoint counters
      endpoints: {},

      // Per-plan counters
      plans: { free: 0, starter: 0, pro: 0, enterprise: 0, unknown: 0 },

      // Top looked-up IPs (counter map)
      _ipCounts: new Map(),

      // Top resolved countries (counter map)
      _countryCounts: new Map(),

      // Response time tracking
      responseTimes: [],
      totalResponseTime: 0,

      // Error tracking
      errors4xx: 0,
      errors5xx: 0,

      // Unique API keys today
      _activeKeys: new Set(),

      // Hourly histogram (24 slots)
      hourlyHistogram: new Array(24).fill(0),
    };
  }

  _todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  _rolloverIfNeeded() {
    const today = this._todayKey();
    const currentHour = new Date().getHours();

    if (this.metrics.todayDate !== today) {
      // New day — reset daily counters
      this.metrics.todayDate = today;
      this.metrics.todayRequests = 0;
      this.metrics._activeKeys.clear();
      this.metrics.hourlyHistogram = new Array(24).fill(0);
    }

    if (this.metrics.thisHour !== currentHour) {
      this.metrics.thisHour = currentHour;
      this.metrics.thisHourRequests = 0;
    }
  }

  /**
   * Record an API request
   * @param {object} data
   * @param {string} data.endpoint — e.g., "GET /api/ip/:ip"
   * @param {string} data.plan — user's plan
   * @param {string|null} data.apiKey — the API key used
   * @param {string|null} data.lookedUpIP — the IP that was looked up
   * @param {string|null} data.country — resolved country code
   * @param {number} data.responseTimeMs — response time in ms
   * @param {number} data.statusCode — HTTP status code
   */
  record(data) {
    this._rolloverIfNeeded();

    const m = this.metrics;

    m.totalRequests++;
    m.todayRequests++;
    m.thisHourRequests++;
    m.hourlyHistogram[new Date().getHours()]++;

    // Endpoint
    if (data.endpoint) {
      m.endpoints[data.endpoint] = (m.endpoints[data.endpoint] || 0) + 1;
    }

    // Plan
    const plan = data.plan || "unknown";
    m.plans[plan] = (m.plans[plan] || 0) + 1;

    // API key
    if (data.apiKey) {
      m._activeKeys.add(data.apiKey);
    }

    // Looked-up IP
    if (data.lookedUpIP) {
      m._ipCounts.set(data.lookedUpIP, (m._ipCounts.get(data.lookedUpIP) || 0) + 1);
    }

    // Country
    if (data.country) {
      m._countryCounts.set(data.country, (m._countryCounts.get(data.country) || 0) + 1);
    }

    // Response time
    if (data.responseTimeMs != null) {
      m.totalResponseTime += data.responseTimeMs;
      // Keep rolling window of last 1000 response times for percentile calc
      m.responseTimes.push(data.responseTimeMs);
      if (m.responseTimes.length > 1000) m.responseTimes.shift();
    }

    // Errors
    if (data.statusCode >= 400 && data.statusCode < 500) m.errors4xx++;
    if (data.statusCode >= 500) m.errors5xx++;
  }

  /**
   * Get analytics snapshot
   */
  getStats() {
    this._rolloverIfNeeded();
    const m = this.metrics;

    // Top 10 IPs
    const topIPs = [...m._ipCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    // Top 10 countries
    const topCountries = [...m._countryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([country, count]) => ({ country, count }));

    // Average response time
    const avgResponseTime =
      m.totalRequests > 0
        ? parseFloat((m.totalResponseTime / m.totalRequests).toFixed(2))
        : 0;

    // P95 response time
    let p95ResponseTime = 0;
    if (m.responseTimes.length > 0) {
      const sorted = [...m.responseTimes].sort((a, b) => a - b);
      const idx = Math.floor(sorted.length * 0.95);
      p95ResponseTime = sorted[idx] || 0;
    }

    // Error rate
    const errorRate =
      m.totalRequests > 0
        ? parseFloat(((m.errors4xx + m.errors5xx) / m.totalRequests * 100).toFixed(2))
        : 0;

    return {
      uptime: `${process.uptime().toFixed(1)}s`,
      startedAt: this.startedAt.toISOString(),
      requests: {
        total: m.totalRequests,
        today: m.todayRequests,
        thisHour: m.thisHourRequests,
      },
      endpoints: m.endpoints,
      plans: { ...m.plans },
      topLookedUpIPs: topIPs,
      topCountries,
      performance: {
        avgResponseTimeMs: avgResponseTime,
        p95ResponseTimeMs: p95ResponseTime,
      },
      errors: {
        client4xx: m.errors4xx,
        server5xx: m.errors5xx,
        errorRate: `${errorRate}%`,
      },
      activeKeysToday: m._activeKeys.size,
      hourlyHistogram: m.hourlyHistogram,
    };
  }
}

// Singleton
const analytics = new AnalyticsTracker();

/**
 * Express middleware to track request analytics
 */
function analyticsMiddleware(req, res, next) {
  const start = Date.now();

  res.on("finish", () => {
    const responseTimeMs = Date.now() - start;

    // Determine the endpoint pattern
    let endpoint = `${req.method} ${req.route?.path || req.path}`;
    if (req.baseUrl) endpoint = `${req.method} ${req.baseUrl}${req.route?.path || ""}`;

    analytics.record({
      endpoint,
      plan: req.plan || "unknown",
      apiKey: req.headers["x-api-key"] || req.query?.api_key || null,
      lookedUpIP: req.params?.ip || null,
      country: res._resolvedCountry || null, // set by the route handler
      responseTimeMs,
      statusCode: res.statusCode,
    });
  });

  next();
}

module.exports = { analytics, analyticsMiddleware };
