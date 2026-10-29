import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import InstitutionLayout from "../components/InstitutionLayout";
import {
  getEligibleInstitutionRenewalFdrs,
  getInstitutionFdrDocument,
  getInstitutionRenewal,
  getInstitutionRenewals,
  submitInstitutionRenewal
} from "../api/api";
import { getDaysRemaining } from "../utils/officerAnalytics";
import "./InstitutionWorkspace.css";

function formatDate(value) {
  if (!value) return "—";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
      });
}

function formatAmount(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function StatusBadge({ status }) {
  const norm = String(status || "").toUpperCase();
  let badgeClass = "ow-badge-info";
  let dotColor = "#64748b";

  if (["APPROVED", "COMPLETED", "VERIFIED", "ACTIVE", "ELIGIBLE"].includes(norm)) {
    badgeClass = "ow-badge-success";
    dotColor = "#16a34a";
  } else if (["PENDING", "UNDER_REVIEW", "EXPIRING SOON", "RENEWAL_REQUESTED"].includes(norm)) {
    badgeClass = "ow-badge-warning";
    dotColor = "#d97706";
  } else if (["REJECTED", "ACTION_REQUIRED", "OVERDUE", "FAILED"].includes(norm)) {
    badgeClass = "ow-badge-danger";
    dotColor = "#dc2626";
  } else if (["SUBMITTED", "NEW"].includes(norm)) {
    badgeClass = "ow-badge-blue";
    dotColor = "#0284c7";
  }

  return (
    <span className={`ow-status-badge ${badgeClass}`}>
      <span className="ow-status-dot" style={{ backgroundColor: dotColor }} />
      {String(status || "—").replace(/_/g, " ")}
    </span>
  );
}

function TenorCell({ maturityDate }) {
  const days = getDaysRemaining(maturityDate);
  let badgeClass = "ow-tenor-normal";
  let subtext = "";

  if (days !== null) {
    if (days < 0) {
      badgeClass = "ow-tenor-critical";
      subtext = `${Math.abs(days)}d Overdue`;
    } else if (days <= 30) {
      badgeClass = "ow-tenor-critical";
      subtext = `${days}d Left (Urgent)`;
    } else if (days <= 90) {
      badgeClass = "ow-tenor-warning";
      subtext = `${days}d Remaining`;
    } else {
      badgeClass = "ow-tenor-normal";
      subtext = `${days}d Remaining`;
    }
  }

  return (
    <div className={`ow-tenor-cell ${badgeClass}`}>
      <span className="ow-tenor-date">{formatDate(maturityDate)}</span>
      {subtext && <span className="ow-tenor-sub">{subtext}</span>}
    </div>
  );
}

export default function Renewals() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [renewals, setRenewals] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    pending: 0,
    under_review: 0,
    approved: 0,
    action_required: 0
  });
  const [eligibleFdrs, setEligibleFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showApply, setShowApply] = useState(false);
  const [selectedFdrId, setSelectedFdrId] = useState("");
  const [requestedMaturityDate, setRequestedMaturityDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedRenewal, setSelectedRenewal] = useState(null);
  const [documentError, setDocumentError] = useState("");
  const [notificationRefreshKey, setNotificationRefreshKey] = useState(0);

  const loadRenewals = useCallback(async () => {
    setLoading(true);
    setError("");
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    try {
      const [renewalResult, eligibleResult] = await Promise.all([
        getInstitutionRenewals(token),
        getEligibleInstitutionRenewalFdrs(token)
      ]);
      setRenewals(renewalResult.renewals || []);
      setSummary(renewalResult.summary || {});
      setEligibleFdrs(eligibleResult.fdrs || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load renewals. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    Promise.resolve().then(loadRenewals);
  }, [loadRenewals]);

  const selectedFdr = eligibleFdrs.find(
    (fdr) => String(fdr.id) === String(selectedFdrId)
  );

  function startRenewalRequest() {
    setError("");
    setSuccess("");
    setSelectedFdrId("");
    setRequestedMaturityDate("");
    setReason("");
    setShowApply(true);
  }

  async function submitRequest(event) {
    event.preventDefault();
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await submitInstitutionRenewal(token, {
        fdrId: Number(selectedFdrId),
        requestedMaturityDate,
        reason: reason.trim()
      });
      setShowApply(false);
      setSuccess("Renewal request submitted successfully.");
      setNotificationRefreshKey((value) => value + 1);
      await loadRenewals();
    } catch (submitError) {
      setError(submitError.message || "Unable to submit renewal request.");
    } finally {
      setSubmitting(false);
    }
  }

  const openRenewal = useCallback(async (renewalId) => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setError("");
    try {
      const detail = await getInstitutionRenewal(token, renewalId);
      setSelectedRenewal(detail);
      setSearchParams({ renewal: String(renewalId) });
    } catch (loadError) {
      setError(loadError.message || "Unable to load renewal details.");
    }
  }, [navigate, setSearchParams]);

  useEffect(() => {
    const renewalId = Number(searchParams.get("renewal"));
    if (!renewalId || selectedRenewal?.renewal?.renewal_id === renewalId) return;
    Promise.resolve().then(() => openRenewal(renewalId));
  }, [searchParams, selectedRenewal, openRenewal]);

  async function openDocument(fdrId, document) {
    const documentWindow = window.open("", "_blank");
    if (!documentWindow) {
      setDocumentError("Allow pop-ups to open the uploaded FDR document.");
      return;
    }
    setDocumentError("");
    try {
      const token = localStorage.getItem("token");
      const file = await getInstitutionFdrDocument(token, fdrId, document.id);
      documentWindow.location.href = URL.createObjectURL(file);
    } catch (openError) {
      documentWindow.close();
      setDocumentError(openError.message || "Unable to open the FDR document.");
    }
  }

  const selectedDetail = selectedRenewal;

  return (
    <InstitutionLayout
      active="renewals"
      notificationRefreshKey={notificationRefreshKey}
    >
      <section className="dashboard-content" style={{ padding: "28px" }}>
        {/* HERO BANNER */}
        <div className="ow-hero-header" style={{ marginBottom: "22px" }}>
          <div className="ow-hero-text">
            <span className="ow-hero-pill">
              <span className="ow-pill-dot" /> Maturity & Renewal Management
            </span>
            <h1 style={{ fontSize: "22px", margin: "6px 0 4px 0", color: "#ffffff", fontWeight: 700 }}>
              FDR Renewals & Tenor Tracking
            </h1>
            <p style={{ margin: 0, color: "#bae6fd", fontSize: "13px" }}>
              Monitor approaching maturity deadlines, check instrument eligibility, and lodge timely renewal applications.
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", zIndex: 1 }}>
            <button
              type="button"
              className="ow-button"
              onClick={loadRenewals}
              style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
            >
              ↻ Refresh
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={startRenewalRequest}
              style={{ whiteSpace: "nowrap" }}
            >
              + Apply for Renewal
            </button>
          </div>
        </div>

        {/* ALERTS */}
        {error && (
          <div
            style={{
              padding: "14px 18px",
              marginBottom: "20px",
              background: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              fontSize: "13.5px"
            }}
          >
            ⚠ {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: "14px 18px",
              marginBottom: "20px",
              background: "#dcfce7",
              color: "#166534",
              border: "1px solid #bbf7d0",
              borderRadius: "8px",
              fontSize: "13.5px"
            }}
          >
            ✓ {success}
          </div>
        )}

        {/* 5 SUMMARY KPI CARDS */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "16px",
            marginBottom: "24px"
          }}
        >
          <div className="ow-kpi-card kpi-navy">
            <div className="ow-kpi-content">
              <span className="ow-kpi-label">Total Renewals</span>
              <div className="ow-kpi-value">{summary.total || 0}</div>
              <span className="ow-kpi-sub">Total requests logged</span>
            </div>
            <div className="ow-kpi-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            </div>
          </div>

          <div className="ow-kpi-card kpi-orange">
            <div className="ow-kpi-content">
              <span className="ow-kpi-label">Pending</span>
              <div className="ow-kpi-value">{summary.pending || 0}</div>
              <span className="ow-kpi-sub">Awaiting officer review</span>
            </div>
            <div className="ow-kpi-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>

          <div className="ow-kpi-card kpi-blue">
            <div className="ow-kpi-content">
              <span className="ow-kpi-label">Under Review</span>
              <div className="ow-kpi-value">{summary.under_review || 0}</div>
              <span className="ow-kpi-sub">Under active scrutiny</span>
            </div>
            <div className="ow-kpi-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
          </div>

          <div className="ow-kpi-card kpi-green">
            <div className="ow-kpi-content">
              <span className="ow-kpi-label">Approved</span>
              <div className="ow-kpi-value">{summary.approved || 0}</div>
              <span className="ow-kpi-sub">Cleared & extended</span>
            </div>
            <div className="ow-kpi-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>

          <div className="ow-kpi-card kpi-red">
            <div className="ow-kpi-content">
              <span className="ow-kpi-label">Action Required</span>
              <div className="ow-kpi-value">{summary.action_required || 0}</div>
              <span className="ow-kpi-sub">Clarifications needed</span>
            </div>
            <div className="ow-kpi-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
        </div>

        {/* SECTION 1: RENEWAL REQUESTS */}
        <div className="ow-table-card" style={{ marginBottom: "26px" }}>
          <div
            style={{
              padding: "18px 24px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "#fafcff",
              borderBottom: "1px solid #f1f5f9"
            }}
          >
            <div>
              <h3 style={{ margin: "0 0 3px 0", fontSize: "16px", color: "#002b5c", fontWeight: 700 }}>
                Submitted Renewal Requests
              </h3>
              <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>
                {renewals.length} renewal request{renewals.length !== 1 ? "s" : ""} on record.
              </p>
            </div>
            <button type="button" className="ow-button" onClick={loadRenewals}>
              ↻ Refresh List
            </button>
          </div>

          <div className="ow-table-responsive">
            {loading ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                Loading renewal records...
              </div>
            ) : renewals.length === 0 ? (
              <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                No renewal requests have been submitted yet.
              </div>
            ) : (
              <table className="ow-table-modern">
                <thead>
                  <tr>
                    <th>Request ID</th>
                    <th>FDR Number</th>
                    <th>Issuing Bank</th>
                    <th>Deposit Amount</th>
                    <th>Current Maturity</th>
                    <th>Request Date</th>
                    <th>Renewal Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {renewals.map((renewal) => (
                    <tr key={renewal.renewal_id}>
                      <td><strong>#{renewal.renewal_id}</strong></td>
                      <td>
                        <strong className="ow-link">{renewal.fdr_number}</strong>
                      </td>
                      <td>{renewal.bank_name}</td>
                      <td><strong style={{ color: "#002b5c" }}>{formatAmount(renewal.amount)}</strong></td>
                      <td><TenorCell maturityDate={renewal.maturity_date} /></td>
                      <td>{formatDate(renewal.request_date)}</td>
                      <td><StatusBadge status={renewal.renewal_status} /></td>
                      <td>
                        <button
                          type="button"
                          className="ow-action-view-btn"
                          onClick={() => openRenewal(renewal.renewal_id)}
                        >
                          View Details →
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* SECTION 2: FDR RENEWAL ELIGIBILITY */}
        <div className="ow-table-card">
          <div
            style={{
              padding: "18px 24px",
              background: "#fafcff",
              borderBottom: "1px solid #f1f5f9"
            }}
          >
            <h3 style={{ margin: "0 0 3px 0", fontSize: "16px", color: "#002b5c", fontWeight: 700 }}>
              FDR Renewal Eligibility Schedule
            </h3>
            <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>
              Fixed Deposit Receipts approaching maturity (within 90 calendar days) are eligible for statutory renewal.
            </p>
          </div>

          <div className="ow-table-responsive">
            <table className="ow-table-modern">
              <thead>
                <tr>
                  <th>FDR Number</th>
                  <th>Issuing Bank</th>
                  <th>Deposit Amount</th>
                  <th>Maturity Schedule</th>
                  <th>Eligibility Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {eligibleFdrs.map((fdr) => (
                  <tr key={fdr.id}>
                    <td><strong className="ow-link">{fdr.fdr_number}</strong></td>
                    <td>{fdr.bank_name}</td>
                    <td><strong style={{ color: "#002b5c" }}>{formatAmount(fdr.amount)}</strong></td>
                    <td><TenorCell maturityDate={fdr.maturity_date} /></td>
                    <td>
                      {fdr.eligible ? (
                        <StatusBadge status="ELIGIBLE" />
                      ) : (
                        <span
                          title={fdr.ineligibility_reason}
                          className="ow-status-badge ow-badge-warning"
                          style={{ maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        >
                          {fdr.ineligibility_reason || "Ineligible"}
                        </span>
                      )}
                    </td>
                    <td>
                      {fdr.eligible ? (
                        <button
                          type="button"
                          className="ow-action-primary-btn"
                          style={{ fontSize: "11px", padding: "4px 10px" }}
                          onClick={() => {
                            setSelectedFdrId(String(fdr.id));
                            if (fdr.maturity_date) {
                              const nextMaturity = new Date(`${fdr.maturity_date}T00:00:00.000Z`);
                              nextMaturity.setUTCFullYear(nextMaturity.getUTCFullYear() + 1);
                              setRequestedMaturityDate(nextMaturity.toISOString().slice(0, 10));
                            }
                            setShowApply(true);
                          }}
                        >
                          Apply Renewal
                        </button>
                      ) : (
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>Not due yet</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!eligibleFdrs.length && (
                  <tr>
                    <td colSpan="6" style={{ textAlign: "center", padding: "30px", color: "#64748b" }}>
                      No FDR records available in institutional custody.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* APPLY FOR RENEWAL MODAL */}
      {showApply && (
        <div
          className="inst-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowApply(false);
          }}
        >
          <section className="inst-modal-box" role="dialog" aria-modal="true" aria-labelledby="renewal-form-title">
            <div className="inst-modal-header">
              <h2 id="renewal-form-title">Apply for FDR Renewal</h2>
              <button
                className="inst-modal-close-btn"
                type="button"
                onClick={() => setShowApply(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitRequest}>
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="inst-field-group">
                  <label>Select Eligible Fixed Deposit Receipt <span className="inst-req">*</span></label>
                  <select
                    className="inst-select"
                    required
                    value={selectedFdrId}
                    onChange={(event) => {
                      const id = event.target.value;
                      setSelectedFdrId(id);
                      const fdr = eligibleFdrs.find((item) => String(item.id) === id);
                      if (fdr?.maturity_date) {
                        const nextMaturity = new Date(`${fdr.maturity_date}T00:00:00.000Z`);
                        nextMaturity.setUTCFullYear(nextMaturity.getUTCFullYear() + 1);
                        setRequestedMaturityDate(nextMaturity.toISOString().slice(0, 10));
                      }
                    }}
                  >
                    <option value="">Choose an eligible FDR</option>
                    {eligibleFdrs
                      .filter((fdr) => fdr.eligible)
                      .map((fdr) => (
                        <option key={fdr.id} value={fdr.id}>
                          {fdr.fdr_number} · {fdr.bank_name} ({formatAmount(fdr.amount)})
                        </option>
                      ))}
                  </select>
                </div>

                {selectedFdr && (
                  <div
                    style={{
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      padding: "14px",
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "10px",
                      fontSize: "13px"
                    }}
                  >
                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>
                        Deposit Amount
                      </span>
                      <strong style={{ color: "#002b5c" }}>{formatAmount(selectedFdr.amount)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>
                        Current Maturity
                      </span>
                      <strong>{formatDate(selectedFdr.maturity_date)}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>
                        Programme / Level
                      </span>
                      <strong>{selectedFdr.programme_name || "Mandatory Institutional Deposit"}</strong>
                    </div>
                    <div>
                      <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>
                        Verification
                      </span>
                      <StatusBadge status={selectedFdr.verification_status} />
                    </div>
                  </div>
                )}

                <div className="inst-field-group">
                  <label>Requested Extended Maturity Date <span className="inst-req">*</span></label>
                  <input
                    className="inst-input"
                    required
                    type="date"
                    value={requestedMaturityDate}
                    onChange={(event) => setRequestedMaturityDate(event.target.value)}
                  />
                </div>

                <div className="inst-field-group">
                  <label>Renewal Reason / Statutory Information <span className="inst-req">*</span></label>
                  <textarea
                    className="inst-textarea"
                    rows="3"
                    required
                    maxLength={1000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Provide statutory justification or bank rollover notes..."
                  />
                </div>

                {error && (
                  <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", fontSize: "13px" }}>
                    ⚠ {error}
                  </div>
                )}

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "10px" }}>
                  <button
                    className="ow-button"
                    type="button"
                    onClick={() => setShowApply(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className="primary-button"
                    type="submit"
                    disabled={submitting || !eligibleFdrs.some((fdr) => fdr.eligible)}
                  >
                    {submitting ? "Submitting Request..." : "Submit Renewal Request"}
                  </button>
                </div>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* RENEWAL DETAILS MODAL */}
      {selectedDetail && (
        <div
          className="inst-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedRenewal(null);
              setSearchParams({});
            }
          }}
        >
          <section className="inst-modal-box" role="dialog" aria-modal="true" aria-labelledby="renewal-details-title">
            <div className="inst-modal-header">
              <div>
                <h2 id="renewal-details-title">Renewal Request #{selectedDetail.renewal.renewal_id}</h2>
                <span style={{ fontSize: "12px", color: "#64748b" }}>
                  Submitted on {formatDate(selectedDetail.renewal.request_date)}
                </span>
              </div>
              <button
                className="inst-modal-close-btn"
                type="button"
                onClick={() => {
                  setSelectedRenewal(null);
                  setSearchParams({});
                }}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "14px",
                background: "#f8fafc",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "16px",
                marginBottom: "20px"
              }}
            >
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>FDR Number</span>
                <strong style={{ fontSize: "14px" }}>{selectedDetail.renewal.fdr_number}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>Issuing Bank</span>
                <strong>{selectedDetail.renewal.bank_name}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>Deposit Amount</span>
                <strong style={{ color: "#002b5c", fontSize: "14px" }}>{formatAmount(selectedDetail.renewal.amount)}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>Renewal Status</span>
                <StatusBadge status={selectedDetail.renewal.renewal_status} />
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>Current Maturity</span>
                <strong>{formatDate(selectedDetail.renewal.maturity_date)}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>Requested Maturity</span>
                <strong style={{ color: "#0284c7" }}>{formatDate(selectedDetail.renewal.requested_maturity_date)}</strong>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <span style={{ color: "#64748b", display: "block", fontSize: "11px", textTransform: "uppercase" }}>Renewal Rationale</span>
                <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "#334155" }}>
                  {selectedDetail.renewal.reason || "Standard deposit roll-over upon term expiry."}
                </p>
              </div>
            </div>

            <h3 style={{ fontSize: "14.5px", color: "#002b5c", margin: "16px 0 10px 0" }}>Uploaded FDR Documents</h3>
            {documentError && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px", borderRadius: "6px", marginBottom: "10px", fontSize: "12.5px" }}>
                {documentError}
              </div>
            )}
            {(selectedDetail.documents || []).map((document) => (
              <div
                key={document.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 14px",
                  background: "#ffffff",
                  border: "1px solid #e2e8f0",
                  borderRadius: "6px",
                  marginBottom: "8px"
                }}
              >
                <div>
                  <strong style={{ fontSize: "13px", color: "#0f172a" }}>{document.file_name}</strong>
                  <span style={{ display: "block", fontSize: "11px", color: "#64748b" }}>
                    {document.document_type} · Uploaded {formatDate(document.uploaded_at)}
                  </span>
                </div>
                <button
                  type="button"
                  className="ow-action-view-btn"
                  onClick={() => openDocument(selectedDetail.renewal.fdr_id, document)}
                >
                  View Document ↗
                </button>
              </div>
            ))}
            {!selectedDetail.documents?.length && (
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>No documents attached to this renewal record.</p>
            )}

            <h3 style={{ fontSize: "14.5px", color: "#002b5c", margin: "20px 0 10px 0" }}>Activity Trail</h3>
            {(selectedDetail.timeline || []).length ? (
              <div className="institution-timeline">
                {selectedDetail.timeline.map((event, index) => (
                  <div className="institution-timeline-item" key={`${event.action}-${index}`}>
                    <strong>{event.action.replaceAll("_", " ")}</strong>
                    <small>{formatDate(event.created_at)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>No audit activity recorded yet.</p>
            )}
          </section>
        </div>
      )}
    </InstitutionLayout>
  );
}
