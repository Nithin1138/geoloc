/**
 * IP Geolocation Routes
 *
 * Endpoints:
 *   GET /api/ip/:ip          — look up any IP
 *   GET /api/ip/me           — look up caller's IP (self-lookup)
 *   POST /api/ip/bulk        — look up multiple IPs (Pro+)
 *   GET /api/ip/:ip/country  — lightweight, country-only response
 */

const express = require("express");
const router = express.Router();
const { lookupCity, lookupASN } = require("../geo");
const { requireApiKey, requirePlan } = require("../middleware/auth");
const {
  validateIP,
  getIPv4Type,
  getIPv6Type,
  getClientIP,
  COUNTRY_CURRENCY,
  COUNTRY_CALLING_CODE,
} = require("../utils");
const { calculateRiskScore } = require("../risk-scoring");
const { detectBot, detectAbuse } = require("../abuse-tracker");

// ─── HELPER: build full response object ──────────────────────
function buildGeoResponse(ip, version, typeInfo, geoData, asnData, plan, req) {
  const countryISO = geoData?.country?.isoCode;
  const tz = geoData?.location?.timeZone;

  // Calculate UTC offset from timezone (approximate)
  let utcOffset = null;
  if (tz) {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        timeZoneName: "shortOffset",
      }).formatToParts(now);
      const offsetPart = parts.find((p) => p.type === "timeZoneName");
      utcOffset = offsetPart?.value?.replace("GMT", "UTC") || null;
    } catch (_) {}
  }

  const base = {
    ip,
    version: `IPv${version}`,
    type: typeInfo.type,
    isPublic: typeInfo.isPublic,
  };

  if (!typeInfo.isPublic || !geoData) {
    return {
      ...base,
      geo: null,
      message: typeInfo.isPublic
        ? "No location data available for this IP"
        : "Private/reserved IP — not geolocatable",
    };
  }

  const geo = {
    country: geoData.country?.name || null,
    countryCode: countryISO || null,
    continent: geoData.continent?.name || null,
    continentCode: geoData.continent?.code || null,
    city: geoData.city || null,
    region: geoData.subdivisions?.[0]?.name || null,
    regionCode: geoData.subdivisions?.[0]?.isoCode || null,
    postal: geoData.postal || null,
    latitude: geoData.location?.latitude || null,
    longitude: geoData.location?.longitude || null,
    accuracyRadiusKm: geoData.location?.accuracyRadius || null,
    timezone: tz || null,
    utcOffset: utcOffset || null,
    currency: COUNTRY_CURRENCY[countryISO] || null,
    callingCode: COUNTRY_CALLING_CODE[countryISO] || null,
  };

  // ASN data (starter+ plans)
  let network;
  if (plan !== "free" && asnData) {
    network = {
      asn: asnData.asn,
      organization: asnData.organization,
      networkType: asnData.networkType,
      isHosting: asnData.isHosting,
      hostingProvider: asnData.hostingProvider,
    };
  }

  // registeredCountry shown when different from geo country
  const registeredCountry =
    geoData.registeredCountry?.isoCode &&
    geoData.registeredCountry?.isoCode !== countryISO
      ? {
          name: geoData.registeredCountry.name,
          isoCode: geoData.registeredCountry.isoCode,
        }
      : undefined;

  // ─── Threat detection (Pro+ plans) ──────────────────────
  let threat;
  if (plan === "pro" || plan === "enterprise") {
    const riskResult = calculateRiskScore(ip, { asnData, geoData });
    threat = {
      risk: {
        score: riskResult.score,
        level: riskResult.level,
      },
      signals: riskResult.signals,
      isTor: riskResult.isTor,
      isVPN: riskResult.isVPN,
      isProxy: riskResult.isProxy,
      isDatacenter: riskResult.isDatacenter,
      isHosting: riskResult.isHosting,
    };
  }

  // ─── Bot & Abuse detection (Enterprise only) ────────────
  let security;
  if (plan === "enterprise" && req) {
    const botResult = detectBot(req);
    const abuseResult = detectAbuse(ip);
    security = {
      bot: {
        isBot: botResult.isBot,
        confidence: botResult.botConfidence,
        signals: botResult.botSignals,
      },
      abuse: {
        isAbusive: abuseResult.isAbusive,
        signals: abuseResult.abuseSignals,
        requestsLastMinute: abuseResult.requestsLastMinute,
        requestsLastHour: abuseResult.requestsLastHour,
      },
    };
  }

  return {
    ...base,
    geo,
    ...(network && { network }),
    ...(registeredCountry && { registeredCountry }),
    ...(threat && { threat }),
    ...(security && { security }),
  };
}

// ─── ROUTES ──────────────────────────────────────────────────

/**
 * GET /api/ip/me
 * Returns geolocation for the caller's own IP
 */
