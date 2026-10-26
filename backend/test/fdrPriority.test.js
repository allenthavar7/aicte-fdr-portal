const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateFdrPriority
} = require("../../shared/fdrPriority.mjs");

const AS_OF = "2026-10-26";
const stableFdr = {
  fdr_number: "TEST-FDR-001",
  status: "ACTIVE",
  verification_status: "VERIFIED",
  maturity_date: "2027-10-26",
  documents: [{ id: 1 }],
  verification: {
    result: "VERIFIED",
    ocr_confidence: 0.95,
    comparisons: [],
    checks: [],
    bank_verification: { status: "VERIFIED" }
  },
  renewals: [],
  release_requests: []
};

function calculate(fdr) {
  return calculateFdrPriority(fdr, { asOf: AS_OF });
}

test("normal active and fully verified FDR is low priority", () => {
  assert.deepEqual(calculate(stableFdr), {
    score: 0,
    level: "Low",
    reasons: []
  });
});

test("FDR within 30 days receives maturity urgency", () => {
  const priority = calculate({
    ...stableFdr,
    maturity_date: "2026-11-10"
  });
  assert.equal(priority.score, 35);
  assert.equal(priority.level, "Low");
  assert.equal(priority.reasons[0].type, "matures_within_30_days");
});

test("matured FDR without renewal action includes maturity and overdue renewal", () => {
  const priority = calculate({
    ...stableFdr,
    maturity_date: "2026-10-25"
  });
  assert.equal(priority.score, 50);
  assert.equal(priority.level, "Medium");
  assert.deepEqual(priority.reasons.map((reason) => reason.type), [
    "matured",
    "renewal_overdue"
  ]);
});

test("bank verification failure is critical", () => {
  const priority = calculate({
    ...stableFdr,
    verification: {
      ...stableFdr.verification,
      result: "FLAGGED",
      bank_verification: { status: "FAILED" }
    }
  });
  assert.equal(priority.score, 30);
  assert.equal(priority.reasons[0].type, "bank_verification_failed");
});

test("missing mock-bank record is pending rather than a bank failure", () => {
  const priority = calculate({
    ...stableFdr,
    verification_status: "PENDING",
    verification: {
      ...stableFdr.verification,
      result: "PENDING",
      bank_verification: { status: "NOT_FOUND" }
    }
  });

  assert.equal(priority.score, 10);
  assert.equal(priority.reasons[0].type, "verification_pending");
});

test("amount discrepancy is counted once despite failed check and comparison", () => {
  const priority = calculate({
    ...stableFdr,
    verification: {
      ...stableFdr.verification,
      result: "FLAGGED",
      comparisons: [{ field: "amount", result: "MISMATCH" }],
      checks: [{ key: "amount_verification", status: "FAILED" }]
    }
  });
  assert.equal(priority.score, 25);
  assert.equal(
    priority.reasons.filter((reason) => reason.type === "amount_mismatch").length,
    1
  );
});

test("OCR mismatch and low confidence do not double-count one document issue", () => {
  const priority = calculate({
    ...stableFdr,
    verification: {
      ...stableFdr.verification,
      ocr_confidence: 0.5,
      comparisons: [{ field: "issueDate", result: "MISMATCH" }]
    }
  });
  assert.equal(priority.score, 20);
  assert.deepEqual(priority.reasons.map((reason) => reason.type), [
    "ocr_mismatch"
  ]);
});

test("renewal pending after maturity and aged release request contribute", () => {
  const priority = calculate({
    ...stableFdr,
    maturity_date: "2026-10-25",
    renewals: [{ status: "PENDING", new_fdr_id: null }],
    release_requests: [{ status: "PENDING", created_at: "2026-09-01" }]
  });
  assert.equal(priority.score, 65);
  assert.equal(priority.level, "High");
  assert.deepEqual(priority.reasons.map((reason) => reason.type), [
    "matured",
    "renewal_pending_after_maturity",
    "release_pending_extended"
  ]);
});

test("score is capped at 100 and missing fields do not crash", () => {
  const priority = calculate({
    verification_status: "FLAGGED",
    maturity_date: "2020-01-01",
    documents: [],
    verification: {
      result: "FLAGGED",
      ocr_confidence: 0.1,
      comparisons: [
        { field: "amount", result: "MISMATCH" },
        { field: "fdrNumber", result: "MISMATCH" },
        { field: "bankName", result: "MISMATCH" },
        { field: "issueDate", result: "MISMATCH" }
      ],
      checks: [
        { key: "institution_match", status: "FAILED" },
        { key: "duplicate_fdr_check", status: "FAILED" }
      ],
      bank_verification: { status: "FAILED" }
    },
    renewals: [],
    release_requests: [{ status: "ACTION_REQUIRED" }]
  });
  assert.equal(priority.score, 100);
  assert.equal(priority.level, "Critical");
  assert.doesNotThrow(() => calculate({}));
});
