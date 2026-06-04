/**
 * Abuse & Bot Detection — Request-Pattern Based
 *
 * In-memory sliding-window tracker for per-IP and per-key request patterns.
 * Detects bots via behavioral heuristics and tracks abuse signals.
 *
 * NOTE: This is in-memory and resets on restart. For production persistence,
 * upgrade to Redis sliding window counters.
 */

// ─── KNOWN BOT USER-AGENT PATTERNS ──────────────────────────
const BOT_UA_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /scraper/i, /wget/i, /curl/i,
  /python-requests/i, /python-urllib/i, /go-http-client/i,
  /java\//i, /apache-httpclient/i, /okhttp/i,
  /libwww/i, /lwp-/i, /mechanize/i, /scrapy/i,
  /phantomjs/i, /headless/i, /selenium/i, /puppeteer/i,
  /node-fetch/i, /axios/i, /got\//i, /undici/i,
  /postman/i, /insomnia/i, /httpie/i,
];

// ─── SLIDING WINDOW TRACKER ─────────────────────────────────
class SlidingWindowTracker {
  constructor(maxEntries = 50000) {
    this.maxEntries = maxEntries;
    this.windows = new Map(); // key → { timestamps: [], errors: [], keys: Set }
  }

  _getOrCreate(ip) {
    if (!this.windows.has(ip)) {
      // Evict oldest entry if at capacity
      if (this.windows.size >= this.maxEntries) {
        const oldest = this.windows.keys().next().value;
        this.windows.delete(oldest);
      }
      this.windows.set(ip, {
        timestamps: [],
        errors: [],
        keys: new Set(),
      });
    }
    return this.windows.get(ip);
  }

  /**
   * Record a request from an IP
   * @param {string} ip
   * @param {object} meta
   * @param {string|null} meta.apiKey — the API key used
   * @param {boolean} meta.isError — whether the request resulted in 4xx/5xx
   */
  record(ip, meta = {}) {
    const entry = this._getOrCreate(ip);
    const now = Date.now();

    entry.timestamps.push(now);
    if (meta.apiKey) entry.keys.add(meta.apiKey);
    if (meta.isError) entry.errors.push(now);

    // Prune old entries (keep last 1 hour)
    const oneHourAgo = now - 60 * 60 * 1000;
    entry.timestamps = entry.timestamps.filter((t) => t > oneHourAgo);
    entry.errors = entry.errors.filter((t) => t > oneHourAgo);
  }

  /**
   * Get request counts for an IP
   */
  getCounts(ip) {
    const entry = this.windows.get(ip);
    if (!entry) return { lastMinute: 0, lastHour: 0, uniqueKeys: 0, errorsLastMinute: 0 };

    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneSecondAgo = now - 1000;

    return {
      lastSecond: entry.timestamps.filter((t) => t > oneSecondAgo).length,
      lastMinute: entry.timestamps.filter((t) => t > oneMinuteAgo).length,
      lastHour: entry.timestamps.length,
      uniqueKeys: entry.keys.size,
      errorsLastMinute: entry.errors.filter((t) => t > oneMinuteAgo).length,
    };
  }
}

const tracker = new SlidingWindowTracker();

// ─── BOT DETECTION ───────────────────────────────────────────

/**
 * Analyze a request for bot signals
 * @param {import("express").Request} req
 * @returns {{ isBot: boolean, botConfidence: number, botSignals: string[] }}
 */
function detectBot(req) {
  const signals = [];
  let confidence = 0;

  const ua = req.headers["user-agent"];

  // No User-Agent
  if (!ua) {
    signals.push("missing_user_agent");
    confidence += 0.3;
  } else if (BOT_UA_PATTERNS.some((p) => p.test(ua))) {
    signals.push("bot_user_agent");
    confidence += 0.4;
  }

  // Missing Accept-Language (browsers always send this)
  if (!req.headers["accept-language"]) {
    signals.push("missing_accept_language");
    confidence += 0.15;
  }

  // Missing Accept header
  if (!req.headers["accept"] || req.headers["accept"] === "*/*") {
    signals.push("generic_accept_header");
    confidence += 0.1;
  }

  // Check request rate
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const counts = tracker.getCounts(ip);

  if (counts.lastMinute > 30) {
    signals.push("high_request_rate");
    confidence += 0.25;
  }

  if (counts.lastSecond > 5) {
    signals.push("burst_requests");
    confidence += 0.2;
  }

  // Clamp confidence to 0-1
  confidence = Math.min(1, confidence);

  return {
    isBot: confidence >= 0.5,
    botConfidence: parseFloat(confidence.toFixed(2)),
    botSignals: signals,
  };
}

// ─── ABUSE DETECTION ─────────────────────────────────────────

/**
 * Analyze request patterns for abuse signals
 * @param {string} ip
 * @returns {{ isAbusive: boolean, abuseSignals: string[], requestsLastMinute: number, requestsLastHour: number }}
 */
function detectAbuse(ip) {
  const counts = tracker.getCounts(ip);
  const signals = [];

  // Many different API keys from same IP (credential stuffing)
  if (counts.uniqueKeys > 10) {
    signals.push("key_rotation_detected");
  }

  // High error rate from same IP
  if (counts.errorsLastMinute > 10) {
    signals.push("high_error_rate");
  }

  // Extreme request volume
  if (counts.lastMinute > 60) {
    signals.push("extreme_request_volume");
  }

  // Burst pattern
  if (counts.lastSecond > 10) {
    signals.push("burst_pattern");
  }

  return {
    isAbusive: signals.length >= 2,
    abuseSignals: signals,
    requestsLastMinute: counts.lastMinute,
    requestsLastHour: counts.lastHour,
  };
}

/**
 * Express middleware to track requests for abuse/bot detection
 */
function trackRequest(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";

  // Record on response finish to capture error status
  res.on("finish", () => {
    tracker.record(ip, {
      apiKey: req.headers["x-api-key"] || req.query?.api_key || null,
      isError: res.statusCode >= 400,
    });
  });

  next();
}

module.exports = { detectBot, detectAbuse, trackRequest, tracker };
