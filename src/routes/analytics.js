/**
 * Analytics Routes
 *
 * GET /api/analytics — API usage analytics (Enterprise only)
 * GET /api/analytics/threat-status — Threat list status (Pro+)
 */

const express = require("express");
const router = express.Router();
const { requireApiKey, requirePlan } = require("../middleware/auth");
const { analytics } = require("../analytics");
const { getThreatListStats } = require("../threat-lists");
const { ipCache, keysCache } = require("../cache");

/**
 * GET /api/analytics
 * Full API usage analytics — Enterprise only
 */
router.get(
  "/",
  requireApiKey,
  requirePlan("enterprise"),
  (req, res) => {
    const stats = analytics.getStats();
    const threatStats = getThreatListStats();
    const cacheStats = {
      ipCache: ipCache.getStats(),
      keysCache: keysCache.getStats(),
    };

    return res.json({
      success: true,
      data: {
        ...stats,
        threatLists: threatStats,
        cache: cacheStats,
      },
      meta: {
        plan: req.plan,
        note: "Analytics are in-memory and reset on server restart.",
      },
    });
  }
);

/**
 * GET /api/analytics/threat-status
 * Threat list health check — Pro+
 */
router.get(
  "/threat-status",
  requireApiKey,
  requirePlan("pro", "enterprise"),
  (req, res) => {
    const stats = getThreatListStats();
    const totalIPs =
      stats.tor.count + stats.vpn.count + stats.proxy.count + stats.datacenter.count;

    return res.json({
      success: true,
      data: {
        status: totalIPs > 0 ? "operational" : "degraded",
        totalThreatIPs: totalIPs,
        lists: stats,
      },
    });
  }
);

module.exports = router;
