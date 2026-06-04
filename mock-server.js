/**
 * Mock API Server for Stress Testing
 * Simulates the IP Geolocation API without requiring MaxMind database
 */

const express = require("express");
const app = express();
const PORT = 3000;

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

// Middleware
app.use(express.json());

// Simple API key validation
app.use((req, res, next) => {
  const apiKey = req.headers["x-api-key"];
  if (!apiKey || !apiKey.startsWith("test_")) {
    return res.status(401).json({ error: "Invalid API key" });
  }
  next();
});

// IP Geolocation endpoint
app.get("/api/ip/:ip", (req, res) => {
  // Simulate slight processing delay (1-10ms)
  const delay = Math.floor(Math.random() * 10);
  setTimeout(() => {
    res.json(mockGeoData);
  }, delay);
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`\n✅ Mock API Server running on http://localhost:${PORT}`);
  console.log(`📊 Ready for stress testing on /api/ip/:ip\n`);
});
