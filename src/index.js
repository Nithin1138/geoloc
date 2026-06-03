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
const { initTransporter } = require("./services/email");
const ipRouter = require("./routes/ip");
const keysRouter = require("./routes/keys");
const paymentsRouter = require("./routes/payments");
const webhooksRouter = require("./routes/webhooks");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── SECURITY MIDDLEWARE ──────────────────────────────────────
// Disable Helmet temporarily to diagnose browser stylesheet blocking
// app.use(helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       scriptSrc: ["'self'", "'unsafe-inline'", "https://checkout.razorpay.com"],
//       frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
//       connectSrc: ["'self'", "https://lumberjack.razorpay.com", "https://api.razorpay.com"],
//       styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
//       fontSrc: ["'self'", "https://fonts.gstatic.com"],
//       imgSrc: ["'self'", "data:", "https:"],
//     },
//   },
//   crossOriginEmbedderPolicy: false,
//   crossOriginResourcePolicy: { policy: "cross-origin" },
// }));
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "100kb" }));

// ─── STATIC FILES (Landing page, Pricing, Dashboard) ─────────
app.use(express.static(path.join(__dirname, "..", "public")));

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

// API info endpoint (moved from / to /api so landing page can be served)
app.get("/api", (req, res) => {
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

// ─── PROTECTED & PAYMENT ROUTES ──────────────────────────────
app.use("/api/ip", ipRouter);
app.use("/keys", keysRouter);
app.use("/payments", paymentsRouter);
app.use("/webhooks", webhooksRouter);

// ─── 404 & ERROR HANDLERS ─────────────────────────────────────
app.use((req, res) => {
  // Only return JSON 404 for API-like paths
  if (req.path.startsWith("/api/") || req.path.startsWith("/keys/") || req.path.startsWith("/payments/") || req.path.startsWith("/webhooks/")) {
    return res.status(404).json({
      success: false,
      error: `${req.method} ${req.path} not found`,
      hint: "GET /api for all available endpoints",
    });
  }
  // For other paths, serve the landing page (SPA-style fallback)
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ─── BOOT ─────────────────────────────────────────────────────
async function start() {
  try {
    await loadDatabases();

    // Initialize email transporter
    initTransporter();

    app.listen(PORT, () => {
      console.log(`\n🌍 IP Geolocation API running → http://localhost:${PORT}`);
      console.log(`\n📄 Pages:`);
      console.log(`   Landing:   http://localhost:${PORT}/`);
      console.log(`   Pricing:   http://localhost:${PORT}/pricing.html`);
      console.log(`   Dashboard: http://localhost:${PORT}/dashboard.html`);
      console.log(`\n📋 Quick test commands:`);
      console.log(`   curl -H "X-Api-Key: test_free_geo123" http://localhost:${PORT}/api/ip/81.2.69.142`);
      console.log(`   curl -H "X-Api-Key: test_free_geo123" http://localhost:${PORT}/api/ip/me`);
      console.log(`   curl http://localhost:${PORT}/keys/plans\n`);
    });
  } catch (err) {
    console.error("❌ Failed to start:", err.message);
    process.exit(1);
  }
}

start();
module.exports = app;
