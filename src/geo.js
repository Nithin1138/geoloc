/**
 * MaxMind GeoLite2 Database Loader
 *
 * PRODUCTION SETUP:
 * 1. Register free at: https://www.maxmind.com/en/geolite2/signup
 * 2. Get your license key from account dashboard
 * 3. Set env: MAXMIND_LICENSE_KEY=your_key
 * 4. Run: node scripts/download-db.js
 *
 * Databases auto-update every 2 weeks — schedule a cron job for that.
 *
 * FREE TIER LIMITS: None — GeoLite2 is completely free with signup.
 * ACCURACY: ~98% country, ~80% city, varies by region.
 */

const maxmind = require("maxmind");
const path = require("path");
const fs = require("fs");
const { isHostingProvider, getProviderName, getAsnType } = require("./hosting-providers");

const DB_DIR = path.join(__dirname, "..", "data");
const CITY_DB_PATH = path.join(DB_DIR, "GeoLite2-City.mmdb");
const ASN_DB_PATH = path.join(DB_DIR, "GeoLite2-ASN.mmdb");

let cityReader = null;
let asnReader = null;
let dbLoadedAt = null;

async function loadDatabases() {
  const cityExists = fs.existsSync(CITY_DB_PATH);
  const asnExists = fs.existsSync(ASN_DB_PATH);

  if (!cityExists) {
    throw new Error(
      `GeoLite2-City.mmdb not found at ${CITY_DB_PATH}\n` +
      `Run: node scripts/download-db.js  (after setting MAXMIND_LICENSE_KEY env var)\n` +
      `Or sign up free at: https://www.maxmind.com/en/geolite2/signup`
    );
  }

  console.log("📦 Loading GeoLite2-City database...");
  cityReader = await maxmind.open(CITY_DB_PATH);
  console.log("✅ City database loaded");

  if (asnExists) {
    console.log("📦 Loading GeoLite2-ASN database...");
    asnReader = await maxmind.open(ASN_DB_PATH);
    console.log("✅ ASN database loaded");
  } else {
    console.warn("⚠️  GeoLite2-ASN.mmdb not found — ASN data will be unavailable");
  }

  dbLoadedAt = new Date();
  const stats = fs.statSync(CITY_DB_PATH);
  console.log(`📅 City DB last modified: ${stats.mtime.toISOString()}`);
}

/**
 * Look up full geolocation for an IP
 * Returns a clean, normalized object
 */
function lookupCity(ip) {
  if (!cityReader) throw new Error("Database not loaded. Call loadDatabases() first.");

  const raw = cityReader.get(ip);
  if (!raw) return null;

  const en = (obj) => obj?.names?.en || obj?.names?.["en"] || null;

  return {
    city: en(raw.city) || null,
    subdivisions: raw.subdivisions?.map(s => ({
      name: en(s),
      isoCode: s.iso_code
    })) || [],
    country: {
      name: en(raw.country),
      isoCode: raw.country?.iso_code || null,
    },
    continent: {
      name: en(raw.continent),
      code: raw.continent?.code || null,
    },
    location: {
      latitude: raw.location?.latitude || null,
      longitude: raw.location?.longitude || null,
      accuracyRadius: raw.location?.accuracy_radius || null,
      timeZone: raw.location?.time_zone || null,
    },
    postal: raw.postal?.code || null,
    registeredCountry: {
      name: en(raw.registered_country),
      isoCode: raw.registered_country?.iso_code || null,
    },
  };
}

/**
 * Look up ASN (Internet Service Provider) info
 * Enhanced with hosting provider detection and network type classification
 */
function lookupASN(ip) {
  if (!asnReader) return null;
  const raw = asnReader.get(ip);
  if (!raw) return null;

  const org = raw.autonomous_system_organization || null;

  return {
    asn: raw.autonomous_system_number ? `AS${raw.autonomous_system_number}` : null,
    asnNumber: raw.autonomous_system_number || null,
    organization: org,
    // Enhanced fields
    networkType: getAsnType(org),
    isHosting: isHostingProvider(org),
    hostingProvider: getProviderName(org),
  };
}

function getDbStatus() {
  return {
    cityDb: {
      loaded: cityReader !== null,
      path: CITY_DB_PATH,
      exists: fs.existsSync(CITY_DB_PATH),
      lastModified: fs.existsSync(CITY_DB_PATH)
        ? fs.statSync(CITY_DB_PATH).mtime.toISOString()
        : null,
    },
    asnDb: {
      loaded: asnReader !== null,
      path: ASN_DB_PATH,
      exists: fs.existsSync(ASN_DB_PATH),
    },
    loadedAt: dbLoadedAt?.toISOString() || null,
  };
}

module.exports = { loadDatabases, lookupCity, lookupASN, getDbStatus };
