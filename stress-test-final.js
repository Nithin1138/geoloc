#!/usr/bin/env node
/**
 * Enhanced Stress Test: Local vs Production Clustering
 * Compares single-process mock vs multi-core clustered mock with same codebase
 */

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");

const TEST_IP = "8.8.8.8";
const API_KEY = "test_free_geo123";
const PORT = 3000;

// Extended scenarios testing up to upper limits
const scenarios = [
  { name: "Light Load", duration: 10, concurrency: 5 },
  { name: "Medium Load", duration: 10, concurrency: 25 },
  { name: "Heavy Load", duration: 10, concurrency: 50 },
  { name: "Extreme Load", duration: 10, concurrency: 100 },
  { name: "Ultra Extreme", duration: 10, concurrency: 200 },
  { name: "Max Burst", duration: 5, concurrency: 500 },
];

class StressTest {
  constructor(baseUrl, apiKey, testName) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.testName = testName;
    this.stats = [];
  }

  async makeRequest() {
    return new Promise((resolve) => {
      const url = new URL(`${this.baseUrl}/api/ip/${TEST_IP}`);
      const startTime = Date.now();

      const options = {
        method: "GET",
        headers: {
          "X-Api-Key": this.apiKey,
          "User-Agent": "StressTest/1.0",
        },
      };

      const req = http.request(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          const latency = Date.now() - startTime;
          resolve({
            success: res.statusCode === 200,
            status: res.statusCode,
            latency,
            timestamp: startTime,
          });
        });
      });

      req.on("error", () => {
        resolve({
          success: false,
          status: 0,
          latency: Date.now() - startTime,
          timestamp: startTime,
        });
      });

      req.setTimeout(5000, () => {
        req.destroy();
        resolve({
          success: false,
          status: 0,
          latency: Date.now() - startTime,
          timestamp: startTime,
        });
      });

      req.end();
    });
  }

  async runScenario(scenario) {
    console.log(
      `  🧪 ${scenario.name}: ${scenario.concurrency} concurrent users, ${scenario.duration}s`
    );

    const results = [];
    const startTime = Date.now();
    let completed = 0;
    let failed = 0;

    // Launch concurrent requests
    const makeRequests = async () => {
      while (Date.now() - startTime < scenario.duration * 1000) {
        const promises = [];
        for (let i = 0; i < scenario.concurrency; i++) {
          promises.push(this.makeRequest());
        }
        const responses = await Promise.all(promises);
        responses.forEach((r) => {
          results.push(r);
          if (r.success) completed++;
          else failed++;
        });
      }
    };

    await makeRequests();

    // Calculate stats
    const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
    const successRate = ((completed / results.length) * 100).toFixed(2);
    const rps = (completed / (scenario.duration)).toFixed(2);
    const rpm = (rps * 60).toFixed(0);
    const rph = (rpm * 60).toFixed(0);

    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];
    const avg = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(2);
    const max = latencies[latencies.length - 1];

    const stats = {
      scenario: scenario.name,
      requests: results.length,
      success: completed,
      failed,
      successRate: parseFloat(successRate),
      rps: parseFloat(rps),
      rpm: parseInt(rpm),
      rph: parseInt(rph),
      latency: {
        avg: parseFloat(avg),
        p50,
        p95,
        p99,
        max,
      },
    };

    this.stats.push(stats);

    console.log(`    ✅ Requests: ${completed} success, ${failed} failed (${successRate}%)`);
    console.log(`    📊 Throughput: ${rps} RPS | ${rpm} RPM | ${rph} RPH`);
    console.log(`    ⏱️  Latency: Avg ${avg}ms | P95 ${p95}ms | P99 ${p99}ms | Max ${max}ms`);

    return stats;
  }

  async runAllScenarios() {
    console.log("\n" + "=".repeat(70));
    for (const scenario of scenarios) {
      await this.runScenario(scenario);
    }
    console.log("\n" + "=".repeat(70));
  }

  getStats() {
    return this.stats;
  }
}

