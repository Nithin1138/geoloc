/**
 * Razorpay Webhook Handler
 *
 * POST /webhooks/razorpay — Receives payment events from Razorpay
 *
 * SETUP in Razorpay Dashboard:
 *   1. Go to Dashboard → Settings → Webhooks
 *   2. URL: https://yourdomain.com/webhooks/razorpay
 *   3. Events: payment.captured
 *   4. Secret: set the same value as RAZORPAY_WEBHOOK_SECRET in .env
 *
 * This is the PRIMARY handler for key generation (more reliable than client verify).
 */

const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const { createKey, PLANS, getKeyByPaymentId } = require("../middleware/auth");
const { sendApiKeyEmail } = require("../services/email");

// Track processed payment IDs for idempotency
const processedPayments = new Set();

/**
 * POST /webhooks/razorpay
 * Razorpay sends raw JSON body with X-Razorpay-Signature header
 */
router.post("/razorpay", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn("⚠️ RAZORPAY_WEBHOOK_SECRET not set — webhook disabled");
    return res.status(503).json({ error: "Webhook not configured" });
  }

  // Verify signature
  const signature = req.headers["x-razorpay-signature"];
  if (!signature) {
    console.warn("⚠️ Webhook request missing signature header");
    return res.status(400).json({ error: "Missing signature" });
  }

  const body = typeof req.body === "string" ? req.body : req.body.toString("utf-8");

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(body)
    .digest("hex");

  if (expectedSignature !== signature) {
    console.warn("⚠️ Webhook signature verification failed");
    return res.status(400).json({ error: "Invalid signature" });
  }

  // Parse and handle event
  let event;
  try {
    event = JSON.parse(body);
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const eventType = event.event;
  console.log(`🔔 Webhook received: ${eventType}`);

  if (eventType === "payment.captured") {
    const payment = event.payload?.payment?.entity;

    if (!payment) {
      console.warn("⚠️ Webhook: No payment entity found");
      return res.status(200).json({ status: "ok", action: "no_payment_entity" });
    }

    const paymentId = payment.id;
    const orderId = payment.order_id;
    const email = payment.email || payment.notes?.email;
    const plan = payment.notes?.plan || "starter";

    // Idempotency check
    if (processedPayments.has(paymentId)) {
      console.log(`ℹ️ Payment ${paymentId} already processed — skipping`);
      return res.status(200).json({ status: "ok", action: "already_processed" });
    }

    // Also check if key was already created via client-side verify
    const existingKey = getKeyByPaymentId(paymentId);
    if (existingKey) {
      console.log(`ℹ️ Key already exists for payment ${paymentId}`);
      processedPayments.add(paymentId);
      return res.status(200).json({ status: "ok", action: "key_exists" });
    }

    // Create API key
    try {
      const result = createKey(plan, {
        email,
        paymentId,
        orderId,
        source: "webhook",
      });

      processedPayments.add(paymentId);

      console.log(`✅ Webhook: Key created for ${email} (${plan}) — payment ${paymentId}`);

      // Send email
      if (email) {
        const limits = {
          perDay: PLANS[plan]?.requestsPerDay,
          perMonth: PLANS[plan]?.requestsPerMonth,
        };
        sendApiKeyEmail(email, result.key, plan, limits).catch(err => {
          console.error(`❌ Webhook email failed for ${email}:`, err.message);
        });
      } else {
        console.warn(`⚠️ No email for payment ${paymentId} — key created but not emailed`);
      }

      return res.status(200).json({ status: "ok", action: "key_created" });

    } catch (err) {
      console.error(`❌ Webhook: Key creation failed for ${paymentId}:`, err.message);
      return res.status(500).json({ status: "error", message: "Key creation failed" });
    }
  }

  // Other events — acknowledge but don't process
  return res.status(200).json({ status: "ok", action: "event_ignored", event: eventType });
});

module.exports = router;
