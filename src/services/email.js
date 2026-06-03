/**
 * Email Service — Sends API keys to customers after payment
 *
 * Uses Nodemailer with configurable SMTP.
 * Falls back to console logging if SMTP isn't configured (dev mode).
 */

const nodemailer = require("nodemailer");

let transporter = null;

/**
 * Initialize the email transporter
 */
function initTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log("📧 SMTP not configured — emails will be logged to console (dev mode)");
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(port, 10) || 587,
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
  });

  console.log(`📧 Email transporter ready → ${host}`);
  return transporter;
}

/**
 * Send API key email to customer
 */
async function sendApiKeyEmail(email, apiKey, plan, limits) {
  const appName = process.env.APP_NAME || "GeoIP API";
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const planName = plan.charAt(0).toUpperCase() + plan.slice(1);

  const subject = `🌍 Your ${appName} Key — ${planName} Plan`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background:#050a18; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width:560px; margin:0 auto; padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center; margin-bottom:32px;">
      <div style="display:inline-block; background:linear-gradient(135deg,#3b82f6,#06b6d4); border-radius:12px; padding:12px 16px; font-size:24px;">🌍</div>
      <h1 style="color:#f1f5f9; font-size:24px; margin:16px 0 4px;">${appName}</h1>
      <p style="color:#64748b; font-size:14px; margin:0;">Your API key is ready</p>
    </div>

    <!-- Main Card -->
    <div style="background:#0f1734; border:1px solid rgba(255,255,255,0.06); border-radius:16px; padding:32px; margin-bottom:24px;">
      <p style="color:#94a3b8; font-size:15px; margin:0 0 8px;">Welcome to your <strong style="color:#60a5fa;">${planName}</strong> plan!</p>
      <p style="color:#94a3b8; font-size:14px; margin:0 0 24px;">Here's your API key. Keep it safe — treat it like a password.</p>

      <!-- API Key -->
      <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(59,130,246,0.3); border-radius:12px; padding:16px; text-align:center; margin-bottom:24px;">
        <p style="color:#64748b; font-size:11px; text-transform:uppercase; letter-spacing:0.1em; margin:0 0 8px;">Your API Key</p>
        <code style="color:#34d399; font-size:15px; font-family:'JetBrains Mono',monospace; word-break:break-all;">${apiKey}</code>
      </div>

      <!-- Quick Start -->
      <p style="color:#94a3b8; font-size:13px; margin:0 0 12px; font-weight:600;">Quick Start:</p>
      <div style="background:rgba(0,0,0,0.3); border-radius:8px; padding:12px 16px; margin-bottom:24px;">
        <code style="color:#94a3b8; font-size:12px; font-family:'JetBrains Mono',monospace; white-space:pre-wrap;">curl -H "X-Api-Key: ${apiKey}" \\
  ${appUrl}/api/ip/8.8.8.8</code>
      </div>

      <!-- Plan Details -->
      <div style="border-top:1px solid rgba(255,255,255,0.06); padding-top:16px;">
        <table style="width:100%; font-size:13px;">
          <tr>
            <td style="color:#64748b; padding:4px 0;">Plan</td>
            <td style="color:#f1f5f9; text-align:right; padding:4px 0; font-weight:600;">${planName}</td>
          </tr>
          <tr>
            <td style="color:#64748b; padding:4px 0;">Daily Requests</td>
            <td style="color:#f1f5f9; text-align:right; padding:4px 0;">${limits?.perDay?.toLocaleString() || "—"}</td>
          </tr>
          <tr>
            <td style="color:#64748b; padding:4px 0;">Monthly Requests</td>
            <td style="color:#f1f5f9; text-align:right; padding:4px 0;">${limits?.perMonth?.toLocaleString() || "—"}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- CTA Button -->
    <div style="text-align:center; margin-bottom:32px;">
      <a href="${appUrl}/dashboard.html" style="display:inline-block; background:linear-gradient(135deg,#3b82f6,#06b6d4); color:#fff; text-decoration:none; padding:14px 32px; border-radius:12px; font-weight:600; font-size:15px;">
        Open Dashboard →
      </a>
    </div>

    <!-- Footer -->
    <div style="text-align:center; color:#475569; font-size:12px;">
      <p style="margin:0;">Need help? Reply to this email.</p>
      <p style="margin:8px 0 0;">
        <a href="${appUrl}" style="color:#60a5fa; text-decoration:none;">${appName}</a>
      </p>
    </div>

  </div>
</body>
</html>`;

  const text = `
${appName} — Your API Key

Plan: ${planName}
API Key: ${apiKey}

Quick Start:
curl -H "X-Api-Key: ${apiKey}" ${appUrl}/api/ip/8.8.8.8

Dashboard: ${appUrl}/dashboard.html

Daily Limit: ${limits?.perDay?.toLocaleString() || "—"} requests
Monthly Limit: ${limits?.perMonth?.toLocaleString() || "—"} requests
`;

  // If SMTP not configured, log to console
  if (!transporter) {
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║  📧 EMAIL (dev mode — SMTP not configured)       ║");
    console.log("╠══════════════════════════════════════════════════╣");
    console.log(`║  To: ${email}`);
    console.log(`║  Subject: ${subject}`);
    console.log(`║  API Key: ${apiKey}`);
    console.log(`║  Plan: ${planName}`);
    console.log("╚══════════════════════════════════════════════════╝\n");
    return { messageId: "dev-mode-" + Date.now(), devMode: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${appName}" <${process.env.SMTP_USER}>`,
      to: email,
      subject,
      text,
      html,
    });

    console.log(`📧 Email sent to ${email} — ${info.messageId}`);
    return info;
  } catch (err) {
    console.error(`❌ Email failed for ${email}:`, err.message);
    throw err;
  }
}

module.exports = { initTransporter, sendApiKeyEmail };
