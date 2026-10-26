const OCR_CONFIDENCE_THRESHOLD = 0.8;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function normalizeStatus(value) {
  return String(value ?? "").trim().toUpperCase().replaceAll(" ", "_");
}

function parseDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate()
        ));
  }

  const text = String(value).trim();
  const localDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const indianDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  let year;
  let month;
  let day;

  if (localDate) {
    [, year, month, day] = localDate;
    year = Number(year);
    month = Number(month);
    day = Number(day);
  } else if (indianDate) {
    [, day, month, year] = indianDate;
    year = Number(year);
    month = Number(month);
    day = Number(day);
  } else {
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      return null;
    }
    year = parsed.getUTCFullYear();
    month = parsed.getUTCMonth() + 1;
    day = parsed.getUTCDate();
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

function getVerification(fdr) {
  return fdr?.verification && typeof fdr.verification === "object"
    ? fdr.verification
    : {};
}

function getComparisons(verification) {
  return Array.isArray(verification.comparisons)
    ? verification.comparisons
    : Array.isArray(verification.comparison_results)
      ? verification.comparison_results
      : [];
}

function getChecks(verification) {
  return Array.isArray(verification.checks)
    ? verification.checks
    : Array.isArray(verification.verification_checks)
      ? verification.verification_checks
      : [];
}

function addReason(reasons, type, label, points) {
  if (!reasons.some((reason) => reason.type === type)) {
    reasons.push({ type, label, points });
  }
}

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
      }).format(amount)
    : null;
}

