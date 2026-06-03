/**
 * mongoose.js — Database connection setup and MongoDB Schemas
 */

const mongoose = require("mongoose");

const MONGODB_URI = process.env.MONGODB_URI;

function connectDB() {
  if (!MONGODB_URI) {
    console.log("ℹ️ MONGODB_URI not configured — database actions disabled");
    return;
  }

  mongoose.connect(MONGODB_URI)
    .then(() => console.log("💾 MongoDB Connected Successfully"))
    .catch(err => console.error("❌ MongoDB connection error:", err.message));
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

const ApiKey = mongoose.model("ApiKey", apiKeySchema);

module.exports = { connectDB, ApiKey };
