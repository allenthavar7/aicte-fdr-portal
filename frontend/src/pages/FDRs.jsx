import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getInstitutionFdrDocument,
  getInstitutionFdrs,
  submitInstitutionReleaseRequest
} from "../api/api";
import AutomatedVerificationResult from "../components/AutomatedVerificationResult";
import { formatAnalyticsAmount } from "../utils/officerAnalytics";
import "./OfficerWorkspace.css";

function formatAmount(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount || 0);
}

function formatDate(date) {
  if (!date) return "—";
  const parsedDate = new Date(date);
  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }
  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function getMaturityDays(dateValue) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / 86400000);
}

function getMaturityTone(maturityDate) {
  const days = getMaturityDays(maturityDate);
  if (days === null) return "normal";
  if (days < 0) return "critical";
  if (days <= 30) return "critical";
  if (days <= 90) return "warning";
  return "normal";
}

function getMaturitySubtext(maturityDate) {
  const days = getMaturityDays(maturityDate);
  if (days === null) return "";
  if (days < 0) return `${Math.abs(days)}d Overdue`;
  if (days === 0) return "Matures Today";
  if (days <= 30) return `${days}d Left (Urgent)`;
  if (days <= 90) return `${days}d Remaining`;
  return `${days}d Remaining`;
}

function StatusBadge({ status }) {
  const norm = String(status || "").toUpperCase();
  let badgeClass = "ow-badge-info";
  let dotColor = "#64748b";

  if (["VERIFIED", "ACTIVE", "APPROVED", "COMPLETED", "PASS"].includes(norm)) {
    badgeClass = "ow-badge-success";
    dotColor = "#16a34a";
  } else if (["PENDING", "UNDER_REVIEW", "EXPIRING SOON", "RENEWAL_REQUESTED"].includes(norm)) {
    badgeClass = "ow-badge-warning";
    dotColor = "#d97706";
  } else if (["FLAGGED", "FAILED", "REJECTED", "CRITICAL", "OVERDUE"].includes(norm)) {
    badgeClass = "ow-badge-danger";
    dotColor = "#dc2626";
  } else if (["SUBMITTED", "NEW_INSTITUTION", "NEW_PROGRAMME", "NORMAL"].includes(norm)) {
    badgeClass = "ow-badge-blue";
    dotColor = "#0284c7";
  } else if (["MATURED", "RELEASE_REQUESTED", "RELEASED"].includes(norm)) {
    badgeClass = "ow-badge-purple";
    dotColor = "#8b5cf6";
  }

  return (
    <span className={`ow-status-badge ${badgeClass}`}>
      <span className="ow-status-dot" style={{ backgroundColor: dotColor }} />
      {String(status || "—").replace(/_/g, " ")}
    </span>
  );
}

