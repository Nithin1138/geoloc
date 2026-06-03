/**
 * API Key Management & Rate Limiting
 *
 * PRODUCTION: Replace in-memory Map with:
 *   - PostgreSQL (via pg / prisma)
 *   - Redis (for rate limit counters — scales across multiple instances)
 *   - MongoDB (via mongoose)
 *
 * Recommended production stack:
 *   - Keys stored in PostgreSQL
 *   - Rate limit counters in Redis (use ioredis + sliding window)
 *   - Stripe webhook creates key on payment
 */

const { v4: uuidv4 } = require("uuid");
const fs = require("fs");
const path = require("path");


// ─── PLAN DEFINITIONS ────────────────────────────────────────
const PLANS = {
  free: {
    name: "Free",
    priceINR: 0,
    priceUSD: 0,
    requestsPerDay: 1000,
    requestsPerMonth: 10000,
    features: ["basic lookup", "country + city", "timezone"],
    rateLimit: "1,000 req/day",
  },
  starter: {
    name: "Starter",
    priceINR: 499,
    priceUSD: 6,
    requestsPerDay: 10000,
    requestsPerMonth: 100000,
    features: ["basic lookup", "country + city", "timezone", "ASN/ISP", "currency", "calling code"],
    rateLimit: "10,000 req/day",
  },
  pro: {
    name: "Pro",
    priceINR: 1999,
    priceUSD: 24,
    requestsPerDay: 100000,
    requestsPerMonth: 1000000,
    features: ["all starter features", "bulk lookup", "self-lookup", "detailed subdivisions"],
    rateLimit: "100,000 req/day",
  },
  enterprise: {
    name: "Enterprise",
    priceINR: 9999,
    priceUSD: 120,
    requestsPerDay: 1000000,
    rateLimit: "1,000,000 req/day",
  },
};

// ─── FILE PERSISTENCE (DEPRECATED FOR MONGODB) ─────────────────
const { ApiKey } = require("../db");

// Load local keys.json database values into MongoDB (migration helper)
async function migrateJSONtoMongo() {
  const KEYS_FILE = path.join(__dirname, "..", "data", "keys.json");
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = fs.readFileSync(KEYS_FILE, "utf8");
      const entries = JSON.parse(data);
      console.log(`📦 Found ${entries.length} keys in keys.json — checking migration...`);
      for (const [key, record] of entries) {
        const exists = await ApiKey.findOne({ key });
        if (!exists) {
          await ApiKey.create({
            key: record.key,
            plan: record.plan,
            active: record.active || true,
            created: record.created || new Date(),
            todayCount: record.todayCount || 0,
            monthCount: record.monthCount || 0,
            totalCount: record.totalCount || 0,
            lastReset: record.lastReset || new Date().toDateString(),
            lastUsed: record.lastUsed || null,
            email: record.email || null,
            paymentId: record.paymentId || null,
            orderId: record.orderId || null,
            source: record.source || "migration"
          });
        }
      }
      console.log("✅ JSON Migration complete");
    }
  } catch (err) {
    console.error("❌ Failed to migrate JSON keys to MongoDB:", err.message);
  }
}

// Trigger migrations asynchronously
setTimeout(migrateJSONtoMongo, 2000);

// ─── KEY MANAGEMENT ──────────────────────────────────────────
async function createKey(plan = "free", metadata = {}) {
  if (!PLANS[plan]) throw new Error(`Unknown plan: ${plan}`);
  const key = `geo_${plan}_${uuidv4().replace(/-/g, "").substring(0, 20)}`;
  
  const record = await ApiKey.create({
    key,
    plan,
    active: true,
    created: new Date(),
    todayCount: 0,
    monthCount: 0,
    totalCount: 0,
    lastReset: new Date().toDateString(),
    lastUsed: null,
    ...metadata,
  });

  return { key: record.key, plan: record.plan, limits: PLANS[record.plan] };
}

async function getKey(key) {
  return await ApiKey.findOne({ key });
}

