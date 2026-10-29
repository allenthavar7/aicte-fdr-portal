import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstitutionFdrs } from "../api/api";
import { formatAnalyticsAmount, getDaysRemaining } from "../utils/officerAnalytics";
import "./InstitutionWorkspace.css";

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

function Dashboard() {
  const navigate = useNavigate();

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

  const [institution, setInstitution] = useState({
    name: (user.name && !/vjti/i.test(user.name)) ? user.name : "ABC",
    code: user.aicte_code || user.institution_code || "AICTE-MH-001",
    city: user.city || "Mumbai",
    state: user.state || "Maharashtra"
  });

  const [fdrs, setFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadFdrs() {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          navigate("/");
          return;
        }

        const data = await getInstitutionFdrs(token);

        setFdrs(data.fdrs || []);
        if (data.institution) {
          setInstitution((prev) => ({
            ...prev,
            name: data.institution.name || prev.name,
            code: data.institution.aicteCode || data.institution.aicte_code || prev.code,
            city: data.institution.city || prev.city,
            state: data.institution.state || prev.state
          }));
        }
        setError("");
      } catch (err) {
        console.error("Failed to load FDRs:", err);
        setError(err.message || "Failed to load FDR data");
      } finally {
        setLoading(false);
      }
    }

    loadFdrs();
  }, [navigate]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  }

  const activeCount = useMemo(
    () => fdrs.filter((fdr) => fdr.status === "ACTIVE").length,
    [fdrs]
  );

  const pendingCount = useMemo(
    () =>
      fdrs.filter((fdr) =>
        ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(
          fdr.verification_status || ""
        )
      ).length,
    [fdrs]
  );

  const totalAmount = useMemo(
    () => fdrs.reduce((total, fdr) => total + Number(fdr.amount || 0), 0),
    [fdrs]
  );

  const expiringCount = useMemo(
    () =>
      fdrs.filter((fdr) => {
        const days = getDaysRemaining(fdr.maturity_date);
        return days !== null && days >= 0 && days <= 90;
      }).length,
    [fdrs]
  );

  const avatarLetter = (institution.name[0] || "V").toUpperCase();

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
          <button className="nav-item active">
            <span>▣</span>
            Dashboard
          </button>

          <button className="nav-item" onClick={() => navigate("/fdrs")}>
            <span>▤</span>
            My FDRs
          </button>

          <button className="nav-item" onClick={() => navigate("/submit-fdr")}>
            <span>＋</span>
            Submit FDR
          </button>

          <button className="nav-item" onClick={() => navigate("/renewals")}>
            <span>↻</span>
            Renewals
          </button>

          <button className="nav-item" onClick={() => navigate("/documents")}>
            <span>📄</span>
            Documents
          </button>

          <button className="nav-item" onClick={() => navigate("/notifications")}>
            <span>♢</span>
            Notifications
          </button>

          <button className="nav-item" onClick={() => navigate("/help")}>
            <span>🛟</span>
            Help & Support
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="institution-mini">
            <strong>{institution.name}</strong>
            <span>{institution.code}</span>
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
            <h1>Institution Dashboard</h1>
            <p>Security Deposit & Fixed Deposit Receipt Management</p>
          </div>

          <div className="user-info">
            <div className="user-avatar">{avatarLetter}</div>
            <div>
              <strong>{institution.name}</strong>
              <span>Institution Nodal Contact</span>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <section className="dashboard-content">
          {/* HERO BANNER */}
          <div className="ow-hero-header" style={{ marginBottom: "22px" }}>
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Institutional Command Centre
              </span>
              <h1 style={{ fontSize: "22px", margin: "6px 0 4px 0", color: "#ffffff", fontWeight: 700 }}>
                Welcome, {institution.name}
              </h1>
              <p style={{ margin: 0, color: "#bae6fd", fontSize: "13px" }}>
                AICTE Code: <strong>{institution.code}</strong> · Overview of your active collateral security deposits, verification status, and maturity timeline.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", zIndex: 1 }}>
              <button
                type="button"
                className="ow-button"
                onClick={() => navigate("/fdrs")}
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff", borderColor: "rgba(255,255,255,0.25)" }}
              >
                View Full Portfolio
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

          {/* ERROR ALERT */}
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

          {/* 4 SUMMARY STAT CARDS */}
          <section className="ow-kpi-grid" style={{ marginBottom: "22px" }}>
            <div className="ow-kpi-card kpi-green">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Active FDRs</span>
                <div className="ow-kpi-value">{loading ? "..." : activeCount}</div>
                <span className="ow-kpi-sub">In force and compliant</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-blue">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total Deposit Collateral</span>
                <div className="ow-kpi-value">
                  {loading ? "..." : formatAnalyticsAmount(totalAmount, true)}
                </div>
                <span className="ow-kpi-sub">{loading ? "..." : formatAmount(totalAmount)}</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-orange">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Pending Verification</span>
                <div className="ow-kpi-value">{loading ? "..." : pendingCount}</div>
                <span className="ow-kpi-sub">Awaiting OCR or Officer review</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-red">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Expiring Soon (≤90 Days)</span>
                <div className="ow-kpi-value">{loading ? "..." : expiringCount}</div>
                <span className="ow-kpi-sub">Action required for renewal</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
          </section>

          {/* RECENT FDRs TABLE */}
          <div className="ow-stack">
            <div className="ow-card" style={{ padding: 0, overflow: "hidden" }}>
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
                    Recent Fixed Deposit Receipts
                  </h3>
                  <p style={{ margin: 0, fontSize: "12.5px", color: "#64748b" }}>
                    Your latest registered security deposits pledged to AICTE.
                  </p>
                </div>
                <button
                  type="button"
                  className="ow-link"
                  onClick={() => navigate("/fdrs")}
                  style={{
                    background: "none",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "13px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}
                >
                  View All FDRs ({fdrs.length}) →
                </button>
              </div>

              <div className="ow-table-responsive">
                {loading ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                    Loading recent FDR records...
                  </div>
                ) : fdrs.length === 0 ? (
                  <div style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
                    No FDRs have been submitted yet.
                  </div>
                ) : (
                  <table className="ow-table-modern">
                    <thead>
                      <tr>
                        <th>FDR Number</th>
                        <th>Issuing Bank</th>
                        <th>Deposit Amount</th>
                        <th>Maturity Schedule</th>
                        <th>Verification</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fdrs.slice(0, 5).map((fdr) => (
                        <tr key={fdr.id}>
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
                            <TenorCell maturityDate={fdr.maturity_date} />
                          </td>
                          <td>
                            <StatusBadge status={fdr.verification_status} />
                          </td>
                          <td>
                            <StatusBadge status={fdr.status} />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="ow-action-view-btn"
                              onClick={() => navigate(`/fdrs?search=${encodeURIComponent(fdr.fdr_number)}`)}
                            >
                              Inspect →
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* QUICK ACTIONS */}
          <section className="inst-quick-grid">
            <div className="inst-quick-card" onClick={() => navigate("/submit-fdr")}>
              <div className="inst-quick-left">
                <div className="inst-quick-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </div>
                <div className="inst-quick-info">
                  <h3>Submit New FDR</h3>
                  <p>Register a new security deposit, programme addition, or replacement receipt.</p>
                </div>
              </div>
              <div className="inst-quick-arrow">→</div>
            </div>

            <div className="inst-quick-card" onClick={() => navigate("/renewals")}>
              <div className="inst-quick-left">
                <div className="inst-quick-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                </div>
                <div className="inst-quick-info">
                  <h3>Manage Renewals</h3>
                  <p>Track approaching maturity windows and submit renewal requests.</p>
                </div>
              </div>
              <div className="inst-quick-arrow">→</div>
            </div>

            <div className="inst-quick-card" onClick={() => navigate("/documents")}>
              <div className="inst-quick-left">
                <div className="inst-quick-icon">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div className="inst-quick-info">
                  <h3>Documents Repository</h3>
                  <p>View uploaded certificates, OCR evidence files, and joint lien endorsements.</p>
                </div>
              </div>
              <div className="inst-quick-arrow">→</div>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}

export default Dashboard;