function FDRs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [fdrs, setFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState(
    () => searchParams.get("search") || ""
  );
  const [openingDocumentId, setOpeningDocumentId] = useState(null);
  const [documentError, setDocumentError] = useState("");
  const [expandedVerificationId, setExpandedVerificationId] = useState(null);
  const [releaseModalFdr, setReleaseModalFdr] = useState(null);
  const [releaseReason, setReleaseReason] = useState("");
  const [submittingRelease, setSubmittingRelease] = useState(false);
  const [releaseError, setReleaseError] = useState("");
  const [releaseSuccess, setReleaseSuccess] = useState("");

  const user = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      if (u.name && /vjti/i.test(u.name)) u.name = "ABC";
      if (u.email && /vjti/i.test(u.email)) u.email = "admin@abc.ac.in";
      return u;
    } catch {
      return {};
    }
  })();
  const dummyUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const institutionName = (user.name && !/vjti/i.test(user.name)) ? user.name : "ABC";
  const institutionCode = user.aicte_code || user.institution_code || "AICTE-MH-001";
  const avatarLetter = (institutionName[0] || "A").toUpperCase();

  const loadFdrs = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        navigate("/");
        return;
      }

      const data = await getInstitutionFdrs(token);
      setFdrs(data.fdrs || []);
    } catch (err) {
      console.error("Failed to load FDRs:", err);
      setError(err.message || "Failed to load FDRs");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    Promise.resolve().then(loadFdrs);
  }, [loadFdrs]);

  const instFdrSummary = useMemo(() => {
    const total = fdrs.length;
    const totalValue = fdrs.reduce((acc, f) => acc + Number(f.amount || 0), 0);
    const activeVerified = fdrs.filter(
      (f) => f.status === "ACTIVE" && f.verification_status === "VERIFIED"
    ).length;
    const pendingReview = fdrs.filter(
      (f) =>
        ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(f.verification_status || "") ||
        f.status === "SUBMITTED"
    ).length;
    const expiringSoon = fdrs.filter((f) => {
      const days = getMaturityDays(f.maturity_date);
      return days !== null && days >= 0 && days <= 90;
    }).length;
    return { total, totalValue, activeVerified, pendingReview, expiringSoon };
  }, [fdrs]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  }

  function openReleaseModal(fdr) {
    setReleaseModalFdr(fdr);
    setReleaseReason("");
    setReleaseError("");
  }

  function closeReleaseModal() {
    if (!submittingRelease) {
      setReleaseModalFdr(null);
      setReleaseReason("");
      setReleaseError("");
    }
  }

  async function handleReleaseSubmit(e) {
    e.preventDefault();
    if (!releaseModalFdr || !releaseReason.trim()) return;

    try {
      setSubmittingRelease(true);
      setReleaseError("");
      const token = localStorage.getItem("token");
      await submitInstitutionReleaseRequest(token, {
        fdrId: releaseModalFdr.id,
        reason: releaseReason.trim()
      });
      setReleaseSuccess(
        `Release request for FDR ${releaseModalFdr.fdr_number} submitted successfully.`
      );
      closeReleaseModal();
      await loadFdrs();
    } catch (err) {
      console.error("Release request error:", err);
      setReleaseError(err.message || "Failed to submit release request");
    } finally {
      setSubmittingRelease(false);
    }
  }

  async function openDocument(fdr) {
    const documentWindow = window.open("", "_blank");

    if (!documentWindow) {
      setDocumentError("Allow pop-ups to open the FDR document.");
      return;
    }

    try {
      setOpeningDocumentId(fdr.document_id);
      setDocumentError("");
      const token = localStorage.getItem("token");

      if (!token) {
        documentWindow.close();
        navigate("/");
        return;
      }

      const blob = await getInstitutionFdrDocument(
        token,
        fdr.id,
        fdr.document_id
      );
      documentWindow.location.href = URL.createObjectURL(blob);
    } catch (err) {
      documentWindow.close();
      console.error("Failed to open FDR document:", err);
      setDocumentError(err.message || "Unable to open FDR document");
    } finally {
      setOpeningDocumentId(null);
    }
  }

  const visibleFdrs = fdrs.filter((fdr) => {
    const query = searchText.trim().toLocaleLowerCase("en-IN");
    return [fdr.fdr_number, fdr.bank_name, fdr.application_type].some(
      (value) => String(value || "").toLocaleLowerCase("en-IN").includes(query)
    );
  });

  return (
    <div className="dashboard-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-circle">AICTE</div>
          <div>
            <h2>AICTE</h2>
            <span>FDR Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            className="nav-item"
            onClick={() => navigate("/dashboard")}
          >
            <span>▣</span>
            Dashboard
          </button>

          <button className="nav-item active">
            <span>▤</span>
            My FDRs
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/submit-fdr")}
          >
            <span>＋</span>
            Submit FDR
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/renewals")}
          >
            <span>↻</span>
            Renewals
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/documents")}
          >
            <span>📄</span>
            Documents
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/notifications")}
          >
            <span>♢</span>
            Notifications
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/help")}
          >
            <span>🛟</span>
            Help & Support
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="institution-mini">
            <strong>{institutionName}</strong>
            <span>{institutionCode}</span>
          </div>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="dashboard-main">
        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <h1>My FDRs</h1>
            <p>View and manage your submitted Fixed Deposit Receipts</p>
          </div>

          <div className="user-info">
            <div className="user-avatar">{avatarLetter}</div>
            <div>
              <strong>{institutionName}</strong>
              <span>Institution</span>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <section className="dashboard-content">
          {/* HERO BANNER */}
          <div className="ow-hero-header" style={{ marginBottom: "22px" }}>
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Institutional Portfolio
              </span>
              <h1 style={{ fontSize: "22px", margin: "6px 0 4px 0", color: "#ffffff", fontWeight: 700 }}>
                Fixed Deposit Receipts (FDRs)
              </h1>
              <p style={{ margin: 0, color: "#bae6fd", fontSize: "13px" }}>
                Active security deposits, AICTE joint lien endorsements, and compliance records for {institutionName} ({institutionCode}).
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", zIndex: 1 }}>
              <button
                type="button"
                className="ow-button"
                onClick={loadFdrs}
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
              >
                ↻ Refresh
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => navigate("/submit-fdr")}
                style={{ whiteSpace: "nowrap" }}
              >
                + Submit New FDR
              </button>
            </div>
          </div>

          {/* 4 SUMMARY KPI CARDS */}
          <section className="ow-kpi-grid" style={{ marginBottom: "22px" }}>
            <div className="ow-kpi-card kpi-navy">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total FDRs</span>
                <div className="ow-kpi-value">{instFdrSummary.total}</div>
                <span className="ow-kpi-sub">On institutional record</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-blue">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total Collateral Value</span>
                <div className="ow-kpi-value">{formatAnalyticsAmount(instFdrSummary.totalValue, true)}</div>
                <span className="ow-kpi-sub">{formatAmount(instFdrSummary.totalValue)}</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-green">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Verified & Active</span>
                <div className="ow-kpi-value">{instFdrSummary.activeVerified}</div>
                <span className="ow-kpi-sub">Fully compliant instruments</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-orange">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Under Scrutiny / Pending</span>
                <div className="ow-kpi-value">{instFdrSummary.pendingReview}</div>
                <span className="ow-kpi-sub">{instFdrSummary.expiringSoon} maturing in ≤90 days</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
          </section>

          {/* ALERTS */}
          {releaseSuccess && (
            <div
              style={{
                background: "#dcfce7",
                color: "#166534",
                border: "1px solid #bbf7d0",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "20px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
              }}
            >
              <span>{releaseSuccess}</span>
              <button
                type="button"
                onClick={() => setReleaseSuccess("")}
                style={{ border: "none", background: "none", color: "#166534", cursor: "pointer", fontWeight: "bold", fontSize: "16px" }}
              >
                &times;
              </button>
            </div>
          )}

          {error && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "20px"
              }}
            >
              {error}
            </div>
          )}

          {documentError && (
            <div role="alert" style={{ color: "#991b1b", background: "#fef2f2", padding: "10px 14px", borderRadius: "6px", marginBottom: "16px" }}>
              {documentError}
            </div>
          )}

          {/* LOADING */}
          {loading && (
            <section className="ow-card" style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ color: "#64748b", fontSize: "15px" }}>Loading FDR records...</div>
            </section>
          )}

          {/* EMPTY */}
          {!loading && !error && fdrs.length === 0 && (
            <section className="ow-card" style={{ padding: "50px", textAlign: "center" }}>
              <h3 style={{ margin: "0 0 8px 0", color: "#002b5c" }}>No FDRs Found</h3>
              <p style={{ color: "#64748b", margin: "0 0 20px 0" }}>
                You have not submitted any Fixed Deposit Receipts yet.
              </p>
              <button
                className="primary-button"
                onClick={() => navigate("/submit-fdr")}
              >
                Submit Your First FDR
              </button>
            </section>
          )}

          {/* TABLE CONTAINER */}
          {!loading && fdrs.length > 0 && (
            <div className="ow-stack">
              {/* TOOLBAR */}
              <div className="ow-filter-toolbar" style={{ borderRadius: "10px" }}>
                <div className="ow-filter-group" style={{ flex: 1 }}>
                  <div className="ow-search-box" style={{ width: "100%", maxWidth: "420px" }}>
                    <svg className="ow-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="search"
                      className="ow-search-input"
                      aria-label="Search your FDRs"
                      placeholder="Search FDR number, bank, application..."
                      value={searchText}
                      onChange={(event) => setSearchText(event.target.value)}
                    />
                    {searchText && (
                      <button
                        type="button"
                        className="ow-search-clear"
                        onClick={() => setSearchText("")}
                        aria-label="Clear search"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                    Showing {visibleFdrs.length} of {fdrs.length} FDR{fdrs.length !== 1 ? "s" : ""}
                  </span>
                  <button
                    type="button"
                    className="ow-button"
                    onClick={loadFdrs}
                  >
                    ↻ Refresh
                  </button>
                </div>
              </div>

              {/* MODERN TABLE CARD */}
              <div className="ow-table-card">
                <div className="ow-table-responsive">
                  <table className="ow-table-modern">
                    <thead>
                      <tr>
                        <th>FDR Number</th>
                        <th>Issuing Bank</th>
                        <th>Deposit Amount</th>
                        <th>Issue Date</th>
                        <th>Maturity Schedule</th>
                        <th>Verification</th>
                        <th>Automated Scrutiny</th>
                        <th>Score</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleFdrs.map((fdr) => (
                        <Fragment key={fdr.id}>
                          <tr>
                            <td>
                              <strong className="ow-link">{fdr.fdr_number}</strong>
                              <span style={{ display: "block", fontSize: "11px", color: "#64748b" }}>
                                {fdr.application_type || "Mandatory Deposit"}
                              </span>
                            </td>

                            <td>
                              <span style={{ fontWeight: 600, color: "#334155" }}>{fdr.bank_name}</span>
                            </td>

                            <td>
                              <strong style={{ color: "#002b5c" }}>{formatAmount(fdr.amount)}</strong>
                            </td>

                            <td>
                              <span style={{ fontSize: "12.5px", color: "#475569" }}>
                                {formatDate(fdr.issue_date)}
                              </span>
                            </td>

                            <td>
                              <div className={`ow-tenor-cell ow-tenor-${getMaturityTone(fdr.maturity_date)}`}>
                                <span className="ow-tenor-date">{formatDate(fdr.maturity_date)}</span>
                                <span className="ow-tenor-sub">{getMaturitySubtext(fdr.maturity_date)}</span>
                              </div>
                            </td>

                            <td>
                              <StatusBadge status={fdr.verification_status} />
                            </td>

                            <td>
                              <div style={{ fontSize: "12px", fontWeight: 600, color: "#1e293b" }}>
                                {fdr.verification_result || fdr.verification_status}
                              </div>
                              {fdr.review_reason && (
                                <small style={{ color: "#b45309", display: "block", marginTop: "2px" }}>
                                  {fdr.review_reason}
                                </small>
                              )}
                              <button
                                className="ow-link"
                                style={{
                                  background: "none",
                                  border: "none",
                                  padding: 0,
                                  cursor: "pointer",
                                  fontSize: "11px",
                                  marginTop: "4px",
                                  display: "inline-block"
                                }}
                                type="button"
                                onClick={() =>
                                  setExpandedVerificationId(
                                    expandedVerificationId === fdr.id ? null : fdr.id
                                  )
                                }
                                aria-expanded={expandedVerificationId === fdr.id}
                              >
                                {expandedVerificationId === fdr.id ? "▲ Hide details" : "▼ View details"}
                              </button>
                            </td>

                            <td>
                              {Number.isFinite(fdr.verification_score) ? (
                                <span
                                  className="ow-status-badge"
                                  style={{
                                    background: fdr.verification_score >= 80 ? "#f0fdf4" : "#fffbeb",
                                    borderColor: fdr.verification_score >= 80 ? "#bbf7d0" : "#fde68a",
                                    color: fdr.verification_score >= 80 ? "#15803d" : "#b45309",
                                    fontWeight: 700
                                  }}
                                >
                                  {fdr.verification_score}%
                                </span>
                              ) : (
                                <span style={{ color: "#94a3b8" }}>—</span>
                              )}
                            </td>

                            <td>
                              <StatusBadge status={fdr.status} />
                            </td>

                            <td>
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                                {fdr.document_id ? (
                                  <button
                                    type="button"
                                    className="ow-action-view-btn"
                                    onClick={() => openDocument(fdr)}
                                    disabled={openingDocumentId === fdr.document_id}
                                  >
                                    {openingDocumentId === fdr.document_id ? "Opening..." : "Document ↗"}
                                  </button>
                                ) : (
                                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>—</span>
                                )}

                                {fdr.status === "ACTIVE" && fdr.verification_status === "VERIFIED" && (
                                  <button
                                    type="button"
                                    className="ow-action-primary-btn"
                                    style={{ fontSize: "11px", padding: "4px 8px" }}
                                    onClick={() => openReleaseModal(fdr)}
                                  >
                                    Request Release
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {expandedVerificationId === fdr.id && (
                            <tr>
                              <td colSpan="10" style={{ background: "#f8fafc", padding: "16px 20px" }}>
                                {fdr.verification ? (
                                  <AutomatedVerificationResult verification={fdr.verification} />
                                ) : (
                                  <p role="status" style={{ margin: 0, color: "#64748b", fontSize: "13px" }}>
                                    No automated verification details are available for this FDR.
                                  </p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      ))}

                      {visibleFdrs.length === 0 && (
                        <tr>
                          <td colSpan="10" className="ow-empty" style={{ textAlign: "center", padding: "30px" }}>
                            No Fixed Deposit Receipts match your search query.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* RELEASE REQUEST MODAL */}
      {releaseModalFdr && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(16,24,40,.48)",
            zIndex: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "12px",
              width: "min(560px, 100%)",
              maxHeight: "90vh",
              overflow: "auto",
              padding: "24px",
              boxShadow: "0 20px 50px rgba(16,24,40,.25)"
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", color: "#111827" }}>Request FDR Release</h3>
              <button
                type="button"
                onClick={closeReleaseModal}
                style={{ border: "none", background: "none", fontSize: "22px", cursor: "pointer", color: "#6b7280" }}
              >
                &times;
              </button>
            </div>
            <p style={{ color: "#4b5563", fontSize: "13px", marginTop: 0, marginBottom: "16px" }}>
              Submit a formal request to AICTE for the release and discharge of this Fixed Deposit Receipt.
            </p>

            {releaseError && (
              <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: "6px", marginBottom: "14px", fontSize: "13px" }}>
                {releaseError}
              </div>
            )}

            <div style={{ background: "#f8fafc", borderRadius: "8px", padding: "14px", marginBottom: "16px", border: "1px solid #e2e8f0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", fontSize: "13px" }}>
                <div>
                  <span style={{ color: "#64748b", display: "block" }}>FDR Number</span>
                  <strong>{releaseModalFdr.fdr_number}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b", display: "block" }}>Issuing Bank</span>
                  <strong>{releaseModalFdr.bank_name}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b", display: "block" }}>Amount</span>
                  <strong>{formatAmount(releaseModalFdr.amount)}</strong>
                </div>
                <div>
                  <span style={{ color: "#64748b", display: "block" }}>Maturity Date</span>
                  <strong>{formatDate(releaseModalFdr.maturity_date)}</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleReleaseSubmit}>
              <div style={{ marginBottom: "18px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: 600, color: "#374151", marginBottom: "6px" }}>
                  Reason for Release Request <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <textarea
                  rows="4"
                  required
                  placeholder="State the regulatory basis or compliance completion reason (e.g., successful completion of mandatory lock-in period, approved programme closure, etc.)..."
                  value={releaseReason}
                  onChange={(e) => setReleaseReason(e.target.value)}
                  style={{
                    width: "100%",
                    boxSizing: "border-box",
                    padding: "10px",
                    borderRadius: "6px",
                    border: "1px solid #d1d5db",
                    fontSize: "13px",
                    fontFamily: "inherit"
                  }}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeReleaseModal}
                  disabled={submittingRelease}
                  style={{ border: "1px solid #d1d5db", background: "#fff", padding: "8px 16px", borderRadius: "6px", cursor: "pointer" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingRelease || !releaseReason.trim()}
                >
                  {submittingRelease ? "Submitting..." : "Submit Release Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default FDRs;
