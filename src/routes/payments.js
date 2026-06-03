/**
 * Razorpay Payment Routes
 *
 * POST /payments/create-order — Create a Razorpay order for paid plans
 * POST /payments/verify       — Verify payment signature + issue API key
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { createKey, PLANS } = require("../middleware/auth");
const { sendApiKeyEmail } = require("../services/email");

// Lazy-init Razorpay (only when keys are configured)
let razorpayInstance = null;

function getRazorpay() {
  if (razorpayInstance) return razorpayInstance;

  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return null;
  }

  const Razorpay = require("razorpay");
  razorpayInstance = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpayInstance;
}

/**
 * POST /payments/create-order
 * Body: { plan: "starter"|"pro"|"enterprise", email: "user@example.com" }
 */
router.post("/create-order", async (req, res) => {
  const rzp = getRazorpay();
  if (!rzp) {
    return res.status(503).json({
      success: false,
      error: "Payment system not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env",
    });
  }

  const { plan, email } = req.body;

  if (!plan || !email) {
    return res.status(400).json({
      success: false,
      error: "Both 'plan' and 'email' are required",
    });
  }

  if (!email.includes("@")) {
    return res.status(400).json({
      success: false,
      error: "Invalid email address",
    });
  }

  const planConfig = PLANS[plan];
  if (!planConfig) {
    return res.status(400).json({
      success: false,
      error: `Unknown plan: "${plan}"`,
      validPlans: Object.keys(PLANS).filter(p => p !== "free"),
    });
  }

  if (plan === "free") {
    return res.status(400).json({
      success: false,
      error: "Free plan doesn't require payment. Use POST /keys/new?plan=free instead.",
    });
  }

  try {
    const order = await rzp.orders.create({
      amount: planConfig.priceINR * 100, // Razorpay uses paise
      currency: "INR",
      receipt: `geoip_${plan}_${Date.now()}`,
      notes: {
        plan,
        email,
        product: "geoip-api",
      },
    });

    return res.json({
      success: true,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("❌ Razorpay order creation failed:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to create payment order. Please try again.",
    });
  }
});

/**
 * POST /payments/verify
 * Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, email }
 *
 * Verifies the Razorpay signature and creates an API key.
 * This is a client-side verification fallback; the webhook is the primary handler.
 */
router.post("/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, email } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({
      success: false,
      error: "Missing payment verification fields",
    });
  }

  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return res.status(503).json({
      success: false,
      error: "Payment verification not configured",
    });
  }

  // Verify HMAC signature
  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    console.warn("⚠️ Invalid payment signature from", email);
    return res.status(400).json({
      success: false,
      error: "Payment verification failed — invalid signature",
    });
  }

  // Signature valid — create API key
  try {
    const result = createKey(plan || "starter", {
      email,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
    });

    console.log(`✅ Payment verified — key created for ${email} (${plan})`);

    // Send email (async, don't block response)
    const limits = {
      perDay: PLANS[plan]?.requestsPerDay,
      perMonth: PLANS[plan]?.requestsPerMonth,
    };
    sendApiKeyEmail(email, result.key, plan, limits).catch(err => {
      console.error("❌ Failed to send email:", err.message);
    });

    return res.json({
      success: true,
      apiKey: result.key,
      plan: result.plan,
      message: "Payment verified! Your API key has been created and emailed.",
    });
  } catch (err) {
    console.error("❌ Key creation failed:", err.message);
    return res.status(500).json({
      success: false,
      error: "Payment verified but key creation failed. Contact support.",
    });
  }
});

module.exports = router;