function calculateFdrPriority(fdr, options = {}) {
  const reasons = [];
  const verification = getVerification(fdr);
  const comparisons = getComparisons(verification);
  const checks = getChecks(verification);
  const bankVerification =
    verification.bank_verification || verification.bankVerification || null;
  const bankStatus = normalizeStatus(bankVerification?.status);
  const verificationStatus = normalizeStatus(
    fdr?.verification_status || verification.result || verification.status
  );
  const today = parseDate(options.asOf || new Date()) || parseDate(new Date());
  const maturityDate = parseDate(fdr?.maturity_date || fdr?.maturityDate);
  const maturityDays = maturityDate
    ? Math.floor((maturityDate.getTime() - today.getTime()) / DAY_IN_MS)
    : null;

  if (maturityDays !== null) {
    if (maturityDays < 0) {
      addReason(reasons, "matured", "FDR has matured", 30);
    } else if (maturityDays <= 30) {
      addReason(reasons, "matures_within_30_days", "FDR matures within 30 days", 25);
    } else if (maturityDays <= 90) {
      addReason(reasons, "matures_within_90_days", "FDR matures within 90 days", 15);
    }
  }

  const comparisonFor = (field) =>
    comparisons.find(
      (item) =>
        normalizeStatus(item.field) === normalizeStatus(field) &&
        normalizeStatus(item.result) === "MISMATCH"
    );
  const bankChecks = bankVerification?.checks || {};
  const checkFailed = (key) =>
    checks.some(
      (item) =>
        normalizeStatus(item.key) === normalizeStatus(key) &&
        normalizeStatus(item.status) === "FAILED"
    );
  const amountMismatch =
    Boolean(comparisonFor("amount")) || bankChecks.amount === false;
  const fdrNumberMismatch =
    Boolean(comparisonFor("fdrNumber")) || bankChecks.fdrNumber === false;
  const bankMismatch =
    Boolean(comparisonFor("bankName")) || bankChecks.bank === false;
  const institutionMismatch = checkFailed("institution_match");
  const bankFailed =
    bankStatus === "FAILED" ||
    (bankStatus === "MISMATCH" &&
      !amountMismatch &&
      !fdrNumberMismatch &&
      !bankMismatch);

  if (bankFailed) {
    addReason(
      reasons,
      "bank_verification_failed",
      "Bank verification failed",
      30
    );
  }
  if (amountMismatch) {
    const amountComparison = comparisonFor("amount");
    const submittedAmount = formatAmount(
      fdr?.amount ?? amountComparison?.submittedValue
    );
    const verifiedAmount = formatAmount(
      bankVerification?.amount ?? amountComparison?.extractedValue
    );
    addReason(
      reasons,
      "amount_mismatch",
      submittedAmount && verifiedAmount
        ? `Amount mismatch: submitted ${submittedAmount}, verified ${verifiedAmount}`
        : "Submitted amount does not match the verified amount",
      25
    );
  }
  if (fdrNumberMismatch) {
    addReason(
      reasons,
      "fdr_number_mismatch",
      "FDR number does not match the verified record",
      25
    );
  }
  if (bankMismatch) {
    addReason(
      reasons,
      "bank_mismatch",
      "Bank name does not match the verified record",
      20
    );
  }
  if (institutionMismatch) {
    addReason(
      reasons,
      "institution_mismatch",
      "Institution could not be matched to the authenticated account",
      15
    );
  }

  const documentsAvailable =
    Array.isArray(fdr?.documents) ||
    (fdr?.document_count !== null &&
      fdr?.document_count !== undefined &&
      Number.isFinite(Number(fdr.document_count)));
  const hasDocuments = Array.isArray(fdr?.documents)
    ? fdr.documents.length > 0
    : Number(fdr?.document_count) > 0;
  if (documentsAvailable && !hasDocuments) {
    addReason(
      reasons,
      "document_missing",
      "Required FDR document is missing",
      15
    );
  }

  const documentFieldMismatch = comparisons.some(
    (item) =>
      ["ISSUEDATE", "MATURITYDATE"].includes(normalizeStatus(item.field)) &&
      normalizeStatus(item.result) === "MISMATCH"
  );
  const allFieldMismatches = amountMismatch || fdrNumberMismatch || bankMismatch;
  const ocrCheckFailed = checkFailed("document_ocr");
  const ocrConfidenceValue = verification.ocr_confidence ??
    verification.ocrConfidence ??
    verification.confidence?.overall;
  const confidenceNumber = Number(ocrConfidenceValue);
  const ocrConfidence =
    Number.isFinite(confidenceNumber) && confidenceNumber > 1
      ? confidenceNumber / 100
      : confidenceNumber;
  const confidenceBelowThreshold =
    Number.isFinite(ocrConfidence) &&
    ocrConfidence < OCR_CONFIDENCE_THRESHOLD;

  if (documentFieldMismatch || (!allFieldMismatches && ocrCheckFailed)) {
    addReason(
      reasons,
      "ocr_mismatch",
      "OCR/document details do not match the submitted FDR data",
      20
    );
  } else if (
    !documentFieldMismatch &&
    !allFieldMismatches &&
    !ocrCheckFailed &&
    confidenceBelowThreshold
  ) {
    addReason(
      reasons,
      "ocr_confidence_low",
      `OCR confidence is below the ${Math.round(
        OCR_CONFIDENCE_THRESHOLD * 100
      )}% threshold`,
      10
    );
  }

  const hasVerificationFailure =
    bankFailed ||
    amountMismatch ||
    fdrNumberMismatch ||
    bankMismatch ||
    institutionMismatch ||
    documentFieldMismatch ||
    ocrCheckFailed ||
    checks.some((item) => normalizeStatus(item.status) === "FAILED");
  const bankPending =
    bankStatus === "PENDING" ||
    (bankStatus === "" &&
      !["VERIFIED", "REJECTED"].includes(verificationStatus));
  if (
    (verificationStatus === "PENDING" || bankPending) &&
    !hasVerificationFailure
  ) {
    addReason(reasons, "verification_pending", "Verification is pending", 10);
  }

  const renewalRequests = Array.isArray(fdr?.renewals) ? fdr.renewals : null;
  if (renewalRequests && maturityDays !== null) {
    const openRenewals = renewalRequests.filter((renewal) =>
      ["PENDING", "UNDER_REVIEW", "ACTION_REQUIRED", "APPROVED"].includes(
        normalizeStatus(renewal.status)
      ) && !renewal.new_fdr_id
    );
    const hasCompletedRenewal = renewalRequests.some(
      (renewal) => Boolean(renewal.new_fdr_id)
    );

    if (maturityDays < 0 && openRenewals.length > 0) {
      addReason(
        reasons,
        "renewal_pending_after_maturity",
        "Renewal is still pending after maturity",
        20
      );
    } else if (
      maturityDays < 0 &&
      !hasCompletedRenewal &&
      openRenewals.length === 0
    ) {
      addReason(reasons, "renewal_overdue", "Renewal is overdue", 20);
    } else if (
      maturityDays >= 0 &&
      maturityDays <= 90 &&
      !hasCompletedRenewal
    ) {
      addReason(reasons, "renewal_due_soon", "Renewal is due soon", 10);
    }
  }

  const releaseRequests = Array.isArray(fdr?.release_requests)
    ? fdr.release_requests
    : [];
  for (const request of releaseRequests) {
    const status = normalizeStatus(request.status);
    const createdAt = parseDate(request.created_at);
    const requestAgeDays = createdAt
      ? Math.floor((today.getTime() - createdAt.getTime()) / DAY_IN_MS)
      : null;
    if (
      status === "PENDING" &&
      requestAgeDays !== null &&
      requestAgeDays > 30
    ) {
      addReason(
        reasons,
        "release_pending_extended",
        "Release request has been pending for more than 30 days",
        15
      );
    }
    if (status === "ACTION_REQUIRED") {
      addReason(
        reasons,
        "release_unresolved_issue",
        "Release request has an unresolved issue",
        20
      );
    }
  }

  const representedCheckKeys = new Set([
    "BANK_VERIFICATION",
    "AMOUNT_VERIFICATION",
    "FDR_NUMBER_MATCH",
    "BANK_NAME_MATCH",
    "INSTITUTION_MATCH",
    "DOCUMENT_OCR",
    "ISSUE_DATE_MATCH",
    "MATURITY_DATE_MATCH"
  ]);
  const discrepancies = new Set();
  for (const item of checks) {
    if (
      normalizeStatus(item.status) !== "FAILED" ||
      representedCheckKeys.has(normalizeStatus(item.key))
    ) {
      continue;
    }
    discrepancies.add(
      String(item.key || item.label || item.explanation || "verification")
    );
  }
  for (const item of comparisons) {
    if (
      normalizeStatus(item.result) !== "MISMATCH" ||
      [
        "AMOUNT",
        "FDRNUMBER",
        "BANKNAME",
        "ISSUEDATE",
        "MATURITYDATE"
      ].includes(normalizeStatus(item.field))
    ) {
      continue;
    }
    discrepancies.add(String(item.field || "document"));
  }
  [...discrepancies].slice(0, 2).forEach((discrepancy, index) => {
    addReason(
      reasons,
      `unresolved_discrepancy_${index + 1}`,
      "Unresolved verification discrepancy",
      10
    );
  });

  const score = Math.min(
    100,
    reasons.reduce((total, reason) => total + reason.points, 0)
  );
  const level =
    score >= 80
      ? "Critical"
      : score >= 60
        ? "High"
        : score >= 40
          ? "Medium"
          : "Low";

  return { score, level, reasons };
}

export {
  OCR_CONFIDENCE_THRESHOLD,
  calculateFdrPriority
};
