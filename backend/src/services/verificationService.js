const {
  OCR_CONFIDENCE_THRESHOLD
} = require("../../../shared/fdrPriority.mjs");

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-IN")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function normalizeAmount(value) {
  const normalized = String(value ?? "")
    .replace(/₹|rs\.?|inr/gi, "")
    .replace(/,/g, "")
    .replace(/\s/g, "");
  const amount = Number(normalized);

  return Number.isFinite(amount) ? amount : null;
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const dateText = String(value).trim();
  const indianDate = dateText.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (indianDate) {
    const [, dayText, monthText, yearText] = indianDate;
    const day = Number(dayText);
    const month = Number(monthText);
    const year = Number(yearText);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }

    return date.toISOString().slice(0, 10);
  }

  const date = new Date(dateText);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString().slice(0, 10);
}

function normalizeConfidence(value) {
  const overall =
    value && typeof value === "object" ? value.overall : value;

  if (!Number.isFinite(overall)) {
    return null;
  }

  const normalized = overall > 1 ? overall / 100 : overall;

  return normalized >= 0 && normalized <= 1 ? normalized : null;
}

function compareField(field, submittedValue, extractedValue, normalizer) {
  if (
    extractedValue === null ||
    extractedValue === undefined ||
    extractedValue === ""
  ) {
    return {
      field,
      submittedValue,
      extractedValue: null,
      result: "NOT_DETECTED"
    };
  }

  const submitted = normalizer(submittedValue);
  const extracted = normalizer(extractedValue);
  const result =
    submitted !== null && extracted !== null && submitted === extracted
      ? "MATCH"
      : "MISMATCH";

  return { field, submittedValue, extractedValue, result };
}

function check(key, label, points, status, explanation) {
  return { key, label, points, status, explanation };
}

function verificationCheckSummary({
  fields,
  confidence,
  extractionFailure,
  extractionMessage,
  duplicate,
  bankVerification,
  institution
}) {
  const fieldResult = (name) =>
    fields.find((field) => field.field === name)?.result || "NOT_DETECTED";
  const resultForFields = (names) => {
    const results = names.map(fieldResult);

    if (results.includes("MISMATCH")) {
      return "FAILED";
    }
    if (results.includes("NOT_DETECTED")) {
      return "PENDING";
    }
    return "PASS";
  };
  const hasAllOcrFields = [
    "fdrNumber",
    "bankName",
    "amount",
    "issueDate",
    "maturityDate"
  ].every((field) => fieldResult(field) !== "NOT_DETECTED");
  const documentOcrStatus = extractionFailure
    ? "FAILED"
    : confidence === null
      ? "PENDING"
      : confidence < OCR_CONFIDENCE_THRESHOLD
        ? "FAILED"
        : !hasAllOcrFields
          ? "PENDING"
          : "PASS";
  const rawBankStatus = String(
    bankVerification?.status ||
      (bankVerification?.verified ? "VERIFIED" : "PENDING")
  ).toUpperCase();
  const bankStatus =
    rawBankStatus === "VERIFIED"
      ? "PASS"
      : ["FAILED", "MISMATCH"].includes(rawBankStatus)
        ? "FAILED"
        : "PENDING";

  const checks = [
    check(
      "institution_match",
      "Institution Match",
      10,
      Number.isInteger(institution?.id) ? "PASS" : "FAILED",
      Number.isInteger(institution?.id)
        ? "Submission is linked to the authenticated institution."
        : "The authenticated institution could not be confirmed."
    ),
    check(
      "bank_name_match",
      "Bank Name Match",
      15,
      resultForFields(["bankName"]),
      fieldResult("bankName") === "MATCH"
        ? "Bank name matches the document OCR."
        : fieldResult("bankName") === "MISMATCH"
          ? "Bank name does not match the document OCR."
          : extractionMessage || "Awaiting bank name from document OCR."
    ),
    check(
      "fdr_number_match",
      "FDR Number Match",
      20,
      resultForFields(["fdrNumber"]),
      fieldResult("fdrNumber") === "MATCH"
        ? "FDR number matches the document OCR."
        : fieldResult("fdrNumber") === "MISMATCH"
          ? "FDR number does not match the document OCR."
          : extractionMessage || "Awaiting FDR number from document OCR."
    ),
    check(
      "amount_verification",
      "Amount Verification",
      20,
      resultForFields(["amount"]),
      fieldResult("amount") === "MATCH"
        ? "Amount matches the document OCR."
        : fieldResult("amount") === "MISMATCH"
          ? "Amount does not match the document OCR."
          : extractionMessage || "Awaiting amount from document OCR."
    ),
    check(
      "issue_date_match",
      "Issue Date Match",
      10,
      fieldResult("issueDate") === "MATCH"
        ? "PASS"
        : fieldResult("issueDate") === "MISMATCH"
          ? "FAILED"
          : "PENDING",
      fieldResult("issueDate") === "MATCH"
        ? "Issue date matches the document OCR."
        : fieldResult("issueDate") === "MISMATCH"
          ? "Issue date does not match the document OCR."
          : extractionMessage || "Awaiting issue date from document OCR."
    ),
    check(
      "maturity_date_match",
      "Maturity Date Match",
      10,
      fieldResult("maturityDate") === "MATCH"
        ? "PASS"
        : fieldResult("maturityDate") === "MISMATCH"
          ? "FAILED"
          : "PENDING",
      fieldResult("maturityDate") === "MATCH"
        ? "Maturity date matches the document OCR."
        : fieldResult("maturityDate") === "MISMATCH"
          ? "Maturity date does not match the document OCR."
          : extractionMessage || "Awaiting maturity date from document OCR."
    ),
    check(
      "document_ocr",
      "Document OCR",
      10,
      documentOcrStatus,
      extractionFailure
        ? extractionMessage || "Document OCR failed."
        : confidence === null
          ? extractionMessage || "OCR is not configured; document was not analyzed."
          : confidence < OCR_CONFIDENCE_THRESHOLD
            ? `OCR confidence is below the required ${Math.round(
                OCR_CONFIDENCE_THRESHOLD * 100
              )}% threshold.`
            : documentOcrStatus === "PASS"
              ? "Document OCR completed with all comparable fields matching."
              : "OCR did not detect all required fields."
    ),
    check(
      "bank_verification",
      "Mock Bank Record Match",
      5,
      bankStatus,
      bankVerification?.message ||
        "Awaiting confirmation from the bank verification provider."
    ),
    check(
      "duplicate_fdr_check",
      "Duplicate FDR Check",
      0,
      duplicate ? "FAILED" : "PASS",
      duplicate
        ? `Duplicate FDR number already exists (record ${duplicate.id}).`
        : "No matching FDR number was found in existing records."
    )
  ];

  return checks;
}

