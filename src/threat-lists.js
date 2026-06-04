/**
 * Threat Intelligence Lists — TOR / VPN / Proxy / Datacenter Detection
 *
 * Downloads and maintains free, public threat intelligence lists.
 * All detection is offline — zero external API calls at runtime.
 *
 * Sources:
 *   - TOR exit nodes:  https://check.torproject.org/torbulkexitlist
 *   - VPN IPs:         https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt
 *   - Proxy IPs:       https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt
 *   - Datacenter IPs:  https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt
 */

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const CACHE_DIR = path.join(__dirname, "..", "data", "threat-lists");

const LISTS = {
  tor: {
    url: "https://check.torproject.org/torbulkexitlist",
    file: "tor-exit-nodes.txt",
    set: new Set(),
    parseMode: "ip-per-line",
  },
  vpn: {
    url: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt",
    file: "vpn-ips.txt",
    set: new Set(),
    parseMode: "ip-per-line",
  },
  proxy: {
    url: "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
    file: "proxy-ips.txt",
    set: new Set(),
    parseMode: "ip-port",
  },
  datacenter: {
    url: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt",
    file: "datacenter-ips.txt",
    set: new Set(),
    parseMode: "ip-per-line",
  },
};

let lastRefresh = null;
let refreshInterval = null;

// ─── DOWNLOAD HELPER ─────────────────────────────────────────
function downloadList(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;

    function makeRequest(reqUrl) {
      const req = client.get(reqUrl, { timeout: 10000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      });
      
      req.on("timeout", () => {
        req.destroy();
        reject(new Error(`Timeout downloading ${url}`));
      });
      
      req.on("error", reject);
    }

    makeRequest(url);
  });
}

// ─── PARSE LIST DATA ─────────────────────────────────────────
function parseList(data, mode) {
  const set = new Set();
  const lines = data.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    if (mode === "ip-per-line") {
      // Lines may be IP addresses or CIDR ranges
      const ip = trimmed.split("/")[0].trim();
      if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        set.add(ip);
      }
    } else if (mode === "ip-port") {
      // Format: IP:PORT
      const ip = trimmed.split(":")[0].trim();
      if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
        set.add(ip);
      }
    }
  }

  return set;
}

// ─── LOAD SINGLE LIST ────────────────────────────────────────
async function loadList(name) {
  const list = LISTS[name];
  if (!list) return;

  const cachePath = path.join(CACHE_DIR, list.file);

  try {
    // Try downloading fresh copy
    const data = await downloadList(list.url);
    list.set = parseList(data, list.parseMode);

    // Cache to disk
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, data, "utf8");

    console.log(`   ✅ ${name}: ${list.set.size.toLocaleString()} IPs loaded`);
  } catch (err) {
    // Fallback to cached file
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, "utf8");
      list.set = parseList(data, list.parseMode);
      console.warn(`   ⚠️  ${name}: download failed, loaded ${list.set.size.toLocaleString()} IPs from cache. Error: ${err.message}`);
    } else {
      console.error(`   ❌ ${name}: download failed and no cache available. Error: ${err.message}`);
    }
  }
}

// ─── PUBLIC API ──────────────────────────────────────────────

/**
 * Download and load all threat lists.
 * Called at server startup and periodically.
 */
async function loadThreatLists() {
  console.log("🛡️  Loading threat intelligence lists...");

  await Promise.allSettled([
    loadList("tor"),
    loadList("vpn"),
    loadList("proxy"),
    loadList("datacenter"),
  ]);

  lastRefresh = new Date();
  console.log(`🛡️  Threat lists loaded at ${lastRefresh.toISOString()}`);
}

/**
 * Start periodic auto-refresh (every 6 hours by default).
 */
function startAutoRefresh(intervalMs = 6 * 60 * 60 * 1000) {
  if (refreshInterval) clearInterval(refreshInterval);
  refreshInterval = setInterval(async () => {
    console.log("🔄 Auto-refreshing threat intelligence lists...");
    await loadThreatLists();
  }, intervalMs);
  // Don't keep the process alive just for this timer
  if (refreshInterval.unref) refreshInterval.unref();
}

/** Check if IP is a known TOR exit node */
function isTor(ip) {
  return LISTS.tor.set.has(ip);
}

/** Check if IP is a known VPN endpoint */
function isVPN(ip) {
  return LISTS.vpn.set.has(ip);
}

/** Check if IP is a known proxy */
function isProxy(ip) {
  return LISTS.proxy.set.has(ip);
}

/** Check if IP belongs to a known datacenter */
function isDatacenter(ip) {
  return LISTS.datacenter.set.has(ip);
}

/** Get all threat flags for an IP */
function getThreatFlags(ip) {
  return {
    isTor: isTor(ip),
    isVPN: isVPN(ip),
    isProxy: isProxy(ip),
    isDatacenter: isDatacenter(ip),
  };
}

/** Get stats about loaded threat lists */
function getThreatListStats() {
  return {
    tor: { count: LISTS.tor.set.size },
    vpn: { count: LISTS.vpn.set.size },
    proxy: { count: LISTS.proxy.set.size },
    datacenter: { count: LISTS.datacenter.set.size },
    lastRefresh: lastRefresh?.toISOString() || null,
  };
}

module.exports = {
  loadThreatLists,
  startAutoRefresh,
  isTor,
  isVPN,
  isProxy,
  isDatacenter,
  getThreatFlags,
  getThreatListStats,
};