// Helper to start server
function startServer(script, testName) {
  return new Promise((resolve) => {
    const env = { ...process.env, PORT, VERBOSE: false };

    if (testName.includes("Single")) {
      console.log(`\n🚀 Starting ${testName}...`);
    } else {
      console.log(`\n🚀 Starting ${testName} (${os.cpus().length} workers)...`);
      env.WORKERS = os.cpus().length;
    }

    const proc = spawn("node", [script], { env, stdio: "pipe" });
    setTimeout(() => resolve(proc), 2000);
  });
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║    IP Geolocation API - Enhanced Stress Test (Up to Upper Limits)    ║");
  console.log("║               Single Process vs Multi-Core Clustering                 ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");
  console.log(`\n📊 System: ${os.cpus().length}-core CPU, Node.js v${process.version}`);

  const results = {};

  // Test 1: Single Process (Local Development)
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 1: SINGLE PROCESS (No Clustering, Baseline Performance)        │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const localServer = await startServer("mock-server.js", "Single Process Mock Server");
  const localTest = new StressTest(`http://localhost:${PORT}`, API_KEY, "Local");
  await localTest.runAllScenarios();
  results.local = localTest.getStats();

  localServer.kill();
  await new Promise((r) => setTimeout(r, 2000));

  // Test 2: Multi-Core Clustering (Production)
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log(`│ TEST 2: MULTI-CORE CLUSTERING (${os.cpus().length} Workers, Production)     │`);
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const prodServer = await startServer("mock-server-clustered.js", "Multi-Core Clustered");
  const prodTest = new StressTest(`http://localhost:${PORT}`, API_KEY, "Production");
  await prodTest.runAllScenarios();
  results.production = prodTest.getStats();

  prodServer.kill();

  // Generate comparison report
  generateComparisonReport(results);
}

