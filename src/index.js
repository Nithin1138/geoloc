/**
 * IP Geolocation API — Main Server
 * Uses MaxMind GeoLite2 (free) — zero per-request cost
 *
 * QUICK START:
 *   npm install
 *   npm start
 *
 * TEST:
 *   curl -H "X-Api-Key: test_free_geo123" http://localhost:3000/api/ip/8.8.8.8
 */

const express = require("express");
const path = require("path");

// Attempt to load .env file natively (Node 20.12+)
try {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env"));
} catch (e) {}

const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { loadDatabases, getDbStatus } = require("./geo");
const ipRouter = require("./routes/ip");
const keysRouter = require("./routes/keys");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "100kb" }));

// Global IP-level rate limit (brute force protection, BEFORE key auth)
app.use(
  rateLimit({
    windowMs: 60 * 1000,        // 1 minute window
    max: 120,                    // 120 req/min per IP (2/sec burst)
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: "Too many requests from this IP. Slow down." },
  })
);

// ─── PUBLIC ROUTES ────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    name: "IP Geolocation API",
    version: "1.0.0",
    description: "Fast, accurate IP geolocation powered by MaxMind GeoLite2",
    endpoints: {
      lookupIP:      "GET  /api/ip/:ip",
      selfLookup:    "GET  /api/ip/me",
      countryOnly:   "GET  /api/ip/:ip/country",
      bulkLookup:    "POST /api/ip/bulk          (Pro+)",
      generateKey:   "POST /keys/new?plan=free",
      keyStats:      "GET  /keys/stats           (auth required)",
      plans:         "GET  /keys/plans",
      health:        "GET  /health",
      dbStatus:      "GET  /status",
    },
    auth: "X-Api-Key header OR ?api_key= query param",
    testKeys: {
      free:    "test_free_geo123    (1,000 req/day)",
      starter: "test_starter_geo456 (10,000 req/day)",
      pro:     "test_pro_geo789     (100,000 req/day + bulk)",
    },
    pricing: {
      free:       "₹0 — 1,000 req/day",
      starter:    "₹499/mo — 10,000 req/day",
      pro:        "₹1,999/mo — 100,000 req/day + bulk",
      enterprise: "₹9,999/mo — 1M req/day + SLA",
    },
    exampleResponse: "GET /api/ip/81.2.69.142 with your key",
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: `${process.uptime().toFixed(1)}s`,
    timestamp: new Date().toISOString(),
    memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB`,
  });
});

app.get("/status", (req, res) => {
  const dbStatus = getDbStatus();
  res.json({
    status: dbStatus.cityDb.loaded ? "operational" : "degraded",
    databases: dbStatus,
    dataSource: "MaxMind GeoLite2",
    dataLicense: "CC BY-SA 4.0",
    attribution: "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com",
  });
});

// ─── PROTECTED ROUTES ─────────────────────────────────────────
app.use("/api/ip", ipRouter);
app.use("/keys", keysRouter);

// ─── 404 & ERROR HANDLERS ─────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `${req.method} ${req.path} not found`,
    hint: "GET / for all available endpoints",
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ─── BOOT ─────────────────────────────────────────────────────
async function start() {
  try {
    await loadDatabases();

    app.listen(PORT, () => {
      console.log(`\n🌍 IP Geolocation API running → http://localhost:${PORT}`);
      console.log(`\n📋 Quick test commands:`);
      console.log(`   curl -H "X-Api-Key: test_free_geo123" http://localhost:${PORT}/api/ip/81.2.69.142`);
      console.log(`   curl -H "X-Api-Key: test_free_geo123" http://localhost:${PORT}/api/ip/me`);
      console.log(`   curl -H "X-Api-Key: test_free_geo123" http://localhost:${PORT}/api/ip/2.125.160.216/country`);
      console.log(`   curl http://localhost:${PORT}/keys/plans\n`);
    });
  } catch (err) {
    console.error("❌ Failed to start:", err.message);
    process.exit(1);
  }
}

start();
module.exports = app;
