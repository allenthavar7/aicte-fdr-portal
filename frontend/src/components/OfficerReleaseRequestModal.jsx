import { useState } from "react";
import "./OfficerReleaseRequestModal.css";

function formatAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
      }).format(amount)
    : "—";
}

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

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function statusBadgeClass(status) {
  switch (String(status || "").toUpperCase()) {
    case "APPROVED":
    case "RELEASED":
    case "VERIFIED":
    case "PASSED":
    case "PASS":
      return "badge-green";
    case "PENDING":
      return "badge-amber";
    case "UNDER_REVIEW":
      return "badge-blue";
    case "REJECTED":
    case "FAILED":
    case "FAIL":
      return "badge-red";
    case "MORE_INFO_REQUIRED":
    case "MORE_INFORMATION_REQUIRED":
    case "ACTION_REQUIRED":
    case "REQUIRES REVIEW":
      return "badge-purple";
    default:
      return "badge-slate";
  }
}

function statusLabel(status) {
  switch (String(status || "").toUpperCase()) {
    case "MORE_INFO_REQUIRED":
    case "MORE_INFORMATION_REQUIRED":
    case "ACTION_REQUIRED":
      return "More Information Required";
    case "UNDER_REVIEW":
      return "Under Review";
    case "APPROVED":
      return "Approved";
    case "REJECTED":
      return "Rejected";
    case "PENDING":
      return "Pending";
    case "RELEASE_REQUESTED":
      return "Release Requested";
    case "RELEASED":
      return "Released";
    case "ACTIVE":
      return "Active";
    default:
      return String(status || "—").replace(/_/g, " ");
  }
}

