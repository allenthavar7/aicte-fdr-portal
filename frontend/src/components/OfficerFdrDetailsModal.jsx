import { useEffect } from "react";
import { FdrPrioritySummary } from "./FdrPriority";
import AutomatedVerificationResult from "./AutomatedVerificationResult";
import "./OfficerFdrDetailsModal.css";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
}

function formatAmount(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
      }).format(amount)
    : "—";
}

function Detail({ label, value }) {
  return (
    <div className="officer-fdr-detail">
      <span>{label}</span>
      <strong>{value === null || value === undefined || value === "" ? "—" : value}</strong>
    </div>
  );
}

export default function OfficerFdrDetailsModal({
  fdr,
  detail,
  loading,
  error,
  openingDocumentId,
  onClose,
  onOpenDocument
}) {
  const record = detail?.fdr || fdr;
  const verification = detail?.verification;
  const extracted = verification?.extracted_data || {};
  const automatedResult = verification ? {
    status: verification.result || record?.verification_status,
    score: verification.score,
    message: verification.review_reason,
    ocr: {
      status: extracted.ocrStatus || "NOT_AVAILABLE",
      provider: extracted.ocrProvider || verification.source || "Not available",
      confidence: verification.ocr_confidence,
      extracted,
      rawText: extracted.rawText || ""
    },
    bank: verification.bank_verification,
    comparisons: verification.comparisons || []
  } : null;

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  if (!fdr) return null;

  return (
    <div
      className="officer-fdr-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="officer-fdr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="officer-fdr-modal-title"
      >
        <header className="officer-fdr-modal-header">
          <div>
            <span>Verification Queue · FDR details</span>
            <h2 id="officer-fdr-modal-title">{record.fdr_number}</h2>
          </div>
          <button
            className="ow-button"
            type="button"
            aria-label="Close FDR details"
            onClick={onClose}
          >
            Close
          </button>
        </header>

        <div className="officer-fdr-modal-content">
          {error && <p className="ow-error" role="alert">{error}</p>}
          {loading && <p className="ow-subtle" role="status">Loading complete FDR details…</p>}

          <section className="officer-fdr-modal-section">
            <h3>FDR and institution</h3>
            <div className="officer-fdr-detail-grid">
              <Detail label="FDR number" value={record.fdr_number} />
              <Detail label="Institution" value={record.institution_name || record.institution?.name} />
              <Detail label="AICTE code" value={record.aicte_code || record.institution?.aicte_code} />
              <Detail label="Bank" value={record.bank_name} />
              <Detail label="Amount" value={formatAmount(record.amount)} />
              <Detail label="Issue date" value={formatDate(record.issue_date)} />
              <Detail label="Maturity date" value={formatDate(record.maturity_date)} />
              <Detail label="FDR status" value={record.status} />
              <Detail label="Verification status" value={record.verification_status} />
              <Detail label="Submitted" value={formatDate(record.created_at)} />
              <Detail label="Address" value={record.address || record.institution?.address} />
              <Detail label="City / State" value={[record.city || record.institution?.city, record.state || record.institution?.state].filter(Boolean).join(", ")} />
              <Detail label="Institution email" value={record.institution_email || record.institution?.email} />
              <Detail label="Application type" value={detail?.application?.application_type || record.application?.application_type} />
              <Detail label="Programme" value={detail?.application?.programme_name || record.application?.programme_name} />
            </div>
          </section>

          <FdrPrioritySummary priority={record.priority} fdr={record} />

          {automatedResult ? (
            <AutomatedVerificationResult verification={automatedResult} />
          ) : (
            <section className="officer-fdr-modal-section">
              <h3>Automated verification</h3>
              <p className="ow-subtle">No saved verification details are available for this FDR.</p>
            </section>
          )}

          <section className="officer-fdr-modal-section">
            <h3>Verification checks</h3>
            {verification?.checks?.length ? (
              <ul className="officer-fdr-check-list">
                {verification.checks.map((check, index) => (
                  <li key={`${check.key || check.label}-${index}`}>
                    <div>
                      <strong>{check.label || check.key}</strong>
                      <span>{check.explanation}</span>
                    </div>
                    <span className={`officer-fdr-check-status officer-fdr-check-${String(check.status).toLowerCase()}`}>
                      {String(check.status || "UNKNOWN").replaceAll("_", " ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="ow-subtle">No check-by-check results are available.</p>
            )}
          </section>

          <section className="officer-fdr-modal-section">
            <h3>Verification history</h3>
            {detail?.verifications?.length ? (
              <div className="officer-fdr-history-list">
                {detail.verifications.map((item) => (
                  <article key={item.id}>
                    <div>
                      <strong>{item.result || "Verification recorded"}</strong>
                      <span>{item.verification_source || "Source not recorded"} · {formatDate(item.verified_at)}</span>
                    </div>
                    <p>{item.message || "No review message recorded."}</p>
                  </article>
                ))}
              </div>
            ) : (
              <p className="ow-subtle">No verification history is available.</p>
            )}
          </section>

          <section className="officer-fdr-modal-section">
            <h3>Application details</h3>
            {detail?.application ? (
              <div className="officer-fdr-detail-grid">
                <Detail label="Application type" value={detail.application.application_type} />
                <Detail label="Programme" value={detail.application.programme_name} />
                <Detail label="Level" value={detail.application.programme_level} />
                <Detail label="Discipline" value={detail.application.discipline} />
                <Detail label="Current intake" value={detail.application.current_intake} />
                <Detail label="Proposed intake" value={detail.application.proposed_intake} />
                <Detail label="Academic year" value={detail.application.academic_year} />
                <Detail label="Application status" value={detail.application.status} />
                <Detail label="Description" value={detail.application.description} />
              </div>
            ) : (
              <p className="ow-subtle">No linked application details are available.</p>
            )}
          </section>

          <section className="officer-fdr-modal-section">
            <h3>Documents</h3>
            {detail?.documents?.length ? detail.documents.map((document) => (
              <div className="officer-fdr-document" key={document.id}>
                <div>
                  <strong>{document.file_name}</strong>
                  <span>{document.document_type || "FDR document"} · {formatDate(document.uploaded_at)}</span>
                </div>
                <button
                  className="ow-button"
                  type="button"
                  disabled={openingDocumentId === document.id}
                  onClick={() => onOpenDocument(record, document)}
                >
                  {openingDocumentId === document.id ? "Opening…" : "Open document"}
                </button>
              </div>
            )) : (
              <p className="ow-subtle">No document is attached to this FDR.</p>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
