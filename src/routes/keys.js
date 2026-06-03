/**
 * Key Management Routes
 *
 * POST /keys/new?plan=free      — generate a new key (gate with payment in production)
 * GET  /keys/stats              — view usage stats for your key
 * GET  /keys/plans              — list all available plans
 */

const express = require("express");
const router = express.Router();
const { createKey, getKeyStats, PLANS, requireApiKey } = require("../middleware/auth");

/**
 * POST /keys/new?plan=free
 * Create a new API key
 *
 * PRODUCTION: Before calling createKey(), verify payment:
 *   - Free: allow immediately
 *   - Paid: verify Razorpay/Stripe payment_id first
 *     e.g. await razorpay.payments.fetch(payment_id)
 */
router.post("/new", express.json(), express.urlencoded({ extended: true }), (req, res) => {
  const plan = (req.query.plan || "free").toLowerCase();
  const email = (req.body?.email || req.query?.email || req.body?.emailFree || req.query?.emailFree || "").trim().toLowerCase();

  if (!PLANS[plan]) {
    return res.status(400).json({
      success: false,
      error: `Unknown plan: "${plan}"`,
      validPlans: Object.keys(PLANS),
    });
  }

  // Gate paid plans behind payment verification
  if (plan !== "free") {
    return res.status(400).json({
      success: false,
      error: "Paid plans must be purchased via the payments interface.",
    });
  }

  if (!email || !email.includes("@")) {
    return res.status(400).json({
      success: false,
      error: "A valid email is required to obtain a free API key.",
    });
  }

  // Check if a free key already exists for this email
  const { getKeyByEmail } = require("../middleware/auth");
  const existingKeyRecord = getKeyByEmail(email, "free");
  if (existingKeyRecord) {
    return res.status(200).json({
      success: true,
      message: "Here is your existing free API key:",
      apiKey: existingKeyRecord.key,
      plan: existingKeyRecord.plan,
      limits: {
        requestsPerDay: PLANS[plan].requestsPerDay,
        requestsPerMonth: PLANS[plan].requestsPerMonth,
      },
      features: PLANS[plan].features,
      usage: {
        header: `X-Api-Key: ${existingKeyRecord.key}`,
        query: `?api_key=${existingKeyRecord.key}`,
        example: `curl -H "X-Api-Key: ${existingKeyRecord.key}" https://yourdomain.com/api/ip/8.8.8.8`,
      },
    });
  }

  try {
    const result = createKey(plan, { email });
    return res.status(201).json({
      success: true,
      message: "🎉 API key created! Save this — it won't be shown again.",
      apiKey: result.key,
      plan: result.plan,
      limits: {
        requestsPerDay: PLANS[plan].requestsPerDay,
        requestsPerMonth: PLANS[plan].requestsPerMonth,
      },
      features: PLANS[plan].features,
      usage: {
        header: `X-Api-Key: ${result.key}`,
        query: `?api_key=${result.key}`,
        example: `curl -H "X-Api-Key: ${result.key}" https://yourdomain.com/api/ip/8.8.8.8`,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /keys/stats
 * View usage stats for the authenticated key
 */
router.get("/stats", requireApiKey, (req, res) => {
  const stats = getKeyStats(req.apiKey.key);
  return res.json({ success: true, data: stats });
});

/**
 * GET /keys/plans
 * List all available plans with pricing
 */
router.get("/plans", (req, res) => {
  const plans = Object.entries(PLANS).map(([id, plan]) => ({
    id,
    name: plan.name,
    price: {
      INR: plan.priceINR === 0 ? "Free" : `₹${plan.priceINR}/month`,
      USD: plan.priceUSD === 0 ? "Free" : `$${plan.priceUSD}/month`,
    },
    limits: {
      requestsPerDay: plan.requestsPerDay.toLocaleString(),
      requestsPerMonth: plan.requestsPerMonth.toLocaleString(),
    },
    features: plan.features,
    getKey: `POST /keys/new?plan=${id}`,
  }));

  return res.json({ success: true, data: plans });
});

module.exports = router;