function verifyFdr({
  submitted,
  institution,
  extracted,
  ocrConfidence,
  extractionMessage,
  extractionFailure = false,
  duplicate,
  bankVerification
}) {
  const fields = [
    compareField("fdrNumber", submitted.fdrNumber, extracted?.fdrNumber, normalizeText),
    compareField("bankName", submitted.bankName, extracted?.bankName, normalizeText),
    compareField("amount", submitted.amount, extracted?.amount, normalizeAmount),
    compareField("issueDate", submitted.issueDate, extracted?.issueDate, normalizeDate),
    compareField("maturityDate", submitted.maturityDate, extracted?.maturityDate, normalizeDate)
  ];
  const confidence = normalizeConfidence(ocrConfidence);
  const checks = verificationCheckSummary({
    fields,
    confidence,
    extractionFailure,
    extractionMessage,
    duplicate,
    bankVerification,
    institution
  });
  const failed = checks.some((item) => item.status === "FAILED");
  const allPassed = checks.every((item) => item.status === "PASS");
  const automatedChecks = checks.filter(
    (item) => item.key !== "bank_verification"
  );
  const automatedStatus = extractionFailure
    ? "FAILED"
    : automatedChecks.some((item) => item.status === "FAILED")
      ? "FLAGGED"
      : automatedChecks.every((item) => item.status === "PASS")
        ? "COMPLETED"
        : "PENDING";
  const result = extractionFailure
    ? "FAILED"
    : failed
      ? "FLAGGED"
      : allPassed
        ? "VERIFIED"
        : "PENDING";
  const score = checks.reduce(
    (total, item) => total + (item.status === "PASS" ? item.points : 0),
    0
  );
  const reasons = checks
    .filter((item) => item.status !== "PASS")
    .map((item) => `${item.label}: ${item.explanation}`);

  return {
    result,
    automatedStatus,
    score,
    confidence,
    fields,
    checks,
    reason: reasons.join(" ") || "All required verification checks passed.",
    duplicate
  };
}

module.exports = {
  verifyFdr
};
