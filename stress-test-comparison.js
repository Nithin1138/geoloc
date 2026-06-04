#!/usr/bin/env node
/**
 * Enhanced Stress Test: Local vs Production
 * Compares mock server (perfect conditions) vs optimized production (real load)
 */

const http = require("http");
const { spawn } = require("child_process");
const fs = require("fs");

const TEST_IP = "8.8.8.8";
const API_KEY = "test_free_geo123";
const PORT = 3000;

// Extended scenarios with upper limit tests
const scenarios = [
  { name: "Light Load", duration: 10, concurrency: 5 },
  { name: "Medium Load", duration: 10, concurrency: 25 },
  { name: "Heavy Load", duration: 10, concurrency: 50 },
  { name: "Extreme Load", duration: 10, concurrency: 100 },
  { name: "Ultra Extreme", duration: 10, concurrency: 200 },
  { name: "Max Burst", duration: 5, concurrency: 500 },
];

class StressTest {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
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
      `\n  🧪 ${scenario.name}: ${scenario.concurrency} concurrent users, ${scenario.duration}s`
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

// Helper to start/stop server
function startServer(mockMode = false) {
  return new Promise((resolve) => {
    const env = { ...process.env, PORT };

    if (mockMode) {
      console.log("\n🚀 Starting mock server (single process, no clustering)...");
      const proc = spawn("node", ["mock-server.js"], { env, stdio: "pipe" });
      setTimeout(() => resolve(proc), 2000);
    } else {
      console.log("\n🚀 Starting production server (multi-core clustering)...");
      env.WORKERS = require("os").cpus().length;
      const proc = spawn("node", ["src/index.js"], { env, stdio: "pipe" });
      setTimeout(() => resolve(proc), 3000);
    }
  });
}

async function main() {
  console.log("\n");
  console.log("╔══════════════════════════════════════════════════════════════════════╗");
  console.log("║     IP Geolocation API - Enhanced Stress Test (Local vs Production)   ║");
  console.log("╚══════════════════════════════════════════════════════════════════════╝");

  const results = {};

  // Test 1: Mock Server (Local/Development)
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 1: MOCK SERVER (Single Process, No Clustering, No Caching)     │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const mockServer = await startServer(true);
  const mockTest = new StressTest(`http://localhost:${PORT}`, API_KEY);
  await mockTest.runAllScenarios();
  results.mock = mockTest.getStats();

  mockServer.kill();
  await new Promise((r) => setTimeout(r, 2000));

  // Test 2: Production Server (with Clustering + Caching)
  console.log("\n┌─────────────────────────────────────────────────────────────────────┐");
  console.log("│ TEST 2: PRODUCTION SERVER (Multi-Core Clustering + LRU Caching)    │");
  console.log("└─────────────────────────────────────────────────────────────────────┘");

  const prodServer = await startServer(false);
  const prodTest = new StressTest(`http://localhost:${PORT}`, API_KEY);
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

  const mockStats = results.mock;
  const prodStats = results.production;

  console.log("📊 DETAILED COMPARISON\n");

  for (let i = 0; i < mockStats.length; i++) {
    const mock = mockStats[i];
    const prod = prodStats[i];

    const rpsImprovement = (((prod.rps - mock.rps) / mock.rps) * 100).toFixed(1);
    const latencyImprovement = (((mock.latency.avg - prod.latency.avg) / mock.latency.avg) * 100).toFixed(1);

    console.log(`\n🔹 Scenario: ${mock.scenario}`);
    console.log("─".repeat(66));

    console.log(
      `  RPS:      Mock: ${mock.rps.toFixed(0).padStart(6)} | Prod: ${prod.rps.toFixed(0).padStart(6)} | ${rpsImprovement}% ${rpsImprovement > 0 ? "🚀" : "📉"}`
    );
    console.log(
      `  Latency:  Mock: ${mock.latency.avg.toFixed(1)}ms | Prod: ${prod.latency.avg.toFixed(1)}ms | ${latencyImprovement}% ${latencyImprovement > 0 ? "⚡" : "🐢"}`
    );
    console.log(
      `  Success:  Mock: ${mock.successRate}% | Prod: ${prod.successRate}%`
    );
  }

  // Overall summary
  console.log("\n╔════════════════════════════════════════════════════════════════════════╗");
  console.log("║                         OVERALL SUMMARY                                ║");
  console.log("╚════════════════════════════════════════════════════════════════════════╝\n");

  const mockMaxRps = Math.max(...mockStats.map((s) => s.rps));
  const prodMaxRps = Math.max(...prodStats.map((s) => s.rps));
  const mockAvgLatency = (mockStats.reduce((a, s) => a + s.latency.avg, 0) / mockStats.length).toFixed(2);
  const prodAvgLatency = (prodStats.reduce((a, s) => a + s.latency.avg, 0) / prodStats.length).toFixed(2);

  const rpsGain = ((prodMaxRps - mockMaxRps) / mockMaxRps * 100).toFixed(1);
  const latencyGain = ((mockAvgLatency - prodAvgLatency) / mockAvgLatency * 100).toFixed(1);

  console.log(`Peak RPS (All Scenarios):`);
  console.log(`  Mock:       ${mockMaxRps.toFixed(0)} RPS`);
  console.log(`  Production: ${prodMaxRps.toFixed(0)} RPS`);
  console.log(`  Improvement: ${rpsGain}% ${rpsGain > 0 ? "✨ FASTER" : "❌ SLOWER"}\n`);

  console.log(`Average Latency:`);
  console.log(`  Mock:       ${mockAvgLatency}ms`);
  console.log(`  Production: ${prodAvgLatency}ms`);
  console.log(`  Improvement: ${latencyGain}% ${latencyGain > 0 ? "✨ FASTER" : "❌ SLOWER"}\n`);

  console.log(`Success Rate:`);
  const mockSuccessAvg = (mockStats.reduce((a, s) => a + s.successRate, 0) / mockStats.length).toFixed(2);
  const prodSuccessAvg = (prodStats.reduce((a, s) => a + s.successRate, 0) / prodStats.length).toFixed(2);
  console.log(`  Mock:       ${mockSuccessAvg}%`);
  console.log(`  Production: ${prodSuccessAvg}%\n`);

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    environment: `${require("os").cpus().length}-core CPU`,
    mock: results.mock,
    production: results.production,
    summary: {
      peakRps: { mock: mockMaxRps, production: prodMaxRps, improvement: rpsGain },
      avgLatency: { mock: mockAvgLatency, production: prodAvgLatency, improvement: latencyGain },
      successRate: { mock: mockSuccessAvg, production: prodSuccessAvg },
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
