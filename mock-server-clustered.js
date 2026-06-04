#!/usr/bin/env node
/**
 * Mock Production Server with Clustering
 * Simulates production environment with multi-core clustering + compression
 */

const express = require("express");
const cluster = require("cluster");
const compression = require("compression");
const path = require("path");
const cors = require("cors");

const PORT = process.env.PORT || 3000;
const NUM_WORKERS = process.env.WORKERS || require("os").cpus().length;

// Simulated response data
const mockGeoData = {
  ip: "8.8.8.8",
  version: "IPv4",
  type: "public",
  isPublic: true,
  geo: {
    country: "United States",
    countryCode: "US",
    continent: "North America",
    continentCode: "NA",
    city: "Mountain View",
    region: "California",
    regionCode: "CA",
    postal: "94040",
    latitude: 37.386,
    longitude: -122.084,
    accuracyRadiusKm: 1,
    timezone: "America/Los_Angeles",
    utcOffset: "UTC-7",
    currency: "USD",
    callingCode: "+1",
  },
  network: {
    asn: 15169,
    organization: "Google LLC",
  },
};

const app = express();

// Optimizations (same as production)
app.use(compression()); // Gzip
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "100kb" }));

// Simple rate limit and auth
app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !apiKey.startsWith("test_")) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
});

// Main API endpoint
app.get("/api/ip/:ip", (req, res) => {
  res.json({
    success: true,
    data: mockGeoData,
    meta: {
      source: "MaxMind GeoLite2 (Mock)",
      plan: "free",
      cached: Math.random() > 0.2, // Simulate 80% cache hit rate
    },
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime().toFixed(1),
    pid: process.pid,
    memory: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(1)}MB`,
  });
});

// Clustering
if (cluster.isMaster) {
  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      cluster.fork();
    }
  });
} else {
  app.listen(PORT, () => {
    if (process.env.VERBOSE) {
      console.log(`Worker ${process.pid} listening on ${PORT}`);
    }
  });
}

module.exports = app;
