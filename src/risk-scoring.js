/**
 * Risk Scoring Engine
 *
 * Combines signals from threat lists, ASN analysis, and geolocation data
 * into a single 0–100 risk score with a human-readable level.
 *
 * Scoring algorithm:
 *   TOR exit node       → +40
 *   Known VPN IP         → +30
 *   Known proxy IP       → +25
 *   Datacenter IP        → +20
 *   Hosting provider ASN → +10 (if not already datacenter)
 *   Country mismatch     → +5  (geo vs registered country)
 *   High accuracy radius → +5  (>200km = imprecise location)
 *
 * Risk levels:
 *   0–15   → low      (clean residential IP)
 *   16–39  → medium   (some signals, possibly VPN)
 *   40–69  → high     (strong anonymity/proxy signals)
 *   70–100 → critical (TOR + multiple signals)
 */

const { getThreatFlags } = require("./threat-lists");
const { isHostingProvider } = require("./hosting-providers");

/**
 * Calculate risk score for an IP address
 *
 * @param {string} ip — The IP address
 * @param {object} opts
 * @param {object|null} opts.asnData — { asn, asnNumber, organization }
 * @param {object|null} opts.geoData — lookupCity() result
 * @returns {{ score: number, level: string, signals: string[], isTor: boolean, isVPN: boolean, isProxy: boolean, isDatacenter: boolean, isHosting: boolean }}
 */
function calculateRiskScore(ip, opts = {}) {
  const { asnData, geoData } = opts;

  let score = 0;
  const signals = [];

  // ─── Threat list signals ───────────────────────────────────
  const threats = getThreatFlags(ip);

  if (threats.isTor) {
    score += 40;
    signals.push("tor_exit_node");
  }

  if (threats.isVPN) {
    score += 30;
    signals.push("known_vpn");
  }

  if (threats.isProxy) {
    score += 25;
    signals.push("known_proxy");
  }

  if (threats.isDatacenter) {
    score += 20;
    signals.push("datacenter_ip");
  }

  // ─── ASN signals ───────────────────────────────────────────
  const isHosting = asnData ? isHostingProvider(asnData.organization) : false;

  if (isHosting && !threats.isDatacenter) {
    // Only add points if we didn't already flag as datacenter
    score += 10;
    signals.push("hosting_provider_asn");
  }

  // ─── Geo signals ───────────────────────────────────────────
  if (geoData) {
    // Country mismatch between geo location and registered country
    if (
      geoData.country?.isoCode &&
      geoData.registeredCountry?.isoCode &&
      geoData.country.isoCode !== geoData.registeredCountry.isoCode
    ) {
      score += 5;
      signals.push("country_mismatch");
    }

    // Very imprecise geolocation
    if (geoData.location?.accuracyRadius && geoData.location.accuracyRadius > 200) {
      score += 5;
      signals.push("imprecise_location");
    }
  }

  // Clamp to 0-100
  score = Math.min(100, Math.max(0, score));

  // Determine risk level
  let level;
  if (score <= 15) level = "low";
  else if (score <= 39) level = "medium";
  else if (score <= 69) level = "high";
  else level = "critical";

  return {
    score,
    level,
    signals,
    isTor: threats.isTor,
    isVPN: threats.isVPN,
    isProxy: threats.isProxy,
    isDatacenter: threats.isDatacenter,
    isHosting,
  };
}

module.exports = { calculateRiskScore };
