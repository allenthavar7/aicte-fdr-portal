const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const jwt = require("jsonwebtoken");
const express = require("express");
const dashboardRoutes = require("../src/routes/dashboard");

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-change-this";

// Create test app with dashboard route
const app = express();
app.use(express.json());
app.use("/dashboard", dashboardRoutes);

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

function createToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "1h" });
}

async function request(path, token) {
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, { headers });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

test("status-logs: requires authentication", async () => {
  const res = await request("/dashboard/status-logs");
  assert.equal(res.status, 401);
});

test("status-logs: default state returns recent events across all statuses", async () => {
  const token = createToken({ id: 2, role: "OFFICER", email: "officer@aicte.gov.in" });
  const res = await request("/dashboard/status-logs", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "all");
  assert.ok(Array.isArray(res.body.events));
  assert.ok(res.body.events.length <= 10);
  assert.ok(res.body.events.length > 0);
  // Check masking
  const firstEvent = res.body.events[0];
  assert.ok(firstEvent.fdr_number_masked.includes("****"));
  assert.ok(firstEvent.actor);
  assert.ok(firstEvent.remark);
});

test("status-logs: filtered by status 'under_review'", async () => {
  const token = createToken({ id: 2, role: "OFFICER", email: "officer@aicte.gov.in" });
  const res = await request("/dashboard/status-logs?status=under_review", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "Under Review");
  assert.ok(Array.isArray(res.body.events));
  assert.equal(res.body.events.length, 5);
});

test("status-logs: event counts match FDR counts exactly across all statuses", async () => {
  const token = createToken({ id: 2, role: "OFFICER", email: "officer@aicte.gov.in" });
  const expectedCounts = {
    active: 26,
    submitted: 3,
    under_review: 5,
    discrepancy_found: 5,
    approaching_maturity: 6,
    matured: 3,
    release_requested: 3
  };

  for (const [statusKey, expectedCount] of Object.entries(expectedCounts)) {
    const res = await request(`/dashboard/status-logs?status=${statusKey}`, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.events.length, expectedCount, `Expected ${expectedCount} events for ${statusKey}`);
    assert.equal(res.body.has_more, false);
    // Verify distinct fdr_ids (1 event per FDR)
    const distinctFdrs = new Set(res.body.events.map((e) => e.fdr_id));
    assert.equal(distinctFdrs.size, expectedCount, `Expected ${expectedCount} unique FDRs for ${statusKey}`);
  }
});

test("status-logs: discrepancy events include rule_code and rule_reason", async () => {
  const token = createToken({ id: 2, role: "OFFICER", email: "officer@aicte.gov.in" });
  const res = await request("/dashboard/status-logs?status=discrepancy_found", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "Discrepancy Found");
  assert.ok(Array.isArray(res.body.events));
  assert.ok(res.body.events.length > 0);

  const ruleEvents = res.body.events.filter((e) => e.rule_code);
  assert.ok(ruleEvents.length > 0, "Should have at least one event with rule_code");
  assert.ok(ruleEvents[0].rule_code.startsWith("R"));
  assert.ok(ruleEvents[0].rule_reason.length > 0);
});

test("status-logs: release requested events include clearance_progress", async () => {
  const token = createToken({ id: 2, role: "OFFICER", email: "officer@aicte.gov.in" });
  const res = await request("/dashboard/status-logs?status=release_requested", token);
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "Release Requested");
  assert.ok(Array.isArray(res.body.events));
  assert.ok(res.body.events.length > 0);

  const clearanceEvents = res.body.events.filter((e) => e.clearance_progress);
  assert.ok(clearanceEvents.length > 0, "Should have event with clearance_progress");
  assert.ok(clearanceEvents[0].clearance_progress.includes("cleared"));
});

test("status-logs: institution RBAC restricts to own institution records", async () => {
  // User 1 is ABC
  const token = createToken({ id: 1, role: "INSTITUTION", email: "admin@abc.ac.in" });
  const res = await request("/dashboard/status-logs?status=active", token);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.events));

  // All events must belong to ABC
  for (const ev of res.body.events) {
    assert.equal(ev.institution, "ABC");
  }
});
