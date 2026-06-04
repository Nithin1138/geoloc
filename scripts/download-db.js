#!/usr/bin/env node
/**
 * Download MaxMind GeoLite2 Databases
 *
 * Run once to get the databases. Re-run every 2 weeks (MaxMind updates them).
 *
 * SETUP:
 * 1. Sign up FREE at: https://www.maxmind.com/en/geolite2/signup
 * 2. Go to Account → Manage License Keys → Generate new key
 * 3. Set environment variable:
 *      export MAXMIND_LICENSE_KEY=your_license_key_here
 * 4. Run:
 *      node scripts/download-db.js
 *
 * Or pass key directly:
 *      MAXMIND_LICENSE_KEY=xxxxx node scripts/download-db.js
 *
 * CRON JOB (update every 2 weeks):
 *   0 3 1,15 * * cd /your/app && node scripts/download-db.js >> /var/log/geodb-update.log 2>&1
 */

const https = require("https");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// Attempt to load .env file natively (Node 20.12+)
try {
  process.loadEnvFile(path.resolve(__dirname, "..", ".env"));
} catch (e) { }

const LICENSE_KEY = process.env.MAXMIND_LICENSE_KEY;
const DATA_DIR = path.join(__dirname, "..", "data");

const DATABASES = [
  { edition: "GeoLite2-City", filename: "GeoLite2-City.mmdb" },
  { edition: "GeoLite2-ASN", filename: "GeoLite2-ASN.mmdb" },
  { edition: "GeoLite2-Country", filename: "GeoLite2-Country.mmdb" },
];

if (!LICENSE_KEY) {
  console.warn(`
⚠️  MAXMIND_LICENSE_KEY is not set.
Official MaxMind downloads require a free account and license key.
We will fall back to downloading from the GitHub mirror.
`);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

async function downloadFromMaxMind({ edition, filename }) {
  if (!LICENSE_KEY) {
    throw new Error("MAXMIND_LICENSE_KEY is not set");
  }

  const url = `https://download.maxmind.com/app/geoip_download?edition_id=${edition}&license_key=${LICENSE_KEY}&suffix=tar.gz`;
  const dest = path.join(DATA_DIR, filename);
  const tmpTar = path.join(DATA_DIR, `${edition}.tar.gz`);

  console.log(`\n⬇️  Downloading ${edition} from MaxMind...`);

  return new Promise((resolve, reject) => {
    function makeRequest(reqUrl) {
      https.get(reqUrl, (res) => {
        if (res.statusCode === 401) {
          reject(new Error("Invalid license key. Check MAXMIND_LICENSE_KEY."));
          return;
        }
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${edition}`));
          return;
        }

        const file = fs.createWriteStream(tmpTar);
        res.pipe(file);
        file.on("finish", async () => {
          file.close();
          console.log(`   ✅ Downloaded. Extracting...`);

          // Extract .mmdb from the tarball
          try {
            let extracted = false;
            const tar = require("tar");
            await tar.x({
              file: tmpTar,
              cwd: DATA_DIR,
              filter: (entryPath) => entryPath.endsWith(".mmdb"),
              onentry: (entry) => {
                const outPath = path.join(DATA_DIR, filename);
                entry.pipe(fs.createWriteStream(outPath));
                extracted = true;
              },
            });

            fs.unlinkSync(tmpTar); // clean up tar

            const stats = fs.statSync(dest);
            console.log(`   ✅ ${filename} saved (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
            resolve();
          } catch (err) {
            reject(new Error(`Extraction failed: ${err.message}`));
          }
        });
      }).on("error", reject);
    }
    makeRequest(url);
  });
}

async function downloadFromMirror({ edition, filename }) {
  const url = `https://raw.githubusercontent.com/P3TERX/GeoLite.mmdb/download/${filename}`;
  const dest = path.join(DATA_DIR, filename);

  console.log(`\n⬇️  Downloading ${edition} from GitHub mirror...`);

  return new Promise((resolve, reject) => {
    function makeRequest(reqUrl) {
      https.get(reqUrl, (res) => {
        // Follow redirects
        if (res.statusCode === 301 || res.statusCode === 302) {
          return makeRequest(res.headers.location);
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from mirror`));
          return;
        }

        const file = fs.createWriteStream(dest);
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          const stats = fs.statSync(dest);
          console.log(`   ✅ ${filename} saved from mirror (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
          resolve();
        });
      }).on("error", reject);
    }
    makeRequest(url);
  });
}

async function downloadDB({ edition, filename }) {
  const dest = path.join(DATA_DIR, filename);
  if (fs.existsSync(dest)) {
    console.log(`   ✅ ${filename} already exists (skipping download)`);
    return;
  }

  try {
    await downloadFromMaxMind({ edition, filename });
  } catch (err) {
    console.warn(`   ⚠️  MaxMind download failed: ${err.message}`);
    console.log(`   🔄 Falling back to GitHub mirror (P3TERX/GeoLite.mmdb)...`);
    try {
      await downloadFromMirror({ edition, filename });
    } catch (mirrorErr) {
      throw new Error(`Both MaxMind and mirror download failed. Mirror error: ${mirrorErr.message}`);
    }
  }
}

async function main() {
  console.log("🌍 MaxMind GeoLite2 Database Downloader");
  console.log(`📁 Saving to: ${DATA_DIR}\n`);

  // Check if tar module is available
  try {
    require("tar");
  } catch {
    console.log("Installing 'tar' package...");
    require("child_process").execSync("npm install tar", { stdio: "inherit" });
  }

  for (const db of DATABASES) {
    try {
      await downloadDB(db);
    } catch (err) {
      console.error(`❌ Failed to download ${db.edition}:`, err.message);
    }
  }

  console.log("\n🎉 All databases downloaded!");
  console.log("📅 Remember: MaxMind updates GeoLite2 every 2 weeks.");
  console.log("   Schedule this script as a cron job to stay accurate.\n");
  console.log("   Cron example (1st and 15th of each month at 3am):");
  console.log("   0 3 1,15 * * cd /your/app && MAXMIND_LICENSE_KEY=xxx node scripts/download-db.js\n");
  process.exit(0);
}

main();
