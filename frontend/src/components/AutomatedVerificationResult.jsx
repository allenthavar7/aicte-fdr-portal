import "./AutomatedVerificationResult.css";

const fields = [
  ["fdrNumber", "FDR Number"],
  ["bankName", "Bank Name"],
  ["amount", "Amount"],
  ["issueDate", "Issue Date"],
  ["maturityDate", "Maturity Date"]
];

function getConfidence(value) {
  const confidence = value && typeof value === "object" ? value.overall : value;
  if (
    confidence === null ||
    confidence === undefined ||
    confidence === "" ||
    !Number.isFinite(Number(confidence))
  ) {
    return null;
  }
  const percentage = Number(confidence) <= 1
    ? Number(confidence) * 100
    : Number(confidence);
  return `${Math.round(percentage)}%`;
}

function formatFieldValue(field, value) {
  if (value === null || value === undefined || value === "") {
    return "Not available";
  }
  if (field === "amount" && Number.isFinite(Number(value))) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(Number(value));
  }
  return String(value);
}

function getOcrMessage(ocr, extracted) {
  const status = String(ocr?.status || "").toUpperCase();
  if (["FAILED", "ERROR"].includes(status)) {
    return "OCR verification could not be completed.";
  }
  if (status === "NOT_CONFIGURED" || status === "NOT_AVAILABLE") {
    return "OCR verification could not be completed.";
  }

  const requiredFieldsPresent = fields.every((([key]) =>
    extracted?.[key] !== null &&
    extracted?.[key] !== undefined &&
    extracted?.[key] !== ""
  ));
  if (!requiredFieldsPresent) {
    return "OCR could not extract all required FDR fields.";
  }
  if (status === "SUCCESS") {
    return "OCR extracted all required FDR fields.";
  }
  return "OCR extracted the required fields, but the result may need manual review.";
}

function getBankMessage(bank) {
  const status = String(bank?.status || "PENDING").toUpperCase();
  if (status === "VERIFIED") {
    return "Mock Bank Record Match: A matching configured bank record was found.";
  }
  if (status === "NOT_FOUND") {
    return "Mock Bank Record Match: No matching configured mock bank record was found; this is not a real bank lookup.";
  }
  if (status === "MISMATCH") {
    return "Mock Bank Record Match: A bank record was found but one or more submitted fields do not match.";
  }
  if (status === "PENDING") {
    return "Bank verification is pending.";
  }
  return `Mock Bank Record Match: Verification could not be completed. ${
    bank?.message || "The mock bank provider returned an error."
  }`;
}

function getResultClass(result) {
  if (result === "MATCH") return "match";
  if (result === "MISMATCH") return "mismatch";
  if (result === "NOT_DETECTED" || result === "MISSING") return "missing";
  return "not-checked";
}

export default function AutomatedVerificationResult({ verification }) {
  const ocr = verification?.ocr || {};
  const extracted = ocr.extracted || {};
  const comparisons = Array.isArray(verification?.comparisons)
    ? verification.comparisons
    : [];
  const bank = verification?.bank || {};
  const status = String(verification?.status || "PENDING").toUpperCase();
  const score = verification?.score !== null &&
    verification?.score !== undefined &&
    Number.isFinite(Number(verification.score))
    ? `${Number(verification.score)} / 100`
    : "Not available";
  const confidence = getConfidence(ocr.confidence);
  const provider = ocr.provider || "Not available";
  const bankStatus = String(bank.status || "PENDING").toUpperCase() === "FAILED"
    ? "ERROR"
    : String(bank.status || "PENDING").toUpperCase();

  return (
    <section className="automated-verification" aria-label="Automated Verification Result">
      <header className="automated-verification-header">
        <div>
          <h2>Automated Verification Result</h2>
          <p>Generated from the uploaded document and the details you submitted.</p>
        </div>
        <span className={`automated-result-status automated-status-${status.toLowerCase()}`}>
          {status}
        </span>
      </header>

      <div className="automated-verification-cards">
        <article className="automated-verification-card">
          <span>Verification Score</span>
          <strong>{score}</strong>
        </article>
        <article className="automated-verification-card">
          <span>OCR Confidence</span>
          <strong>{confidence || "Not available"}</strong>
        </article>
        <article className="automated-verification-card">
          <span>OCR Provider</span>
          <strong>{provider}</strong>
        </article>
        <article className="automated-verification-card">
          <span>Bank Verification <small>MOCK / DEMO</small></span>
          <strong>{bankStatus}</strong>
        </article>
      </div>

      <p className="automated-ocr-message" role="status">
        {getOcrMessage(ocr, extracted)}
      </p>
      <p className="automated-bank-message">
        <strong>Mock / demo bank verification:</strong> {getBankMessage(bank)}
      </p>
      <p className={`automated-verification-reason automated-reason-${status.toLowerCase()}`}>
        {verification?.message ||
          (status === "VERIFIED"
            ? "All automated verification checks passed."
            : "Some checks need review. See the field comparisons below.")}
      </p>

      <div className="automated-comparison-table-wrap">
        <table className="automated-comparison-table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Submitted</th>
              <th>Extracted by OCR</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {fields.map(([key, label]) => {
              const comparison = comparisons.find((item) => item.field === key);
              const result = comparison?.result || "NOT_CHECKED";
              const resultLabel = result === "NOT_DETECTED" ? "MISSING" : result;
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td>{formatFieldValue(key, comparison?.submittedValue)}</td>
                  <td>{formatFieldValue(key, comparison?.extractedValue)}</td>
                  <td>
                    <span className={`automated-field-result ${getResultClass(result)}`}>
                      {resultLabel.replaceAll("_", " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <details className="automated-ocr-text">
        <summary>View OCR text</summary>
        <pre>{ocr.rawText || "No OCR text is available for this submission."}</pre>
      </details>
    </section>
  );
}
