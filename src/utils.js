/**
 * IP Validation & Utility Functions
 * Pure Node.js — zero external dependencies
 */

const net = require("net");

// Well-known private/special IP ranges
const PRIVATE_RANGES_V4 = [
  { start: ip2long("10.0.0.0"),      end: ip2long("10.255.255.255"),    label: "Private (RFC 1918)" },
  { start: ip2long("172.16.0.0"),    end: ip2long("172.31.255.255"),    label: "Private (RFC 1918)" },
  { start: ip2long("192.168.0.0"),   end: ip2long("192.168.255.255"),   label: "Private (RFC 1918)" },
  { start: ip2long("127.0.0.0"),     end: ip2long("127.255.255.255"),   label: "Loopback" },
  { start: ip2long("169.254.0.0"),   end: ip2long("169.254.255.255"),   label: "Link-local" },
  { start: ip2long("100.64.0.0"),    end: ip2long("100.127.255.255"),   label: "Shared Address (RFC 6598)" },
  { start: ip2long("0.0.0.0"),       end: ip2long("0.255.255.255"),     label: "Reserved" },
  { start: ip2long("192.0.0.0"),     end: ip2long("192.0.0.255"),       label: "Reserved (IETF)" },
  { start: ip2long("192.0.2.0"),     end: ip2long("192.0.2.255"),       label: "Documentation (TEST-NET-1)" },
  { start: ip2long("198.18.0.0"),    end: ip2long("198.19.255.255"),    label: "Benchmarking" },
  { start: ip2long("198.51.100.0"),  end: ip2long("198.51.100.255"),    label: "Documentation (TEST-NET-2)" },
  { start: ip2long("203.0.113.0"),   end: ip2long("203.0.113.255"),     label: "Documentation (TEST-NET-3)" },
  { start: ip2long("224.0.0.0"),     end: ip2long("239.255.255.255"),   label: "Multicast" },
  { start: ip2long("240.0.0.0"),     end: ip2long("255.255.255.255"),   label: "Reserved/Broadcast" },
];

function ip2long(ip) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Validate an IP address (v4 or v6)
 */
function validateIP(ip) {
  if (!ip || typeof ip !== "string") return { valid: false, error: "IP address is required" };
  const trimmed = ip.trim();
  if (net.isIPv4(trimmed)) return { valid: true, version: 4, ip: trimmed };
  if (net.isIPv6(trimmed)) return { valid: true, version: 6, ip: trimmed };
  return { valid: false, error: `"${trimmed}" is not a valid IPv4 or IPv6 address` };
}

/**
 * Check if IPv4 is in a private/special range
 */
function getIPv4Type(ip) {
  const long = ip2long(ip);
  for (const range of PRIVATE_RANGES_V4) {
    if (long >= range.start && long <= range.end) {
      return { isPublic: false, type: range.label };
    }
  }
  return { isPublic: true, type: "Public" };
}

/**
 * Check if IPv6 is special
 */
function getIPv6Type(ip) {
  if (ip === "::1") return { isPublic: false, type: "Loopback" };
  if (ip.startsWith("fe80:")) return { isPublic: false, type: "Link-local" };
  if (ip.startsWith("fc") || ip.startsWith("fd")) return { isPublic: false, type: "Unique Local (RFC 4193)" };
  if (ip.startsWith("ff")) return { isPublic: false, type: "Multicast" };
  return { isPublic: true, type: "Public" };
}

/**
 * Extract client IP from Express request
 * Handles proxies (Cloudflare, Nginx, load balancers)
 */
function getClientIP(req) {
  const cfIP = req.headers["cf-connecting-ip"];
  const forwardedFor = req.headers["x-forwarded-for"];
  const realIP = req.headers["x-real-ip"];
  const remoteAddr = req.socket?.remoteAddress;

  if (cfIP && net.isIP(cfIP)) return cfIP;
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0].trim();
    if (net.isIP(first)) return first;
  }
  if (realIP && net.isIP(realIP)) return realIP;
  // Strip IPv6-mapped IPv4 prefix
  if (remoteAddr?.startsWith("::ffff:")) return remoteAddr.slice(7);
  return remoteAddr || "127.0.0.1";
}

/**
 * Currency codes by country (ISO 3166 → ISO 4217)
 */
const COUNTRY_CURRENCY = {
  IN: "INR", US: "USD", GB: "GBP", EU: "EUR", DE: "EUR", FR: "EUR",
  JP: "JPY", CN: "CNY", AU: "AUD", CA: "CAD", SG: "SGD", AE: "AED",
  BR: "BRL", RU: "RUB", KR: "KRW", MX: "MXN", ZA: "ZAR", NG: "NGN",
  PK: "PKR", BD: "BDT", ID: "IDR", TH: "THB", MY: "MYR", PH: "PHP",
  EG: "EGP", SA: "SAR", TR: "TRY", AR: "ARS", NZ: "NZD", CH: "CHF",
  SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", HK: "HKD", IL: "ILS",
};

/**
 * Calling codes by country
 */
const COUNTRY_CALLING_CODE = {
  IN: "+91", US: "+1", GB: "+44", DE: "+49", FR: "+33", JP: "+81",
  CN: "+86", AU: "+61", CA: "+1", SG: "+65", AE: "+971", BR: "+55",
  RU: "+7", KR: "+82", MX: "+52", ZA: "+27", NG: "+234", PK: "+92",
  BD: "+880", ID: "+62", TH: "+66", MY: "+60", PH: "+63", EG: "+20",
  SA: "+966", TR: "+90", AR: "+54", NZ: "+64", CH: "+41", SE: "+46",
  NO: "+47", DK: "+45", PL: "+48", HK: "+852", IL: "+972", IT: "+39",
  ES: "+34", NL: "+31", BE: "+32", AT: "+43", PT: "+351",
};

module.exports = { validateIP, getIPv4Type, getIPv6Type, getClientIP, COUNTRY_CURRENCY, COUNTRY_CALLING_CODE };
