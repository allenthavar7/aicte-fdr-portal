import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstitutionFdrDocument, getInstitutionFdrs } from "../api/api";
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
  }

  return (
    <span className={`ow-status-badge ${badgeClass}`}>
      <span className="ow-status-dot" style={{ backgroundColor: dotColor }} />
      {String(status || "—").replace(/_/g, " ")}
    </span>
  );
}

function Documents() {
  const navigate = useNavigate();

  const [fdrsWithDocs, setFdrsWithDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState("");
  const [filterStatus, setFilterStatus] = useState("ALL");
  const [openingDocumentId, setOpeningDocumentId] = useState(null);
  const [documentError, setDocumentError] = useState("");

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
  const avatarLetter = (institutionName[0] || "V").toUpperCase();

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const token = localStorage.getItem("token");
      if (!token) {
        navigate("/");
        return;
      }

      const data = await getInstitutionFdrs(token);
      const allFdrs = data.fdrs || [];
      const withDocs = allFdrs.filter((fdr) => fdr.document_id);
      setFdrsWithDocs(withDocs);
    } catch (err) {
      console.error("Failed to load documents:", err);
      setError(err.message || "Failed to load uploaded documents");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    Promise.resolve().then(loadDocuments);
  }, [loadDocuments]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  }

  async function openDocument(fdr) {
    const documentWindow = window.open("", "_blank");
    if (!documentWindow) {
      setDocumentError("Allow pop-ups in your browser to view the FDR document.");
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

  const visibleDocuments = fdrsWithDocs.filter((fdr) => {
    const query = searchText.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [fdr.document_file_name, fdr.fdr_number, fdr.bank_name, fdr.document_type]
        .some((val) => String(val || "").toLowerCase().includes(query));

    const matchesStatus =
      filterStatus === "ALL" ||
      (filterStatus === "VERIFIED" && fdr.verification_status === "VERIFIED") ||
      (filterStatus === "PENDING" && ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(fdr.verification_status)) ||
      (filterStatus === "FLAGGED" && ["FLAGGED", "FAILED", "REJECTED"].includes(fdr.verification_status));

    return matchesSearch && matchesStatus;
  });

  const totalCount = fdrsWithDocs.length;
  const verifiedCount = fdrsWithDocs.filter((f) => f.verification_status === "VERIFIED").length;
  const pendingCount = fdrsWithDocs.filter((f) =>
    ["PENDING", "UNDER_REVIEW", "SUBMITTED"].includes(f.verification_status || "")
  ).length;
  const flaggedCount = fdrsWithDocs.filter((f) =>
    ["FLAGGED", "FAILED", "REJECTED"].includes(f.verification_status || "")
  ).length;

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
          <button className="nav-item" onClick={() => navigate("/dashboard")}>
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

          <button className="nav-item active">
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
            <h1>Documents Repository</h1>
            <p>Manage and inspect scanned deposit certificates and OCR evidence</p>
          </div>

          <div className="user-info">
            <div className="user-avatar">{avatarLetter}</div>
            <div>
              <strong>{institutionName}</strong>
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
                <span className="ow-pill-dot" /> Digital Evidence Vault
              </span>
              <h1 style={{ fontSize: "22px", margin: "6px 0 4px 0", color: "#ffffff", fontWeight: 700 }}>
                FDR Documents & Deposit Certificates
              </h1>
              <p style={{ margin: 0, color: "#bae6fd", fontSize: "13px" }}>
                Repository of high-resolution scanned instruments, joint AICTE lien endorsements, and OCR verification evidence for {institutionName}.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center", zIndex: 1 }}>
              <button
                type="button"
                className="ow-button"
                onClick={loadDocuments}
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
                <span className="ow-kpi-label">Total Documents</span>
                <div className="ow-kpi-value">{loading ? "..." : totalCount}</div>
                <span className="ow-kpi-sub">Uploaded instruments</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-green">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Verified & Compliant</span>
                <div className="ow-kpi-value">{loading ? "..." : verifiedCount}</div>
                <span className="ow-kpi-sub">Passed OCR & bank check</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-orange">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Pending Verification</span>
                <div className="ow-kpi-value">{loading ? "..." : pendingCount}</div>
                <span className="ow-kpi-sub">Under active scrutiny</span>
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
                <span className="ow-kpi-label">Action Required</span>
                <div className="ow-kpi-value">{loading ? "..." : flaggedCount}</div>
                <span className="ow-kpi-sub">Discrepancy / Clarification</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>
          </section>

          {/* ALERTS */}
          {error && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                padding: "14px 18px",
                borderRadius: "8px",
                marginBottom: "20px",
                fontSize: "13.5px"
              }}
            >
              ⚠ {error}
            </div>
          )}

          {documentError && (
            <div
              role="alert"
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                padding: "12px 16px",
                borderRadius: "8px",
                marginBottom: "16px",
                fontSize: "13px"
              }}
            >
              ⚠ {documentError}
            </div>
          )}

          {/* EMPTY STATE */}
          {!loading && !error && fdrsWithDocs.length === 0 && (
            <section className="ow-card" style={{ padding: "50px", textAlign: "center" }}>
              <div style={{ width: "48px", height: "48px", margin: "0 auto 12px", background: "#f0f7ff", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#0284c7" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <h3 style={{ margin: "0 0 6px 0", color: "#002b5c" }}>No FDR Documents Uploaded Yet</h3>
              <p style={{ color: "#64748b", maxWidth: "520px", margin: "0 auto 20px", fontSize: "13.5px" }}>
                When you submit an FDR along with its scanned PDF or image certificate, your documents are indexed and made accessible here for verification.
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
          {!loading && fdrsWithDocs.length > 0 && (
            <div className="ow-stack">
              {/* FILTER TOOLBAR */}
              <div className="ow-filter-toolbar" style={{ borderRadius: "10px" }}>
                <div className="ow-filter-group" style={{ flex: 1 }}>
                  <div className="ow-search-box" style={{ width: "100%", maxWidth: "380px" }}>
                    <svg className="ow-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                      type="search"
                      className="ow-search-input"
                      aria-label="Search documents"
                      placeholder="Search file name, FDR number, bank..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
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

                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="inst-select"
                    style={{ width: "auto", minWidth: "160px", padding: "8px 12px" }}
                  >
                    <option value="ALL">All Verification Statuses</option>
                    <option value="VERIFIED">Verified</option>
                    <option value="PENDING">Pending Scrutiny</option>
                    <option value="FLAGGED">Action Required</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>
                    Showing {visibleDocuments.length} of {fdrsWithDocs.length} document{fdrsWithDocs.length !== 1 ? "s" : ""}
                  </span>
                  <button type="button" className="ow-button" onClick={loadDocuments}>
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
                        <th>Document Evidence</th>
                        <th>Document Category</th>
                        <th>Associated FDR</th>
                        <th>Issuing Bank</th>
                        <th>Deposit Amount</th>
                        <th>Issue Date</th>
                        <th>Verification Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleDocuments.map((fdr) => (
                        <tr key={fdr.id}>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <div
                                style={{
                                  width: "32px",
                                  height: "32px",
                                  borderRadius: "6px",
                                  background: "#f0f7ff",
                                  border: "1px solid #bfdbfe",
                                  color: "#0284c7",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  flexShrink: 0
                                }}
                              >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <polyline points="14 2 14 8 20 8" />
                                </svg>
                              </div>
                              <div>
                                <strong style={{ fontSize: "13px", color: "#0f172a" }}>
                                  {fdr.document_file_name || `${fdr.fdr_number}_scan.pdf`}
                                </strong>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span className="ow-status-badge ow-badge-info" style={{ fontSize: "11px" }}>
                              {String(fdr.document_type || "FDR_RECEIPT").replace(/_/g, " ")}
                            </span>
                          </td>

                          <td>
                            <strong className="ow-link">{fdr.fdr_number}</strong>
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
                            <StatusBadge status={fdr.verification_status} />
                          </td>

                          <td>
                            <button
                              type="button"
                              className="ow-action-view-btn"
                              onClick={() => openDocument(fdr)}
                              disabled={openingDocumentId === fdr.document_id}
                            >
                              {openingDocumentId === fdr.document_id ? "Opening..." : "View Document ↗"}
                            </button>
                          </td>
                        </tr>
                      ))}

                      {visibleDocuments.length === 0 && (
                        <tr>
                          <td colSpan="8" className="ow-empty" style={{ textAlign: "center", padding: "30px" }}>
                            No documents match your search or filter criteria.
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
    </div>
  );
}

export default Documents;