router.get("/me", requireApiKey, (req, res) => {
  const clientIP = getClientIP(req);
  const validation = validateIP(clientIP);

  if (!validation.valid) {
    return res.status(400).json({ success: false, error: `Could not detect client IP: ${validation.error}` });
  }

  const { ip, version } = validation;
  const typeInfo = version === 4 ? getIPv4Type(ip) : getIPv6Type(ip);
  const geoData = typeInfo.isPublic ? lookupCity(ip) : null;
  const asnData = typeInfo.isPublic ? lookupASN(ip) : null;

  // Set resolved country for analytics
  res._resolvedCountry = geoData?.country?.isoCode || null;

  return res.json({
    success: true,
    data: buildGeoResponse(ip, version, typeInfo, geoData, asnData, req.plan, req),
    meta: {
      source: "MaxMind GeoLite2",
      detectedFrom: (() => {
        if (req.headers["cf-connecting-ip"]) return "CF-Connecting-IP header";
        if (req.headers["x-forwarded-for"]) return "X-Forwarded-For header";
        if (req.headers["x-real-ip"]) return "X-Real-IP header";
        return "socket.remoteAddress";
      })(),
      plan: req.plan,
      remaining: req.usage.remaining,
    },
  });
});

/**
 * GET /api/ip/:ip
 * Look up any valid IP address
 */
router.get("/:ip", requireApiKey, (req, res) => {
  const raw = req.params.ip.trim();

  // Convenience: "me" alias
  if (raw.toLowerCase() === "me") {
    return res.redirect(307, "/api/ip/me");
  }

  const validation = validateIP(raw);
  if (!validation.valid) {
    return res.status(400).json({
      success: false,
      error: validation.error,
      example: "/api/ip/8.8.8.8",
    });
  }

  const { ip, version } = validation;
  const typeInfo = version === 4 ? getIPv4Type(ip) : getIPv6Type(ip);

  let geoData = null;
  let asnData = null;

  if (typeInfo.isPublic) {
    geoData = lookupCity(ip);
    asnData = lookupASN(ip);
  }

  // Set resolved country for analytics
  res._resolvedCountry = geoData?.country?.isoCode || null;

  const responseData = buildGeoResponse(ip, version, typeInfo, geoData, asnData, req.plan, req);

  return res.json({
    success: true,
    data: responseData,
    meta: {
      source: "MaxMind GeoLite2",
      plan: req.plan,
      remaining: req.usage.remaining,
    },
  });
});

/**
 * GET /api/ip/:ip/country
 * Lightweight endpoint — country code only (great for free tier / high volume)
 */
router.get("/:ip/country", requireApiKey, (req, res) => {
  const validation = validateIP(req.params.ip.trim());
  if (!validation.valid) {
    return res.status(400).json({ success: false, error: validation.error });
  }

  const { ip, version } = validation;
  const typeInfo = version === 4 ? getIPv4Type(ip) : getIPv6Type(ip);

  if (!typeInfo.isPublic) {
    return res.json({ success: true, ip, country: null, countryCode: null, isPublic: false });
  }

  const geoData = lookupCity(ip);

  return res.json({
    success: true,
    ip,
    country: geoData?.country?.name || null,
    countryCode: geoData?.country?.isoCode || null,
    continent: geoData?.continent?.code || null,
  });
});

/**
 * POST /api/ip/bulk
 * Look up multiple IPs at once — Pro+ only
 * Body: { "ips": ["1.2.3.4", "5.6.7.8", ...] }
 */
router.post(
  "/bulk",
  requireApiKey,
  requirePlan("pro", "enterprise"),
  (req, res) => {
    const { ips } = req.body;

    if (!Array.isArray(ips)) {
      return res.status(400).json({
        success: false,
        error: "Body must be JSON with an 'ips' array",
        example: { ips: ["8.8.8.8", "1.1.1.1"] },
      });
    }

    const MAX_BULK = 100;
    if (ips.length > MAX_BULK) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_BULK} IPs per bulk request`,
        received: ips.length,
      });
    }

    const results = ips.map((raw) => {
      const validation = validateIP(String(raw));
      if (!validation.valid) {
        return { ip: raw, success: false, error: validation.error };
      }

      const { ip, version } = validation;
      const typeInfo = version === 4 ? getIPv4Type(ip) : getIPv6Type(ip);
      const geoData = typeInfo.isPublic ? lookupCity(ip) : null;
      const asnData = typeInfo.isPublic ? lookupASN(ip) : null;

      return {
        ip,
        success: true,
        data: buildGeoResponse(ip, version, typeInfo, geoData, asnData, req.plan, req),
      };
    });

    return res.json({
      success: true,
      count: results.length,
      results,
      meta: { plan: req.plan, remaining: req.usage.remaining },
    });
  }
);

module.exports = router;