async function getKeyStats(key) {
  const record = await ApiKey.findOne({ key });
  if (!record) return null;
  const plan = PLANS[record.plan];
  return {
    plan: record.plan,
    active: record.active,
    usage: {
      today: record.todayCount,
      thisMonth: record.monthCount,
      allTime: record.totalCount,
    },
    limits: {
      perDay: plan.requestsPerDay,
      perMonth: plan.requestsPerMonth,
    },
    remaining: {
      today: Math.max(0, plan.requestsPerDay - record.todayCount),
      thisMonth: Math.max(0, plan.requestsPerMonth - record.monthCount),
    },
    lastUsed: record.lastUsed,
    created: record.created,
  };
}

// ─── USAGE TRACKING ──────────────────────────────────────────
async function checkAndTrack(key, skipTrack = false) {
  const record = await ApiKey.findOne({ key });
  if (!record) return { allowed: false, reason: "Invalid API key" };
  if (!record.active) return { allowed: false, reason: "API key is disabled" };

  const plan = PLANS[record.plan];
  const today = new Date().toDateString();

  // Reset daily counter at midnight
  if (record.lastReset !== today) {
    record.todayCount = 0;
    record.lastReset = today;
  }

  if (record.todayCount >= plan.requestsPerDay) {
    return {
      allowed: false,
      reason: "Daily request limit reached",
      limit: plan.requestsPerDay,
      resetAt: "midnight UTC",
      upgrade: "https://yourdomain.com/pricing",
    };
  }

  if (record.monthCount >= plan.requestsPerMonth) {
    return {
      allowed: false,
      reason: "Monthly request limit reached",
      limit: plan.requestsPerMonth,
    };
  }

  if (!skipTrack) {
    record.todayCount++;
    record.monthCount++;
    record.totalCount++;
    record.lastUsed = new Date();
    await record.save();
  }

  const remaining = {
    today: plan.requestsPerDay - record.todayCount,
    month: plan.requestsPerMonth - record.monthCount,
  };

  return { allowed: true, plan: record.plan, remaining, record };
}

// ─── MIDDLEWARE ───────────────────────────────────────────────
async function requireApiKey(req, res, next) {
  const key =
    req.headers["x-api-key"] ||
    req.headers["authorization"]?.replace(/^Bearer\s+/i, "") ||
    req.query.api_key;

  if (!key) {
    return res.status(401).json({
      success: false,
      error: "API key required",
      how: "Add header: X-Api-Key: your_key  OR  query param: ?api_key=your_key",
      getKey: "GET /keys/new?plan=free",
    });
  }

  const record = await getKey(key);
  if (!record) {
    return res.status(401).json({
      success: false,
      error: "Invalid or expired API key",
      hint: "Sign up at https://yourdomain.com for a free key",
    });
  }

  const skipTrack = req.originalUrl?.includes("/keys/stats") || false;
  const usage = await checkAndTrack(key, skipTrack);
  if (!usage.allowed) {
    return res.status(429).json({
      success: false,
      error: usage.reason,
      ...(usage.limit && { limit: usage.limit }),
      ...(usage.resetAt && { resetAt: usage.resetAt }),
      ...(usage.upgrade && { upgrade: usage.upgrade }),
    });
  }

  req.apiKey = record;
  req.plan = usage.plan;
  req.usage = usage;

  const plan = PLANS[usage.plan];
  res.setHeader("X-RateLimit-Limit-Day",       plan.requestsPerDay);
  res.setHeader("X-RateLimit-Remaining-Day",   usage.remaining.today);
  res.setHeader("X-RateLimit-Limit-Month",     plan.requestsPerMonth);
  res.setHeader("X-RateLimit-Remaining-Month", usage.remaining.month);
  res.setHeader("X-Plan",                      usage.plan);

  next();
}

function requirePlan(...allowedPlans) {
  return (req, res, next) => {
    if (!allowedPlans.includes(req.plan)) {
      return res.status(403).json({
        success: false,
        error: `This endpoint requires a ${allowedPlans.join(" or ")} plan`,
        yourPlan: req.plan,
        upgrade: "https://yourdomain.com/pricing",
      });
    }
    next();
  };
}

async function getKeyByPaymentId(paymentId) {
  if (!paymentId) return null;
  return await ApiKey.findOne({ paymentId });
}

async function getKeyByEmail(email, plan) {
  if (!email) return null;
  const targetEmail = email.trim().toLowerCase();
  return await ApiKey.findOne({ email: targetEmail, plan });
}

module.exports = { requireApiKey, requirePlan, createKey, getKey, getKeyStats, getKeyByPaymentId, getKeyByEmail, PLANS };


