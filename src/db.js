/**
 * mongoose.js — Database connection setup and MongoDB Schemas
 */

const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");

const MONGODB_URI = process.env.MONGODB_URI;
let useMongo = false;

// We'll define a file-based fallback
const KEYS_FILE = path.join(__dirname, "..", "data", "keys.json");
const keyStore = new Map();

function saveKeysLocal() {
  try {
    const data = JSON.stringify(Array.from(keyStore.entries()), null, 2);
    const dir = path.dirname(KEYS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(KEYS_FILE, data, "utf8");
  } catch (err) {
    console.error("❌ Failed to save keys locally:", err.message);
  }
}

function loadKeysLocal() {
  try {
    if (fs.existsSync(KEYS_FILE)) {
      const data = fs.readFileSync(KEYS_FILE, "utf8");
      const entries = JSON.parse(data);
      keyStore.clear();
      for (const [key, record] of entries) {
        keyStore.set(key, record);
      }
    } else {
      seedDefaultKeysLocal();
      saveKeysLocal();
    }
  } catch (err) {
    console.error("❌ Failed to load keys locally:", err.message);
    seedDefaultKeysLocal();
  }
}

function seedDefaultKeysLocal() {
  keyStore.clear();
  [
    { key: "test_free_geo123",    plan: "free"       },
    { key: "test_starter_geo456", plan: "starter"    },
    { key: "test_pro_geo789",     plan: "pro"        },
  ].forEach(({ key, plan }) => {
    keyStore.set(key, {
      key,
      plan,
      active: true,
      created: new Date(),
      todayCount: 0,
      monthCount: 0,
      totalCount: 0,
      lastReset: new Date().toDateString(),
      lastUsed: null,
    });
  });
}

// Local mock model class
class LocalApiKeyDoc {
  constructor(data) {
    Object.assign(this, data);
  }
  async save() {
    keyStore.set(this.key, { ...this });
    saveKeysLocal();
    return this;
  }
}

function matchQuery(record, query) {
  for (const [k, v] of Object.entries(query)) {
    if (k === "email" && record.email && typeof v === "string") {
      if (record.email.trim().toLowerCase() !== v.trim().toLowerCase()) {
        return false;
      }
    } else if (record[k] !== v) {
      return false;
    }
  }
  return true;
}

const LocalApiKeyModel = {
  async findOne(query) {
    loadKeysLocal();
    for (const [, record] of keyStore) {
      if (matchQuery(record, query)) {
        return new LocalApiKeyDoc(record);
      }
    }
    return null;
  },
  async find(query) {
    loadKeysLocal();
    const results = [];
    for (const [, record] of keyStore) {
      if (matchQuery(record, query)) {
        results.push(new LocalApiKeyDoc(record));
      }
    }
    return results;
  },
  async create(data) {
    loadKeysLocal();
    const doc = new LocalApiKeyDoc({
      active: true,
      created: new Date(),
      todayCount: 0,
      monthCount: 0,
      totalCount: 0,
      lastReset: new Date().toDateString(),
      lastUsed: null,
      ...data
    });
    await doc.save();
    return doc;
  }
};

function connectDB() {
  if (!MONGODB_URI) {
    console.log("ℹ️ MONGODB_URI not configured — database actions disabled (using local JSON keys store)");
    useMongo = false;
    loadKeysLocal();
    return;
  }

  console.log("💾 Connecting to MongoDB...");
  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 2000 })
    .then(() => {
      console.log("💾 MongoDB Connected Successfully");
      useMongo = true;
    })
    .catch(err => {
      console.warn("⚠️ MongoDB connection failed. Falling back to local JSON keys store. Error:", err.message);
      useMongo = false;
      loadKeysLocal();
    });
}

// ─── API Key Schema ───────────────────────────────────────────
const apiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  plan: { type: String, required: true, default: "free" },
  email: { type: String, index: true, lowercase: true, trim: true },
  active: { type: Boolean, default: true },
  created: { type: Date, default: Date.now },
  todayCount: { type: Number, default: 0 },
  monthCount: { type: Number, default: 0 },
  totalCount: { type: Number, default: 0 },
  lastReset: { type: String, default: () => new Date().toDateString() },
  lastUsed: { type: Date, default: null },
  paymentId: { type: String, index: true },
  orderId: { type: String },
  source: { type: String }
});

const ApiKeyMongoose = mongoose.model("ApiKey", apiKeySchema);

const ApiKey = {
  find(query) {
    if (useMongo) return ApiKeyMongoose.find(query);
    return LocalApiKeyModel.find(query);
  },
  findOne(query) {
    if (useMongo) return ApiKeyMongoose.findOne(query);
    return LocalApiKeyModel.findOne(query);
  },
  create(data) {
    if (useMongo) return ApiKeyMongoose.create(data);
    return LocalApiKeyModel.create(data);
  }
};

module.exports = { connectDB, ApiKey };
