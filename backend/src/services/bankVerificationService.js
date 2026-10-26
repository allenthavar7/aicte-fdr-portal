function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("en-IN")
    .replace(/\s+/g, " ");
}

function normalizeAmount(value) {
  const amount = Number(
    String(value ?? "")
      .replace(/^(?:₹|rs\.?|inr)\s*/i, "")
      .replace(/[,\s]/g, "")
  );

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

// This deterministic provider deliberately stays PENDING: echoing submitted
// values is not bank confirmation. Replace it with a real bank integration.
function mockBankVerificationProvider(fdr) {
  return {
    status: "PENDING",
    verified: false,
    exists: null,
    bank: fdr.bankName,
    fdrNumber: fdr.fdrNumber,
    amount: normalizeAmount(fdr.amount),
    issueDate: fdr.issueDate,
    maturityDate: fdr.maturityDate,
    fdrStatus: fdr.status,
    source: "MOCK_BANK_PROVIDER",
    isMock: true,
    message: "Awaiting bank confirmation. Mock provider is not connected to a bank."
  };
}

function createConfiguredMockBankProvider(records = loadMockBankRecords()) {
  return async (fdr) => {
    const record = records.find(
      (candidate) =>
        normalize(candidate.fdrNumber || candidate.fdr_number) ===
          normalize(fdr.fdrNumber) &&
        normalize(candidate.bank || candidate.bankName || candidate.bank_name) ===
          normalize(fdr.bankName)
    );

    if (!record) {
      return {
        status: "NOT_FOUND",
        verified: false,
        exists: false,
        bank: fdr.bankName,
        fdrNumber: fdr.fdrNumber,
        amount: null,
        fdrStatus: null,
        source: "MOCK_BANK_PROVIDER",
        isMock: true,
        message:
          "No matching configured mock bank record was found; this is not a real bank lookup."
      };
    }

    return {
      ...record,
      bank: record.bank || record.bankName || record.bank_name,
      fdrNumber: record.fdrNumber || record.fdr_number,
      amount: normalizeAmount(record.amount),
      issueDate: record.issueDate || record.issue_date,
      maturityDate: record.maturityDate || record.maturity_date,
      fdrStatus: record.fdrStatus || record.fdr_status || record.status,
      status: "VERIFIED",
      exists: true,
      source: "MOCK_BANK_PROVIDER",
      isMock: true,
      message:
        "Mock bank record was found; submitted details are being compared. This is not a real bank confirmation."
    };
  };
}

function loadMockBankRecords() {
  if (!process.env.MOCK_BANK_RECORDS_JSON) {
    return [];
  }

  let records;
  try {
    records = JSON.parse(process.env.MOCK_BANK_RECORDS_JSON);
  } catch (error) {
    throw new Error("MOCK_BANK_RECORDS_JSON must contain valid JSON");
  }

  if (
    !Array.isArray(records) ||
    records.some(
      (record) =>
        !record ||
        !(record.fdrNumber || record.fdr_number) ||
        !(record.bank || record.bankName || record.bank_name) ||
        !Number.isFinite(normalizeAmount(record.amount)) ||
        !(record.issueDate || record.issue_date) ||
        !(record.maturityDate || record.maturity_date) ||
        !(record.fdrStatus || record.fdr_status || record.status)
    )
  ) {
    throw new Error(
      "MOCK_BANK_RECORDS_JSON must be an array of complete mock FDR records"
    );
  }

  return records;
}

async function verifyBankFdr(fdr, provider = mockBankVerificationProvider) {
  const providerResult = await provider(fdr);
  const providerStatus = [
    "PENDING",
    "VERIFIED",
    "FAILED",
    "NOT_FOUND",
    "MISMATCH"
  ].includes(
    String(providerResult.status || "").toUpperCase()
  )
    ? String(providerResult.status).toUpperCase()
    : providerResult.verified === true
      ? "VERIFIED"
      : "FAILED";
  const checks = {
    exists: providerResult.exists === true,
    fdrNumber:
      normalize(providerResult.fdrNumber) === normalize(fdr.fdrNumber),
    bank: normalize(providerResult.bank) === normalize(fdr.bankName),
    amount:
      normalizeAmount(providerResult.amount) === normalizeAmount(fdr.amount),
    issueDate:
      normalizeDate(providerResult.issueDate) === normalizeDate(fdr.issueDate),
    maturityDate:
      normalizeDate(providerResult.maturityDate) ===
      normalizeDate(fdr.maturityDate),
    activeStatus:
      normalize(providerResult.fdrStatus || providerResult.status) === "active" &&
      normalize(fdr.status) === "active"
  };
  const consistent = Object.entries(checks)
    .filter(([check]) => check !== "exists" || providerStatus === "VERIFIED")
    .every(([, passed]) => passed);
  const status =
    providerStatus === "VERIFIED" && !consistent ? "MISMATCH" : providerStatus;
  const verified = status === "VERIFIED";

  return {
    ...providerResult,
    status,
    verified,
    checks,
    message:
      status === "PENDING"
        ? providerResult.message || "Awaiting bank confirmation."
        : status === "NOT_FOUND"
          ? providerResult.message || "No matching mock bank record was found."
          : status === "MISMATCH"
            ? `Mock bank record found, but these details differ: ${
                Object.entries(checks)
                  .filter(([, passed]) => !passed)
                  .map(([check]) => check)
                  .join(", ") || "provider did not confirm the FDR"
              }.`
            : verified
              ? providerResult.message || "Bank verification successful."
              : `${providerResult.message || "Bank verification failed."} ${
                  Object.entries(checks)
                    .filter(([, passed]) => !passed)
                    .map(([check]) => check)
                    .join(", ") || "Provider did not confirm the FDR."
                }`
  };
}

module.exports = {
  createConfiguredMockBankProvider,
  mockBankVerificationProvider,
  verifyBankFdr
};