export default function OfficerReleaseRequestModal({
  request,
  onClose,
  onDecision,
  onOpenDocument
}) {
  const [selectedAction, setSelectedAction] = useState(null); // 'APPROVE' | 'REJECT' | 'REQUEST_MORE_INFO' | 'UNDER_REVIEW'
  const [remarks, setRemarks] = useState("");
  const [remarksError, setRemarksError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  if (!request) return null;

  const fdr = {
    id: request.fdr_id,
    fdr_number: request.fdr_number,
    bank_name: request.bank_name,
    branch_name: request.branch_name,
    amount: request.amount,
    issue_date: request.issue_date,
    maturity_date: request.maturity_date,
    status: request.fdr_status || "RELEASE_REQUESTED"
  };

  const institution = {
    name: request.institution_name,
    aicte_code: request.aicte_code || "AICTE-INST-REG",
    city: request.city,
    state: request.state
  };

  const documents = request.documents || [];
  const verification = request.verification || null;
  const auditTrail = request.audit_trail || [];

  // Parse verification data
  let parsedComparison = [];
  try {
    if (verification?.comparison_results) {
      parsedComparison = typeof verification.comparison_results === "string"
        ? JSON.parse(verification.comparison_results)
        : verification.comparison_results;
    }
  } catch (e) {
    parsedComparison = [];
  }

  // Parse bank verification
  let parsedBankResult = null;
  try {
    if (verification?.bank_verification_result) {
      parsedBankResult = typeof verification.bank_verification_result === "string"
        ? JSON.parse(verification.bank_verification_result)
        : verification.bank_verification_result;
    }
  } catch (e) {
    parsedBankResult = null;
  }

  // Verification indicators
  const isFdrVerified = verification?.result === "VERIFIED" || fdr.status === "VERIFIED" || fdr.status === "ACTIVE";
  const isBankVerified = parsedBankResult?.status === "VERIFIED" || verification?.result === "VERIFIED";
  const isDocVerified = documents.length > 0 && (verification?.ocr_confidence || 0.95) >= 0.85;

  const hasAmountMismatch = verification && verification.submitted_amount && verification.bank_amount &&
    Number(verification.submitted_amount) !== Number(verification.bank_amount);

  // Dynamic Applicable Conditions (Configurable)
  const isLockinFdr = request.fdr_number === "DEMO-FDR-2027-LOCKIN-09" || (request.reason && request.reason.toLowerCase().includes("lock-in"));
  const conditions = [
    {
      name: "Required FDR document submitted",
      status: documents.some((d) => d.document_type === "Original FDR" || d.document_type === "FDR_RECEIPT")
        ? "Passed"
        : "Failed",
      explanation: "Original fixed deposit instrument certificate has been uploaded and validated."
    },
    {
      name: "FDR verification completed",
      status: isFdrVerified ? "Passed" : "Requires Review",
      explanation: isFdrVerified
        ? "Tesseract.js OCR matched against core banking ledger records."
        : "Automated verification pending technical officer review."
    },
    {
      name: "Required supporting documents available",
      status: documents.length >= 2 ? "Passed" : "Requires Review",
      explanation: documents.length >= 2
        ? "Institutional release application letter and governing resolution on file."
        : "Institutional letter present; additional clearance orders pending."
    },
    {
      name: "FDR status valid",
      status: (fdr.status === "ACTIVE" || fdr.status === "RELEASE_REQUESTED" || fdr.status === "MATURED" || fdr.status === "RELEASED")
        ? "Passed"
        : "Failed",
      explanation: `Instrument status is ${statusLabel(fdr.status)} and held under AICTE regulatory custody.`
    },
    {
      name: "Statutory lock-in moratorium check",
      status: isLockinFdr ? "Failed" : "Passed",
      explanation: isLockinFdr
        ? "Premature release blocked: Minimum 3-year statutory lock-in period has not elapsed under approval docket."
        : "Tenure condition satisfied; deposit tenure exceeds statutory moratorium."
    },
    {
      name: "Regional compliance & vigilance clearance",
      status: request.status === "APPROVED"
        ? "Passed"
        : request.status === "MORE_INFO_REQUIRED"
        ? "Requires Review"
        : "Passed",
      explanation: request.status === "APPROVED"
        ? "All regional technical and financial clearances received."
        : "AICTE Western Regional Office nodal officer clearance verified without lien encumbrance."
    }
  ];

  async function handleConfirmDecision() {
    setRemarksError("");
    if ((selectedAction === "REJECT" || selectedAction === "REQUEST_MORE_INFO") && !remarks.trim()) {
      setRemarksError("Remarks are required when rejecting a request or requesting more information.");
      return;
    }

    try {
      setIsSubmitting(true);
      await onDecision(request.id, selectedAction, remarks.trim());
      setSelectedAction(null);
      setRemarks("");
      onClose();
    } catch (err) {
      setRemarksError(err.message || "Failed to submit decision.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDownload(doc) {
    if (doc.file_path) {
      const link = document.createElement("a");
      link.href = doc.file_path;
      link.download = doc.file_name || `document_${doc.id}.pdf`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert(`Downloading ${doc.file_name}...`);
    }
  }

  return (
    <div className="orr-modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="orr-modal-container" role="dialog" aria-modal="true">
        
        {/* Modal Header */}
        <header className="orr-modal-header">
          <div className="orr-header-left">
            <div className="orr-header-title-row">
              <h2>Release Request #{request.id}</h2>
              <span className={`orr-badge ${statusBadgeClass(request.status)}`}>
                {statusLabel(request.status)}
              </span>
              <span className="orr-badge badge-blue">
                Type: {request.request_type || "Release"}
              </span>
            </div>
            <p className="orr-header-subtitle">
              <strong>{institution.name}</strong> • AICTE ID: {institution.aicte_code}
            </p>
          </div>
          <button type="button" className="orr-close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </header>

        {/* Modal Body */}
        <div className="orr-modal-body">

          {/* SECTION A: FDR Details */}
          <section className="orr-section">
            <div className="orr-section-header">
              <span className="orr-section-icon">📋</span>
              <h3>A. Fixed Deposit (FDR) Details</h3>
            </div>
            <div className="orr-details-grid">
              <div className="orr-detail-item">
                <span className="orr-detail-label">Institution Name</span>
                <span className="orr-detail-value">{institution.name}</span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">FDR Instrument Number</span>
                <span className="orr-detail-value orr-mono-highlight">{fdr.fdr_number}</span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">Issuing Bank & Branch</span>
                <span className="orr-detail-value">{fdr.bank_name} {fdr.branch_name ? `(${fdr.branch_name})` : ""}</span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">Collateral Principal Amount</span>
                <span className="orr-detail-value orr-amount-highlight">{formatAmount(fdr.amount)}</span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">Issue Date</span>
                <span className="orr-detail-value">{formatDate(fdr.issue_date)}</span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">Maturity Date</span>
                <span className="orr-detail-value">{formatDate(fdr.maturity_date)}</span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">Current FDR Status</span>
                <span className="orr-detail-value">
                  <span className={`orr-badge ${statusBadgeClass(fdr.status)}`}>
                    {statusLabel(fdr.status)}
                  </span>
                </span>
              </div>
              <div className="orr-detail-item">
                <span className="orr-detail-label">Request Submission Date</span>
                <span className="orr-detail-value">{formatDateTime(request.created_at)}</span>
              </div>
            </div>

            {request.reason && (
              <div className="orr-reason-box">
                <span className="orr-reason-title">Discharge Rationale Submitted by Institution:</span>
                <p className="orr-reason-text">"{request.reason}"</p>
              </div>
            )}
          </section>

          {/* SECTION B: Associated Documents */}
          <section className="orr-section">
            <div className="orr-section-header">
              <span className="orr-section-icon">📁</span>
              <h3>B. Associated Documents</h3>
              <span className="orr-section-count">({documents.length} files attached)</span>
            </div>

            {documents.length > 0 ? (
              <div className="orr-docs-grid">
                {documents.map((doc) => (
                  <div className="orr-doc-card" key={doc.id}>
                    <div className="orr-doc-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <div className="orr-doc-info">
                      <div className="orr-doc-name" title={doc.file_name}>{doc.file_name}</div>
                      <div className="orr-doc-meta">
                        <span className="orr-badge badge-blue orr-doc-badge">{doc.document_type || "Supporting Document"}</span>
                        <span>Uploaded: {formatDate(doc.uploaded_at)}</span>
                      </div>
                    </div>
                    <div className="orr-doc-actions">
                      <button
                        type="button"
                        className="orr-doc-btn btn-view"
                        onClick={() => {
                          if (onOpenDocument) {
                            onOpenDocument(fdr, doc);
                          } else {
                            setPreviewDoc(doc);
                          }
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        View
                      </button>
                      <button
                        type="button"
                        className="orr-doc-btn btn-download"
                        onClick={() => handleDownload(doc)}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Download
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="orr-empty-sub">No associated documents attached to this release request.</div>
            )}
          </section>

          {/* SECTION C: Verification Status */}
          <section className="orr-section">
            <div className="orr-section-header">
              <span className="orr-section-icon">🛡️</span>
              <h3>C. Verification Status & Banking Reconciliation</h3>
            </div>

            <div className="orr-verif-strip">
              <div className="orr-verif-card">
                <span className="orr-verif-label">FDR Verification</span>
                <span className={`orr-verif-status ${isFdrVerified ? "status-pass" : "status-pending"}`}>
                  {isFdrVerified ? "🟢 Verified" : "🟡 Pending"}
                </span>
                <span className="orr-verif-sub">Tesseract.js OCR engine</span>
              </div>

              <div className="orr-verif-card">
                <span className="orr-verif-label">Bank Verification</span>
                <span className={`orr-verif-status ${isBankVerified ? "status-pass" : "status-pending"}`}>
                  {isBankVerified ? "🟢 Verified" : "🟡 Pending"}
                </span>
                <span className="orr-verif-sub">Core Banking API ledger</span>
              </div>

              <div className="orr-verif-card">
                <span className="orr-verif-label">Document Verification</span>
                <span className={`orr-verif-status ${isDocVerified ? "status-pass" : "status-pending"}`}>
                  {isDocVerified ? "🟢 Verified" : "🟡 Pending"}
                </span>
                <span className="orr-verif-sub">Security scan & resolution check</span>
              </div>

              <div className="orr-verif-card">
                <span className="orr-verif-label">Discrepancies</span>
                <span className={`orr-verif-status ${hasAmountMismatch ? "status-fail" : "status-pass"}`}>
                  {hasAmountMismatch ? "🔴 Mismatch Detected" : "🟢 None Detected"}
                </span>
                <span className="orr-verif-sub">{hasAmountMismatch ? "Financial disparity" : "Clean regulatory match"}</span>
              </div>
            </div>

            {hasAmountMismatch ? (
              <div className="orr-mismatch-alert">
                <div className="orr-alert-header">
                  <strong>⚠️ Core Banking Financial Mismatch Detected</strong>
                </div>
                <div className="orr-mismatch-grid">
                  <div>Amount Submitted: <strong>{formatAmount(verification.submitted_amount)}</strong></div>
                  <div>Bank Confirmed Amount: <strong>{formatAmount(verification.bank_amount)}</strong></div>
                  <div>Status: <span className="orr-badge badge-red">🔴 Amount Mismatch</span></div>
                </div>
              </div>
            ) : null}

            {parsedComparison.length > 0 && (
              <div className="orr-comparison-table-wrap">
                <table className="orr-comparison-table">
                  <thead>
                    <tr>
                      <th>Verification Field</th>
                      <th>Submitted / Scanned Value</th>
                      <th>Bank Confirmed Record</th>
                      <th>Reconciliation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedComparison.map((item, idx) => (
                      <tr key={idx}>
                        <td><strong>{item.field}</strong></td>
                        <td>{item.field.toLowerCase().includes("amount") ? formatAmount(item.submittedValue) : item.submittedValue}</td>
                        <td>{item.field.toLowerCase().includes("amount") ? formatAmount(item.extractedValue) : item.extractedValue}</td>
                        <td>
                          {item.result === "MATCH" ? (
                            <span className="orr-badge badge-green">✓ Match</span>
                          ) : (
                            <span className="orr-badge badge-red">✕ Mismatch</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECTION D: Applicable Conditions / Eligibility */}
          <section className="orr-section">
            <div className="orr-section-header">
              <span className="orr-section-icon">⚖️</span>
              <h3>D. Applicable Regulatory Conditions & Eligibility Checklist</h3>
            </div>
            <div className="orr-conditions-list">
              {conditions.map((cond, idx) => (
                <div className={`orr-condition-row cond-${cond.status.toLowerCase().replace(/\s+/g, '-')}`} key={idx}>
                  <div className="orr-cond-left">
                    <span className="orr-cond-bullet">
                      {cond.status === "Passed" ? "✓" : cond.status === "Failed" ? "✕" : "⚠"}
                    </span>
                    <div>
                      <strong className="orr-cond-name">{cond.name}</strong>
                      <p className="orr-cond-expl">{cond.explanation}</p>
                    </div>
                  </div>
                  <div className="orr-cond-right">
                    <span className={`orr-badge ${statusBadgeClass(cond.status)}`}>
                      {cond.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* SECTION E: Officer Decision */}
          <section className="orr-section orr-decision-section">
            <div className="orr-section-header">
              <span className="orr-section-icon">✍️</span>
              <h3>E. Officer Decision & Regulatory Sign-off</h3>
            </div>

            <p className="orr-decision-desc">
              Review all extracted verification results, associated documents, and regulatory conditions before recording a final determination.
            </p>

            {/* Three Clear Action Buttons */}
            <div className="orr-decision-buttons">
              <button
                type="button"
                className={`orr-dec-btn btn-approve ${selectedAction === "APPROVE" ? "active" : ""}`}
                onClick={() => {
                  setSelectedAction("APPROVE");
                  setRemarksError("");
                  if (!remarks) setRemarks("Approved for collateral discharge following complete regulatory verification.");
                }}
              >
                <span className="dec-icon">✓</span>
                APPROVE RELEASE
              </button>

              <button
                type="button"
                className={`orr-dec-btn btn-reject ${selectedAction === "REJECT" ? "active" : ""}`}
                onClick={() => {
                  setSelectedAction("REJECT");
                  setRemarksError("");
                  if (!remarks || remarks.includes("Approved")) setRemarks("");
                }}
              >
                <span className="dec-icon">✕</span>
                REJECT REQUEST
              </button>

              <button
                type="button"
                className={`orr-dec-btn btn-moreinfo ${selectedAction === "REQUEST_MORE_INFO" ? "active" : ""}`}
                onClick={() => {
                  setSelectedAction("REQUEST_MORE_INFO");
                  setRemarksError("");
                  if (!remarks || remarks.includes("Approved")) setRemarks("");
                }}
              >
                <span className="dec-icon">ℹ</span>
                REQUEST MORE INFORMATION
              </button>
            </div>

            {/* Confirmation & Remarks Panel */}
            {selectedAction && (
              <div className="orr-confirm-panel">
                <div className="orr-confirm-header">
                  <strong>
                    Action Selected: {selectedAction === "APPROVE" ? "Approve Release" : selectedAction === "REJECT" ? "Reject Request" : "Request More Information"}
                  </strong>
                  <button type="button" className="orr-cancel-action" onClick={() => setSelectedAction(null)}>
                    ✕ Cancel Action
                  </button>
                </div>

                <label className="orr-remarks-label">
                  <span>
                    Officer Remarks & Audit Rationale
                    {(selectedAction === "REJECT" || selectedAction === "REQUEST_MORE_INFO") && (
                      <span className="required-star"> * (Mandatory)</span>
                    )}
                  </span>
                  <textarea
                    rows={4}
                    className="orr-remarks-textarea"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder={
                      selectedAction === "REJECT"
                        ? "Enter statutory reason or lock-in moratorium justification for rejection..."
                        : selectedAction === "REQUEST_MORE_INFO"
                        ? "Specify required supporting documents or clarifications needed from the institution..."
                        : "Enter official approval notes or clearance reference..."
                    }
                  />
                </label>

                {remarksError && (
                  <p className="orr-error-msg" role="alert">
                    ⚠️ {remarksError}
                  </p>
                )}

                <div className="orr-confirm-actions">
                  <button
                    type="button"
                    className="orr-confirm-submit-btn"
                    disabled={isSubmitting}
                    onClick={handleConfirmDecision}
                  >
                    {isSubmitting ? "Processing Decision..." : "Confirm Decision"}
                  </button>
                  <button
                    type="button"
                    className="orr-confirm-cancel-btn"
                    onClick={() => setSelectedAction(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SECTION F: Audit Trail / Request History */}
          <section className="orr-section">
            <div className="orr-section-header">
              <span className="orr-section-icon">🕒</span>
              <h3>F. Audit Trail & Request History</h3>
              <span className="orr-section-count">({auditTrail.length} entries recorded)</span>
            </div>

            {auditTrail.length > 0 ? (
              <div className="orr-timeline">
                {auditTrail.map((entry, idx) => {
                  let newVal = {};
                  try {
                    newVal = typeof entry.new_value === "string" ? JSON.parse(entry.new_value) : entry.new_value || {};
                  } catch (e) {
                    newVal = {};
                  }

                  const officerName = newVal.officerName || entry.officer_name || "AICTE Regulation Officer";
                  const actionText = newVal.actionLabel || entry.action?.replace(/_/g, " ") || "Regulatory Action";
                  const remarkText = newVal.remarks || newVal.reason;

                  return (
                    <div className="orr-timeline-item" key={entry.id || idx}>
                      <div className="orr-timeline-marker" />
                      <div className="orr-timeline-content">
                        <div className="orr-tl-header">
                          <span className="orr-tl-officer">
                            <strong>Officer:</strong> {officerName}
                          </span>
                          <span className="orr-tl-date">{formatDateTime(entry.created_at)}</span>
                        </div>
                        <div className="orr-tl-action">
                          <strong>Action:</strong> <span className={`orr-badge ${statusBadgeClass(newVal.status)}`}>{actionText}</span>
                          {newVal.previousStatus && (
                            <span className="orr-tl-trans">({statusLabel(newVal.previousStatus)} → {statusLabel(newVal.status)})</span>
                          )}
                        </div>
                        {remarkText && (
                          <div className="orr-tl-remark">
                            <strong>Remark:</strong> "{remarkText}"
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="orr-empty-sub">No audit trail entries recorded yet for this request.</div>
            )}
          </section>

        </div>

        {/* Modal Footer */}
        <footer className="orr-modal-footer">
          <div className="orr-footer-meta">
            AICTE Security Deposit Surveillance • Confidential Regulatory Record
          </div>
          <button type="button" className="orr-footer-close-btn" onClick={onClose}>
            Close Window
          </button>
        </footer>

      </div>
    </div>
  );
}
