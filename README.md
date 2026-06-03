# IP Geolocation API (Lite)
**Self-hosted · Zero per-request cost · MaxMind GeoLite2 · Sell on Zyla / ApyHub**

Returns country, city, region, lat/lng, timezone, currency, ISP/ASN for any IP.

---

## 📦 Quick Start

```bash
npm install
npm start
# → http://localhost:3000
```

Test immediately with built-in test keys:

```bash
# Basic lookup
curl -H "X-Api-Key: test_free_geo123" http://localhost:3000/api/ip/81.2.69.142

# Self-lookup (your own IP)
curl -H "X-Api-Key: test_free_geo123" http://localhost:3000/api/ip/me

# Country only (fast, lightweight)
curl -H "X-Api-Key: test_free_geo123" http://localhost:3000/api/ip/2.125.160.216/country

# Bulk lookup (Pro key required)
curl -X POST http://localhost:3000/api/ip/bulk \
  -H "X-Api-Key: test_pro_geo789" \
  -H "Content-Type: application/json" \
  -d '{"ips": ["8.8.8.8", "1.1.1.1", "81.2.69.142"]}'

# See all plans
curl http://localhost:3000/keys/plans

# Generate a new key
curl -X POST "http://localhost:3000/keys/new?plan=free"
```

---

## 🗄️ Get the FULL Database (Production)

The built-in test DB covers a small subset of IPs. For production (all IPs globally):

### Step 1 — Sign up FREE at MaxMind
→ https://www.maxmind.com/en/geolite2/signup

Takes 2 minutes. No credit card. You'll get a **license key**.

### Step 2 — Download databases
```bash
export MAXMIND_LICENSE_KEY=your_license_key_here
node scripts/download-db.js
```

This downloads:
- `GeoLite2-City.mmdb` — ~70 MB — city, region, lat/lng, timezone
- `GeoLite2-ASN.mmdb`  — ~9 MB  — ISP / ASN data
- `GeoLite2-Country.mmdb` — ~6 MB — country only (fastest lookups)

### Step 3 — Auto-update (MaxMind updates every 2 weeks)
Add to crontab:
```
0 3 1,15 * * cd /your/app && MAXMIND_LICENSE_KEY=xxx node scripts/download-db.js
```

---

## 🌐 Endpoints

### Authentication
Pass key via header or query param:
```
X-Api-Key: your_key
Authorization: Bearer your_key
?api_key=your_key
```

### Endpoints

| Method | Path | Plan | Description |
|--------|------|------|-------------|
| GET | `/api/ip/:ip` | Free+ | Full geolocation lookup |
| GET | `/api/ip/me` | Free+ | Caller's own IP lookup |
| GET | `/api/ip/:ip/country` | Free+ | Country code only (fast) |
| POST | `/api/ip/bulk` | Pro+ | Up to 100 IPs at once |
| POST | `/keys/new?plan=free` | — | Generate API key |
| GET | `/keys/stats` | Any | Your usage stats |
| GET | `/keys/plans` | — | All plans & pricing |
| GET | `/health` | — | Server health |
| GET | `/status` | — | DB status |

### Example Response

```json
{
  "success": true,
  "data": {
    "ip": "81.2.69.142",
    "version": "IPv4",
    "type": "Public",
    "isPublic": true,
    "geo": {
      "country": "United Kingdom",
      "countryCode": "GB",
      "continent": "Europe",
      "continentCode": "EU",
      "city": "London",
      "region": "England",
      "regionCode": "ENG",
      "postal": "EC2V",
      "latitude": 51.5142,
      "longitude": -0.0931,
      "accuracyRadiusKm": 10,
      "timezone": "Europe/London",
      "utcOffset": "UTC+1",
      "currency": "GBP",
      "callingCode": "+44"
    },
    "network": {
      "asn": "AS2856",
      "organization": "British Telecommunications PLC"
    }
  },
  "meta": {
    "source": "MaxMind GeoLite2",
    "plan": "starter",
    "remaining": { "today": 9987, "month": 99987 }
  }
}
```

---

## 💰 Pricing Tiers

| Plan | Price | Req/day | Features |
|------|-------|---------|---------|
| Free | ₹0 | 1,000 | country, city, timezone |
| Starter | ₹499/mo | 10,000 | + ASN/ISP, currency, calling code |
| Pro | ₹1,999/mo | 100,000 | + bulk lookup (100 IPs/call) |
| Enterprise | ₹9,999/mo | 1,000,000 | + SLA, dedicated support |

---

## 🚀 Deploy (₹0 / month options)

### Railway (Recommended)
```bash
npm install -g @railway/cli
railway login && railway init && railway up
```

### Render
1. Push to GitHub
2. New Web Service on render.com
3. Build: `npm install` | Start: `npm start`

### Cloudflare Workers (100K req/day free)
- Adapt to Workers format (fetch handler, KV for keys)
- Workers run at edge globally — sub-10ms response

---

## 🏪 Where to Sell

1. **Zyla API Hub** (zylalabs.com) — direct RapidAPI replacement, active 2026
2. **ApyHub** (apyhub.com) — curated API marketplace
3. **Your own landing page** — Razorpay + simple site
4. **Direct outreach** — email SaaS companies needing geolocation

---

## 🔧 Production Checklist

- [ ] Download full MaxMind databases (`node scripts/download-db.js`)
- [ ] Replace in-memory key store with PostgreSQL
- [ ] Add Redis for rate limiting (scales across instances)
- [ ] Hook up Razorpay / Stripe webhook to `createKey(plan)`
- [ ] Set up cron to refresh DBs every 2 weeks
- [ ] Add uptime monitoring (UptimeRobot free tier)
- [ ] Add request logging (Winston / Pino)
- [ ] Set `NODE_ENV=production`

---

## 📋 Attribution (Required by MaxMind)

When using GeoLite2, you must display:

> "This product includes GeoLite2 data created by MaxMind, available from https://www.maxmind.com"

Include this in your API docs / footer.

---

## 🆚 vs Competitors

| | You | ipapi.co | ipinfo.io | ipgeolocation.io |
|--|-----|----------|-----------|-----------------|
| Free tier | 1,000/day | 30K/month | 50K/month | 30K/month |
| Starter | ₹499/mo | ~₹2,100/mo | ~₹2,500/mo | ~₹1,700/mo |
| Self-hosted? | ✅ Yes | ❌ No | ❌ No | ❌ No |
| Per-call API cost | ₹0 | Per-call | Per-call | Per-call |
| Data source | MaxMind | MaxMind | Proprietary | MaxMind |

**Your moat**: cheapest price because your cost = ₹0 per call.
# geoloc