function generateComparisonReport(results) {
  console.log("\n╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║                      PERFORMANCE COMPARISON REPORT                    ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝\n");

  const localStats = results.local;
  const prodStats = results.production;

  console.log("📊 DETAILED COMPARISON BY LOAD SCENARIO\n");

  for (let i = 0; i < localStats.length; i++) {
    const local = localStats[i];
    const prod = prodStats[i];

    const rpsGain = (((prod.rps - local.rps) / local.rps) * 100).toFixed(1);
    const latencyGain = (((local.latency.avg - prod.latency.avg) / local.latency.avg) * 100).toFixed(1);
    const throughputGain = (((prod.rph - local.rph) / local.rph) * 100).toFixed(1);

    console.log(`\n🔹 ${local.scenario.padEnd(20)} (${local.success + local.failed} requests)`);
    console.log("─".repeat(70));

    // RPS Comparison
    const rpsEmoji = rpsGain > 0 ? "🚀" : "📉";
    console.log(
      `  RPS:        Single: ${local.rps.toFixed(0).padStart(7)} | Clustered: ${prod.rps.toFixed(0).padStart(7)} | ${rpsGain.padStart(6)}% ${rpsEmoji}`
    );

    // Throughput (RPM/RPH)
    const rphEmoji = throughputGain > 0 ? "🚀" : "📉";
    console.log(
      `  Throughput: Single: ${local.rph.toLocaleString().padStart(12)} RPH | Clustered: ${prod.rph.toLocaleString().padStart(12)} RPH | ${throughputGain.padStart(6)}% ${rphEmoji}`
    );

    // Latency
    const latencyEmoji = latencyGain > 0 ? "⚡" : "🐢";
    console.log(
      `  Latency:    Single: ${local.latency.avg.toFixed(1).padStart(6)}ms | Clustered: ${prod.latency.avg.toFixed(1).padStart(6)}ms | ${latencyGain.padStart(6)}% ${latencyEmoji}`
    );

    // P99
    const p99Gain = (((local.latency.p99 - prod.latency.p99) / local.latency.p99) * 100).toFixed(1);
    console.log(
      `  P99:        Single: ${local.latency.p99.toString().padStart(6)}ms | Clustered: ${prod.latency.p99.toString().padStart(6)}ms | ${p99Gain.padStart(6)}%`
    );

    // Success Rate
    const localSuccess = local.successRate.toFixed(2);
    const prodSuccess = prod.successRate.toFixed(2);
    console.log(
      `  Success:    Single: ${localSuccess.padStart(6)}% | Clustered: ${prodSuccess.padStart(6)}%`
    );
  }

  // Overall summary
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                         OVERALL SUMMARY                                ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  const localMaxRps = Math.max(...localStats.map((s) => s.rps));
  const prodMaxRps = Math.max(...prodStats.map((s) => s.rps));
  const localAvgLatency = (localStats.reduce((a, s) => a + s.latency.avg, 0) / localStats.length).toFixed(2);
  const prodAvgLatency = (prodStats.reduce((a, s) => a + s.latency.avg, 0) / prodStats.length).toFixed(2);
  const localMaxThroughput = Math.max(...localStats.map((s) => s.rph));
  const prodMaxThroughput = Math.max(...prodStats.map((s) => s.rph));

  const rpsGain = ((prodMaxRps - localMaxRps) / localMaxRps * 100).toFixed(1);
  const latencyGain = ((localAvgLatency - prodAvgLatency) / localAvgLatency * 100).toFixed(1);
  const throughputGain = ((prodMaxThroughput - localMaxThroughput) / localMaxThroughput * 100).toFixed(1);

  console.log(`Peak RPS (All Scenarios):`);
  console.log(`  Single Process: ${localMaxRps.toFixed(0)} RPS`);
  console.log(`  Clustered:      ${prodMaxRps.toFixed(0)} RPS`);
  console.log(`  Improvement:    ${rpsGain}% ${rpsGain > 0 ? "✨ BETTER" : "❌ WORSE"}\n`);

  console.log(`Peak Throughput (RPH):`);
  console.log(`  Single Process: ${localMaxThroughput.toLocaleString()} RPH`);
  console.log(`  Clustered:      ${prodMaxThroughput.toLocaleString()} RPH`);
  console.log(`  Improvement:    ${throughputGain}% ${throughputGain > 0 ? "✨ BETTER" : "❌ WORSE"}\n`);

  console.log(`Average Latency (All Scenarios):`);
  console.log(`  Single Process: ${localAvgLatency}ms`);
  console.log(`  Clustered:      ${prodAvgLatency}ms`);
  console.log(`  Improvement:    ${latencyGain}% ${latencyGain > 0 ? "✨ FASTER" : "❌ SLOWER"}\n`);

  console.log(`Success Rate:`);
  const localSuccessAvg = (localStats.reduce((a, s) => a + s.successRate, 0) / localStats.length).toFixed(2);
  const prodSuccessAvg = (prodStats.reduce((a, s) => a + s.successRate, 0) / prodStats.length).toFixed(2);
  console.log(`  Single Process: ${localSuccessAvg}%`);
  console.log(`  Clustered:      ${prodSuccessAvg}%\n`);

  // Scalability metrics
  console.log(`📈 Scalability: ${os.cpus().length}-Core CPU`);
  const scalabilityFactor = (prodMaxRps / localMaxRps).toFixed(2);
  console.log(`  RPS Scaling Factor: ${scalabilityFactor}x (Ideal: ${os.cpus().length}x)\n`);

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    system: {
      cpus: os.cpus().length,
      nodeVersion: process.version,
    },
    singleProcess: results.local,
    multiCoreCluster: results.production,
    summary: {
      peakRps: {
        singleProcess: localMaxRps,
        multiCore: prodMaxRps,
        improvementPercent: parseFloat(rpsGain),
        scalingFactor: parseFloat(scalabilityFactor),
      },
      peakThroughput: {
        singleProcess: localMaxThroughput,
        multiCore: prodMaxThroughput,
        improvementPercent: parseFloat(throughputGain),
      },
      avgLatency: {
        singleProcess: parseFloat(localAvgLatency),
        multiCore: parseFloat(prodAvgLatency),
        improvementPercent: parseFloat(latencyGain),
      },
      successRate: {
        singleProcess: parseFloat(localSuccessAvg),
        multiCore: parseFloat(prodSuccessAvg),
      },
    },
  };

  fs.writeFileSync(
    "stress-test-comparison.json",
    JSON.stringify(report, null, 2)
  );

  console.log("📁 Full report saved to: stress-test-comparison.json");
  console.log("\n✅ Stress test completed!");
}

main().catch(console.error);
