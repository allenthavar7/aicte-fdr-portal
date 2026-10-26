const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createConfiguredMockBankProvider,
  verifyBankFdr
} = require("../src/services/bankVerificationService");
const { verifyFdr } = require("../src/services/verificationService");

const submitted = {
  fdrNumber: "SBI/FDR/98231",
  bankName: "State Bank of India",
  amount: 1000000,
  issueDate: "2026-10-25",
  maturityDate: "2027-10-25",
  status: "ACTIVE"
};

const extracted = {
  fdrNumber: submitted.fdrNumber,
  bankName: submitted.bankName,
  amount: submitted.amount,
  issueDate: submitted.issueDate,
  maturityDate: submitted.maturityDate
};

const bankRecord = {
  fdrNumber: submitted.fdrNumber,
  bank: submitted.bankName,
  amount: submitted.amount,
  issueDate: "25/10/2026",
  maturityDate: "25/10/2027",
  fdrStatus: "ACTIVE"
};

async function verifySubmission({
  submittedValues = submitted,
  extractedValues = extracted,
  records = [bankRecord],
  extractionFailure = false,
  duplicate = null
} = {}) {
  const bankVerification = await verifyBankFdr(
    submittedValues,
    createConfiguredMockBankProvider(records)
  );
  return verifyFdr({
    submitted: submittedValues,
    institution: { id: 1, name: "Example Institution" },
    extracted: extractedValues,
    ocrConfidence: extractionFailure ? null : { overall: 95 },
    extractionMessage: extractionFailure ? "OCR could not read the document." : "",
    extractionFailure,
    duplicate,
    bankVerification
  });
}

test("exact OCR and mock-bank match verifies with a 100-point score", async () => {
  const result = await verifySubmission();

  assert.equal(result.result, "VERIFIED");
  assert.equal(result.score, 100);
  assert.equal(result.checks.every((check) => check.status === "PASS"), true);
});

test("mock-bank financial mismatch is flagged and identifies the failed field", async () => {
  const result = await verifySubmission({
    records: [{ ...bankRecord, amount: 900000 }]
  });
  const amountCheck = result.checks.find(
    (check) => check.key === "bank_verification"
  );

  assert.equal(result.result, "FLAGGED");
  assert.equal(result.score, 95);
  assert.equal(result.fields.find((field) => field.field === "amount").result, "MATCH");
  assert.equal(amountCheck.status, "FAILED");
  assert.match(amountCheck.explanation, /amount/i);
});

test("OCR amount mismatch is exposed in field comparisons and flags the FDR", async () => {
  const result = await verifySubmission({
    extractedValues: { ...extracted, amount: 900000 }
  });
  const amountComparison = result.fields.find(
    (field) => field.field === "amount"
  );

  assert.equal(result.result, "FLAGGED");
  assert.equal(amountComparison.result, "MISMATCH");
  assert.equal(
    result.checks.find((check) => check.key === "amount_verification").status,
    "FAILED"
  );
});

test("missing mock-bank record is not treated as verified", async () => {
  const result = await verifySubmission({ records: [] });
  const bankCheck = result.checks.find(
    (check) => check.key === "bank_verification"
  );

  assert.equal(result.result, "FLAGGED");
  assert.equal(bankCheck.status, "FAILED");
  assert.match(bankCheck.explanation, /no matching/i);
});

test("configured mock records are loaded from MOCK_BANK_RECORDS_JSON", async () => {
  const original = process.env.MOCK_BANK_RECORDS_JSON;
  process.env.MOCK_BANK_RECORDS_JSON = JSON.stringify([bankRecord]);

  try {
    const result = await verifyBankFdr(
      submitted,
      createConfiguredMockBankProvider()
    );
    assert.equal(result.status, "VERIFIED");
    assert.equal(result.checks.amount, true);
    assert.equal(result.checks.issueDate, true);
    assert.equal(result.checks.maturityDate, true);
  } finally {
    if (original === undefined) {
      delete process.env.MOCK_BANK_RECORDS_JSON;
    } else {
      process.env.MOCK_BANK_RECORDS_JSON = original;
    }
  }
});

test("duplicate FDR number is flagged", async () => {
  const result = await verifySubmission({
    duplicate: { id: 42, fdr_number: submitted.fdrNumber }
  });

  assert.equal(result.result, "FLAGGED");
  assert.equal(
    result.checks.find((check) => check.key === "duplicate_fdr_check").status,
    "FAILED"
  );
});

test("unreadable OCR result fails without passing verification", async () => {
  const result = await verifySubmission({
    extractedValues: null,
    extractionFailure: true
  });

  assert.equal(result.result, "FAILED");
  assert.equal(
    result.checks.find((check) => check.key === "document_ocr").status,
    "FAILED"
  );
});
