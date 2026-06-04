/**
 * Comprehensive Stress Test for IP Geolocation API
 * Tests: RPS, throughput, latency, and concurrent request handling
 */

const http = require("http");
const https = require("https");

// Configuration
const API_BASE = process.env.API_URL || "http://localhost:3000";
const API_KEY = process.env.API_KEY || "test_free_geo123";
const TEST_IP = "8.8.8.8";

// Test scenarios
const scenarios = [
  { name: "Light Load", duration: 10, concurrency: 5 },
  { name: "Medium Load", duration: 10, concurrency: 25 },
  { name: "Heavy Load", duration: 10, concurrency: 50 },
  { name: "Extreme Load", duration: 10, concurrency: 100 },
  { name: "Spike Test", duration: 5, concurrency: 200 },
];

class StressTest {
  constructor(baseUrl, apiKey) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
    this.protocol = baseUrl.startsWith("https") ? https : http;
  }

  async makeRequest() {
    return new Promise((resolve, reject) => {
      const url = new URL(`${this.baseUrl}/api/ip/${TEST_IP}`);
      const startTime = Date.now();

      const options = {
        method: "GET",
        headers: {
          "X-Api-Key": this.apiKey,
          "User-Agent": "StressTest/1.0",
        },
      };

      const req = this.protocol.request(url, options, (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          const latency = Date.now() - startTime;
          resolve({
            statusCode: res.statusCode,
            latency,
            success: res.statusCode === 200,
          });
        });
      });

      req.on("error", (err) => {
        reject(err);
      });

      req.setTimeout(10000, () => {
        req.destroy();
        reject(new Error("Request timeout"));
      });

      req.end();
    });
  }

  async runScenario(name, duration, concurrency) {
    console.log(`\n${"=".repeat(70)}`);
    console.log(`📊 Test: ${name}`);
    console.log(`⏱️  Duration: ${duration}s | 🔄 Concurrency: ${concurrency}`);
    console.log(`${"=".repeat(70)}`);

    const startTime = Date.now();
    const endTime = startTime + duration * 1000;
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    const latencies = [];
    const errors = {};

    // Create concurrent request workers with limited concurrency to avoid stack overflow
    const maxConcurrentWorkers = Math.min(concurrency, 50);
    const workers = [];
    for (let i = 0; i < maxConcurrentWorkers; i++) {
      workers.push(this.worker(endTime, latencies, errors, concurrency / maxConcurrentWorkers));
    }

    // Wait for all workers to complete
    const results = await Promise.allSettled(workers);

    // Process results
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        const { requests, successes, failures } = result.value;
        totalRequests += requests;
        successfulRequests += successes;
        failedRequests += failures;
      }
    });

    // Calculate statistics
    const elapsedSeconds = (Date.now() - startTime) / 1000;
    const rps = totalRequests / elapsedSeconds;
    const rpm = rps * 60;
    const rph = rpm * 60;
    const avgLatency = latencies.length
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;
    const minLatency = latencies.length ? Math.min(...latencies) : 0;
    const maxLatency = latencies.length ? Math.max(...latencies) : 0;
    const p95Latency = this.percentile(latencies, 95);
    const p99Latency = this.percentile(latencies, 99);

    // Display results
    console.log("\n📈 RESULTS:");
    console.log(`   Total Requests: ${totalRequests}`);
    console.log(`   ✅ Successful: ${successfulRequests} (${((successfulRequests / totalRequests) * 100).toFixed(2)}%)`);
    console.log(`   ❌ Failed: ${failedRequests} (${((failedRequests / totalRequests) * 100).toFixed(2)}%)`);

    console.log("\n📊 THROUGHPUT:");
    console.log(`   Requests/sec (RPS): ${rps.toFixed(2)}`);
    console.log(`   Requests/min (RPM): ${rpm.toFixed(2)}`);
    console.log(`   Requests/hour (RPH): ${rph.toFixed(2)}`);

    console.log("\n⏱️  LATENCY (ms):");
    console.log(`   Min: ${minLatency.toFixed(2)}`);
    console.log(`   Avg: ${avgLatency.toFixed(2)}`);
    console.log(`   P95: ${p95Latency.toFixed(2)}`);
    console.log(`   P99: ${p99Latency.toFixed(2)}`);
    console.log(`   Max: ${maxLatency.toFixed(2)}`);

    if (Object.keys(errors).length > 0) {
      console.log("\n⚠️  ERRORS:");
      Object.entries(errors).forEach(([error, count]) => {
        console.log(`   ${error}: ${count}`);
      });
    }

    return {
      name,
      totalRequests,
      successfulRequests,
      failedRequests,
      rps: parseFloat(rps.toFixed(2)),
      rpm: parseFloat(rpm.toFixed(2)),
      rph: parseFloat(rph.toFixed(2)),
      avgLatency: parseFloat(avgLatency.toFixed(2)),
      minLatency: parseFloat(minLatency.toFixed(2)),
      maxLatency: parseFloat(maxLatency.toFixed(2)),
      p95Latency: parseFloat(p95Latency.toFixed(2)),
      p99Latency: parseFloat(p99Latency.toFixed(2)),
    };
  }

  async worker(endTime, latencies, errors, loadMultiplier = 1) {
    let requests = 0;
    let successes = 0;
    let failures = 0;

    while (Date.now() < endTime) {
      try {
        const result = await this.makeRequest();
        requests++;
        if (result.success) {
          successes++;
        } else {
          failures++;
        }
        latencies.push(result.latency);
      } catch (error) {
        requests++;
        failures++;
        const errorMsg = error.message || "Unknown error";
        errors[errorMsg] = (errors[errorMsg] || 0) + 1;
      }
    }

    return { requests, successes, failures };
  }

  percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Main execution
async function main() {
  console.log("\n🚀 STRESS TEST SUITE - IP Geolocation API");
  console.log(`📍 Target: ${API_BASE}/api/ip/${TEST_IP}`);
  console.log(`🔑 API Key: ${API_KEY}`);

  const tester = new StressTest(API_BASE, API_KEY);
  const allResults = [];

  // Run all scenarios
  for (const scenario of scenarios) {
    try {
      const result = await tester.runScenario(
        scenario.name,
        scenario.duration,
        scenario.concurrency
      );
      allResults.push(result);

      // Small delay between scenarios
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`❌ Error in scenario "${scenario.name}":`, error.message);
    }
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("📋 SUMMARY TABLE");
  console.log(`${"=".repeat(70)}`);
  console.log(
    "Test Name | RPS | RPM | RPH | Avg Latency | P95 | P99 | Success %"
  );
  console.log("-".repeat(70));

  allResults.forEach((result) => {
    const successRate = ((result.successfulRequests / result.totalRequests) * 100).toFixed(2);
    console.log(
      `${result.name.padEnd(20)} | ${result.rps.toFixed(2).padEnd(6)} | ${result.rpm.toFixed(2).padEnd(8)} | ${result.rph.toFixed(2).padEnd(12)} | ${result.avgLatency.toFixed(2)}ms | ${result.p95Latency.toFixed(2)}ms | ${result.p99Latency.toFixed(2)}ms | ${successRate}%`
    );
  });

  console.log(`${"=".repeat(70)}\n`);

  // Best performer
  const bestRPS = allResults.reduce((prev, current) =>
    prev.rps > current.rps ? prev : current
  );
  console.log(`🏆 Best RPS Performance: ${bestRPS.name} (${bestRPS.rps} req/s)`);
  console.log(`\n✅ Stress testing complete!\n`);
}

main().catch(console.error);
