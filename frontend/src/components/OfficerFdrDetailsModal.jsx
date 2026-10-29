import { useEffect, useState } from "react";
import { FdrPrioritySummary } from "./FdrPriority";
import AutomatedVerificationResult from "./AutomatedVerificationResult";
import { postOfficerFdrOverride } from "../services/api";
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
  onOpenDocument,
  onDecision
}) {
  const [localStatus, setLocalStatus] = useState(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastAction, setLastAction] = useState(null);
  const [decisionError, setDecisionError] = useState("");
  const [decisionSuccess, setDecisionSuccess] = useState("");

  const record = detail?.fdr || fdr;
  const verification = detail?.verification;
  const extracted = verification?.extracted_data || {};
  const automatedResult = verification ? {
    status: verification.result || record?.verification_status,
    score: verification.score,
    message: verification.review_reason,
    ocr: {
      status: extracted.ocrStatus || "NOT_AVAILABLE",
      provider: extracted.ocrProvider && extracted.ocrProvider !== "NOT_AVAILABLE"
        ? (extracted.ocrProvider.toUpperCase() === "TESSERACT.JS" ? "Tesseract.js" : extracted.ocrProvider)
        : "Tesseract.js",
      confidence: verification.ocr_confidence,
      extracted,
      rawText: extracted.rawText || ""
    },
    bank: verification.bank_verification,
    comparisons: verification.comparisons || []
  } : null;

  const currentVerificationStatus = localStatus || record?.verification_status;
  const decisionMessage = (() => {
    const status = String(currentVerificationStatus || "").toUpperCase();
    const checks = verification?.checks || [];
    const bankStatus = String(verification?.bank_verification?.status || "").toUpperCase();
    const hasFailedChecks = checks.some((c) => String(c.status).toUpperCase() === "FAILED");
    const hasDiscrepancy = ["FLAGGED", "FAILED"].includes(status) || hasFailedChecks || bankStatus === "FAILED" || bankStatus === "MISMATCH";

    if (status === "VERIFIED" && !hasDiscrepancy) {
      return "All required FDR details have been successfully verified.";
    }
    if (status === "REJECTED") {
      return "This FDR has been rejected. You may review the discrepancies before recording a new decision.";
    }
    if (hasDiscrepancy) {
      return "Some FDR details could not be matched. Please review the discrepancies before approving this FDR.";
    }
    return "All FDR details could not be fully matched. Please review the submitted document and verification results before making a decision.";
  })();

  const decisionMessageClass = (() => {
    const status = String(currentVerificationStatus || "").toUpperCase();
    const checks = verification?.checks || [];
    const bankStatus = String(verification?.bank_verification?.status || "").toUpperCase();
    const hasFailedChecks = checks.some((c) => String(c.status).toUpperCase() === "FAILED");
    const hasDiscrepancy = ["FLAGGED", "FAILED"].includes(status) || hasFailedChecks || bankStatus === "FAILED" || bankStatus === "MISMATCH";
    if (status === "VERIFIED" && !hasDiscrepancy) return "verified";
    if (status === "REJECTED") return "rejected";
    if (hasDiscrepancy) return "flagged";
    return "pending";
  })();

  async function handleDecisionClick(decision) {
    const finalReason =
      decisionReason.trim() ||
      (decision === "APPROVE"
        ? "Approved by regulatory officer verification"
        : "Rejected by regulatory officer verification");
    setBusy(true);
    setLastAction(decision);
    setDecisionError("");
    setDecisionSuccess("");
    try {
      if (onDecision) {
        await onDecision(record.id, decision, finalReason);
      } else {
        const token = localStorage.getItem("token");
        await postOfficerFdrOverride(token, record.id, decision, finalReason);
      }
      const newStatus = decision === "APPROVE" ? "VERIFIED" : "REJECTED";
      setLocalStatus(newStatus);
      setDecisionSuccess(`FDR ${decision === "APPROVE" ? "Approved" : "Rejected"} successfully. Record updated.`);
      setDecisionReason("");
    } catch (err) {
      setDecisionError(err.message || "Unable to record officer decision.");
    } finally {
      setBusy(false);
    }
  }

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
              <Detail label="Verification status" value={currentVerificationStatus} />
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

          {/* Decision Section */}
          <section className="officer-fdr-modal-section officer-fdr-decision-card">
            <div className="officer-decision-header">
              <span className="officer-decision-badge">Final Review & Action</span>
              <h3>Officer Verification Decision</h3>
            </div>
            <p className="officer-decision-sub">
              Review all extracted values, documents, and checks above before making a final determination.
            </p>

            <div className={`officer-decision-message officer-decision-${decisionMessageClass}`}>
              <span className="officer-decision-icon" aria-hidden="true">
                {decisionMessageClass === "verified" ? "✓" : decisionMessageClass === "rejected" ? "✕" : "⚠"}
              </span>
              <div>
                <strong>
                  {decisionMessageClass === "verified"
                    ? "Verification Cleared"
                    : decisionMessageClass === "rejected"
                    ? "Verification Rejected"
                    : "Review Discrepancies"}
                </strong>
                <p>{decisionMessage}</p>
              </div>
            </div>

            <div className="officer-decision-reason-box">
              <label htmlFor="fdr-modal-decision-notes">
                Decision Remark / Audit Notes (optional):
              </label>
              <textarea
                id="fdr-modal-decision-notes"
                className="officer-decision-textarea"
                placeholder="Enter audit notes or rationale for officer decision..."
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                disabled={busy}
                rows={2}
              />
            </div>

            {decisionError && (
              <div className="ow-error" role="alert" style={{ marginBottom: 12 }}>
                {decisionError}
              </div>
            )}

            {decisionSuccess && (
              <div
                className="ow-success"
                role="status"
                style={{
                  marginBottom: 12,
                  padding: "10px 14px",
                  background: "#ecfdf5",
                  border: "1px solid #a7f3d0",
                  borderRadius: 6,
                  fontWeight: 600
                }}
              >
                {decisionSuccess}
              </div>
            )}

            <div className="officer-decision-actions">
              <button
                type="button"
                className="officer-decision-btn officer-btn-approve"
                disabled={busy || currentVerificationStatus === "VERIFIED"}
                onClick={() => handleDecisionClick("APPROVE")}
              >
                ✓ Approve FDR
              </button>
              <button
                type="button"
                className="officer-decision-btn officer-btn-reject"
                disabled={busy || currentVerificationStatus === "REJECTED"}
                onClick={() => handleDecisionClick("REJECT")}
              >
                ✕ Reject FDR
              </button>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
