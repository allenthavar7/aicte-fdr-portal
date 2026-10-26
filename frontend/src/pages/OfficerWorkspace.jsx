import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  getOfficerAuditLogs,
  getOfficerFdrs,
  getOfficerVerificationQueue,
  getOfficerInstitution,
  getOfficerInstitutions,
  getOfficerMasterData,
  getOfficerNotifications,
  getOfficerProfile,
  getOfficerReleaseRequests,
  getOfficerReports,
  getOfficerRenewals,
  getOfficerUsers,
  markAllOfficerNotificationsRead,
  markOfficerNotificationRead,
  reviewOfficerReleaseRequest,
  reviewOfficerRenewal,
  updateOfficerProfile
} from "../services/api";

const titles = {
  institutions: "Institutions",
  fdrs: "FDR Management",
  verification: "Verification Queue",
  "release-requests": "Release Requests",
  reports: "Reports & Analytics",
  "audit-log": "Audit Log",
  users: "Manage Users",
  "master-data": "Master Data",
  settings: "Officer Settings",
  help: "Help & Support",
  notifications: "Alerts & Notifications",
  renewals: "Renewals",
  alerts: "Alerts & Notifications"
};

const navItems = [
  ["Dashboard", "/officer", "⌂"],
  ["Institutions", "/officer/institutions", "▦"],
  ["FDRs", "/officer/fdrs", "▤"],
  ["Verification Queue", "/officer/verification", "✓"],
  ["Release Requests", "/officer/release-requests", "↑"],
  ["Renewals", "/officer/renewals", "↻"],
  ["Reports & Analytics", "/officer/reports", "▥"],
  ["Audit Log", "/officer/audit-log", "◴"],
  ["Manage Users", "/officer/users", "♙"],
  ["Master Data", "/officer/master-data", "▤"],
  ["Settings", "/officer/settings", "⚙"],
  ["Help & Support", "/officer/help", "?"]
];

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
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0
      }).format(amount)
    : "—";
}

function label(value) {
  return String(value || "—")
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function maturityStatus(value) {
  const maturity = new Date(value);
  if (!value || Number.isNaN(maturity.getTime())) return "Unknown";
  const days = Math.ceil(
    (maturity.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) /
      86400000
  );
  if (days < 0) return "Matured";
  if (days < 30) return "Critical";
  if (days <= 90) return "Expiring Soon";
  return "Normal";
}

function Table({ columns, rows, empty = "No records found." }) {
  return (
    <div className="ow-table-wrap">
      <table className="ow-table">
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={row.id ?? row.key ?? index}>
              {row.cells.map((cell, cellIndex) => (
                <td key={`${row.id ?? index}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          )) : (
            <tr><td colSpan={columns.length} className="ow-empty">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function OfficerWorkspace() {
  const { section = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState(() => searchParams.get("search") || "");
  const [statusFilter, setStatusFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [applicationFilter, setApplicationFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expiryFilter, setExpiryFilter] = useState(
    () => searchParams.get("expiry") || ""
  );
  const [page, setPage] = useState(1);
  const [selectedInstitution, setSelectedInstitution] = useState(null);
  const [reviewId, setReviewId] = useState(null);
  const [renewalReviewId, setRenewalReviewId] = useState(null);
  const [reviewReason, setReviewReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const currentSection = section === "alerts" ? "notifications" : section;

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/", { replace: true });
  }

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      if (!token) {
        setError("Sign in with an officer account to view this page.");
        setLoading(false);
        return;
      }
      try {
        let result;
        switch (currentSection) {
          case "institutions":
            result = await getOfficerInstitutions(token);
            break;
          case "fdrs":
            result = await getOfficerFdrs(token);
            break;
          case "verification":
            result = await getOfficerVerificationQueue(token);
            break;
          case "release-requests":
            result = await getOfficerReleaseRequests(token);
            break;
          case "reports":
            result = await getOfficerReports(token);
            break;
          case "audit-log":
            result = await getOfficerAuditLogs(token);
            break;
          case "users":
            result = await getOfficerUsers(token);
            break;
          case "master-data":
            result = await getOfficerMasterData(token);
            break;
          case "settings":
            result = await getOfficerProfile(token);
            setProfile(result.user);
            break;
          case "notifications":
            {
              const [notificationResult, fdrResult] = await Promise.all([
                getOfficerNotifications(token),
                getOfficerFdrs(token)
              ]);
              result = { ...notificationResult, fdrs: fdrResult.fdrs };
            }
            break;
          case "renewals":
            result = await getOfficerRenewals(token);
            break;
          case "help":
            result = {};
            break;
          default:
            result = {};
        }
        if (active) setData(result);
      } catch (loadError) {
        if (active) setError(loadError.message || "Unable to load this page.");
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [currentSection, refreshKey, token]);

  useEffect(() => {
    const id = Number(searchParams.get("institution"));
    if (!id || !token) {
      return undefined;
    }
    let active = true;
    getOfficerInstitution(token, id)
      .then((result) => {
        if (active) setSelectedInstitution(result);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || "Unable to load institution.");
      });
    return () => { active = false; };
  }, [searchParams, token]);

  const fdrs = useMemo(() => data?.fdrs || [], [data]);
  const matchingFdrs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-IN");
    return fdrs.filter((fdr) => {
      const textMatches = !normalizedQuery || [
        fdr.fdr_number,
        fdr.bank_name,
        fdr.institution?.name,
        fdr.institution?.aicte_code,
        fdr.institution?.state
      ].some((value) => String(value || "").toLocaleLowerCase("en-IN").includes(normalizedQuery));
      const currentStatus = String(fdr.verification_status || "").toUpperCase();
      const queueStatus = ["PENDING", "FLAGGED", "FAILED"].includes(currentStatus) ||
        fdr.verification?.checks?.some((item) => item.status === "FAILED");
      const checks = fdr.verification?.checks || [];
      const bankStatus = String(
        fdr.verification?.bank_verification?.status || ""
      ).toUpperCase();
      const highPriority =
        ["FLAGGED", "FAILED"].includes(currentStatus) ||
        bankStatus === "FAILED" ||
        checks.some((item) => item.key === "duplicate_fdr_check" && item.status === "FAILED");
      const recordDate = new Date(fdr.created_at);
      const lowerDate = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
      const upperDate = toDate ? new Date(`${toDate}T23:59:59`) : null;
      const issueMatches = !issueFilter ||
        (issueFilter === "DUPLICATE" && checks.some((item) => item.key === "duplicate_fdr_check" && item.status === "FAILED")) ||
        (issueFilter === "BANK_FAILED" && bankStatus === "FAILED") ||
        (issueFilter === "OCR_MISMATCH" && fdr.verification?.comparisons?.some((item) => item.result === "MISMATCH")) ||
        (issueFilter === "AMOUNT_MISMATCH" && fdr.verification?.comparisons?.some((item) => item.field === "amount" && item.result === "MISMATCH")) ||
        (issueFilter === "PENDING" && currentStatus === "PENDING");
      return textMatches &&
        (!statusFilter || currentStatus === statusFilter) &&
        (!bankFilter || fdr.bank_name === bankFilter) &&
        (!applicationFilter || fdr.application?.application_type === applicationFilter) &&
        (!priorityFilter || (priorityFilter === "HIGH" ? highPriority : !highPriority)) &&
        (!fromDate || (!Number.isNaN(recordDate.getTime()) && recordDate >= lowerDate)) &&
        (!toDate || (!Number.isNaN(recordDate.getTime()) && recordDate <= upperDate)) &&
        (!expiryFilter || maturityStatus(fdr.maturity_date).toUpperCase() === expiryFilter) &&
        issueMatches &&
        (currentSection !== "verification" || queueStatus);
    }).sort((left, right) =>
      new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  }, [
    fdrs,
    query,
    statusFilter,
    bankFilter,
    applicationFilter,
    priorityFilter,
    issueFilter,
    fromDate,
    toDate,
    expiryFilter,
    currentSection
  ]);

  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(matchingFdrs.length / pageSize));
  const pageFdrs = matchingFdrs.slice((page - 1) * pageSize, page * pageSize);

  function viewFdr(fdrId) {
    navigate(`/officer?fdr=${fdrId}`);
  }

  async function reviewRelease(requestId, decision) {
    if (!reviewReason.trim()) {
      setActionError("Enter a review reason before taking action.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await reviewOfficerReleaseRequest(token, requestId, decision, reviewReason);
      setReviewId(null);
      setReviewReason("");
      setRefreshKey((value) => value + 1);
    } catch (reviewError) {
      setActionError(reviewError.message || "Unable to update release request.");
    } finally {
      setBusy(false);
    }
  }

  async function reviewRenewal(renewalId, status) {
    if (!reviewReason.trim()) {
      setActionError("Enter a review reason before taking action.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await reviewOfficerRenewal(token, renewalId, status, reviewReason);
      setRenewalReviewId(null);
      setReviewReason("");
      setRefreshKey((value) => value + 1);
    } catch (reviewError) {
      setActionError(reviewError.message || "Unable to review renewal request.");
    } finally {
      setBusy(false);
    }
  }

  async function markRead(notificationId) {
    setActionError("");
    try {
      if (notificationId === "all") {
        await markAllOfficerNotificationsRead(token);
      } else {
        await markOfficerNotificationRead(token, notificationId);
      }

      setRefreshKey((value) => value + 1);
    } catch (markError) {
      setActionError(markError.message || "Unable to update notification.");
    }
  }

  async function openNotification(item) {
    try {
      if (!item.is_read) {
        await markOfficerNotificationRead(token, item.id);
      }
    } catch (markError) {
      setActionError(markError.message || "Unable to mark notification as read.");
      return;
    }
    const relatedFdr = (data?.fdrs || []).find(
      (fdr) =>
        item.message?.includes(fdr.fdr_number) ||
        item.message?.includes(fdr.institution?.name)
    );
    if (relatedFdr) {
      viewFdr(relatedFdr.id);
    } else {
      navigate("/officer/verification");
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setBusy(true);
    setSettingsMessage("");
    setActionError("");
    try {
      const result = await updateOfficerProfile(token, {
        name: profile.name,
        email: profile.email
      });
      setProfile(result.user);
      localStorage.setItem("user", JSON.stringify({ ...currentUser, ...result.user }));
      setSettingsMessage("Officer profile saved.");
    } catch (saveError) {
      setActionError(saveError.message || "Unable to save profile.");
    } finally {
      setBusy(false);
    }
  }

  const institutionDetail = Number(searchParams.get("institution"))
    ? selectedInstitution
    : null;
  const institutions = data?.institutions || [];
  const releaseRequests = data?.requests || [];
  const notifications = data?.notifications || [];

  function renderFdrTable() {
    const rows = pageFdrs.map((fdr) => ({
      id: fdr.id,
      cells: [
        <strong className="ow-link" key="number">{fdr.fdr_number}</strong>,
        fdr.institution?.name || "—",
        fdr.bank_name || "—",
        formatAmount(fdr.amount),
        label(fdr.application?.application_type),
        formatDate(fdr.maturity_date),
        maturityStatus(fdr.maturity_date),
        label(fdr.status),
        label(fdr.verification_status),
        Number.isFinite(fdr.verification?.score) ? `${fdr.verification.score}/100` : "Pending",
        <button className="ow-button" key="view" onClick={() => viewFdr(fdr.id)}>View</button>
      ]
    }));
    return (
      <>
        <div className="ow-filters">
          <input aria-label="Search FDRs" placeholder="Search FDR, institution, AICTE code, bank, state" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {["PENDING", "VERIFIED", "FLAGGED", "FAILED", "REJECTED"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <select value={bankFilter} onChange={(event) => { setBankFilter(event.target.value); setPage(1); }}>
            <option value="">All banks</option>
            {[...new Set(fdrs.map((fdr) => fdr.bank_name).filter(Boolean))].map((bank) => <option key={bank}>{bank}</option>)}
          </select>
          <select value={applicationFilter} onChange={(event) => { setApplicationFilter(event.target.value); setPage(1); }}>
            <option value="">All application types</option>
            {["NEW_INSTITUTION", "NEW_PROGRAMME", "INCREASE_INTAKE", "RENEWAL", "REPLACEMENT", "MODIFICATION", "OTHER"].map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
          <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => { setPriorityFilter(event.target.value); setPage(1); }}>
            <option value="">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium / Low</option>
          </select>
          {currentSection === "verification" && <select aria-label="Filter by issue" value={issueFilter} onChange={(event) => { setIssueFilter(event.target.value); setPage(1); }}>
            <option value="">All review reasons</option><option value="DUPLICATE">Duplicate FDR</option><option value="AMOUNT_MISMATCH">Amount mismatch</option><option value="OCR_MISMATCH">OCR mismatch</option><option value="BANK_FAILED">Bank verification failure</option><option value="PENDING">Pending verification</option>
          </select>}
          <input aria-label="Submitted from date" type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          <input aria-label="Submitted through date" type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          <select aria-label="Filter by maturity status" value={expiryFilter} onChange={(event) => setExpiryFilter(event.target.value)}>
            <option value="">All maturity statuses</option><option value="NORMAL">Normal</option><option value="EXPIRING SOON">Expiring Soon</option><option value="CRITICAL">Critical</option><option value="MATURED">Matured</option>
          </select>
        </div>
        <Table
          columns={["FDR Number", "Institution", "Bank", "Amount", "Application", "Maturity Date", "Expiry", "Status", "Verification", "Score", "Action"]}
          rows={rows}
          empty={currentSection === "verification" ? "No pending or flagged FDRs need attention." : "No FDR records are available."}
        />
        <div className="ow-pagination">
          <span>{matchingFdrs.length} record(s)</span>
          <button className="ow-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button className="ow-button" disabled={page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      </>
    );
  }

  function renderContent() {
    if (currentSection === "fdrs" || currentSection === "verification") {
      return renderFdrTable();
    }
    if (currentSection === "institutions") {
      if (institutionDetail) {
        const institution = institutionDetail.institution;
        return (
          <div className="ow-stack">
            <button className="ow-button" onClick={() => { setSelectedInstitution(null); navigate("/officer/institutions"); }}>← Back to institutions</button>
            <section className="ow-card">
              <h2>Institution Information</h2>
              <div className="ow-grid">
                {[["Name", institution?.name], ["AICTE Code", institution?.aicte_code], ["Address", institution?.address], ["City", institution?.city], ["State", institution?.state], ["Email", institution?.email], ["FDRs", institutionDetail.fdrs?.length], ["Applications", institutionDetail.applications?.length], ["Compliance Score", institutionDetail.compliance ? `${institutionDetail.compliance.score}/${institutionDetail.compliance.maximumScore}` : "—"]].map(([heading, value]) => <div key={heading}><small>{heading}</small><strong>{value || "—"}</strong></div>)}
              </div>
            </section>
            <section className="ow-card">
              <h2>FDRs</h2>
              <Table columns={["FDR Number", "Bank", "Amount", "Status", "Verification", "Action"]} rows={(institutionDetail.fdrs || []).map((fdr) => ({ id: fdr.id, cells: [fdr.fdr_number, fdr.bank_name, formatAmount(fdr.amount), label(fdr.status), label(fdr.verification_status), <button className="ow-button" key="view" onClick={() => viewFdr(fdr.id)}>View</button>] }))} />
            </section>
            <section className="ow-card">
              <h2>Applications</h2>
              <Table columns={["Type", "Programme", "Level", "Discipline", "Academic Year", "Status", "Created"]} rows={(institutionDetail.applications || []).map((item) => ({ id: item.id, cells: [label(item.application_type), item.programme_name || "—", item.programme_level || "—", item.discipline || "—", item.academic_year || "—", label(item.status), formatDate(item.created_at)] }))} />
            </section>
            <section className="ow-card">
              <h2>Verification History & Documents</h2>
              <Table columns={["FDR", "Result", "Source", "Message", "Date"]} rows={(institutionDetail.verificationHistory || []).map((item) => ({ id: item.id, cells: [item.fdr_number, label(item.result), item.verification_source || "—", item.message || "—", formatDate(item.verified_at)] }))} />
              <Table columns={["FDR", "File", "Type", "Uploaded"]} rows={(institutionDetail.documents || []).map((item) => ({ id: item.id, cells: [item.fdr_number, item.file_name, label(item.document_type), formatDate(item.uploaded_at)] }))} />
            </section>
          </div>
        );
      }
      return (
        <>
          <div className="ow-filters"><input aria-label="Search institutions" placeholder="Search institution, AICTE code, city, state" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <Table columns={["Institution Name", "AICTE Code", "City", "State", "Email", "Total FDRs", "Verified", "Pending", "Compliance Score", "Action"]} rows={institutions.filter((item) => `${item.name} ${item.aicte_code} ${item.city} ${item.state} ${item.email}`.toLowerCase().includes(query.toLowerCase())).map((item) => ({ id: item.id, cells: [item.name, item.aicte_code, item.city || "—", item.state || "—", item.email || "—", item.total_fdrs || 0, item.verified_fdrs || 0, item.pending_fdrs || 0, `${item.compliance_score ?? 0}/100`, <button className="ow-button" key="view" onClick={() => navigate(`/officer/institutions?institution=${item.id}`)}>View details</button>] }))} empty="No institutions found." />
        </>
      );
    }
    if (currentSection === "release-requests") {
      return (
        <>
          {actionError && <p className="ow-error" role="alert">{actionError}</p>}
          <Table columns={["Request ID", "Institution", "FDR Number", "Reason", "Status", "Created", "Reviewed", "Action"]} rows={releaseRequests.map((item) => ({ id: item.id, cells: [item.id, item.institution_name, item.fdr_number, item.reason, label(item.status), formatDate(item.created_at), item.reviewer_name ? `${item.reviewer_name} · ${formatDate(item.reviewed_at)}` : "—", item.status === "PENDING" ? <button className="ow-button" key="review" onClick={() => { setReviewId(item.id); setActionError(""); }}>Review</button> : "—"] }))} empty="No release requests have been submitted." />
          {reviewId && <div className="ow-card ow-review"><h2>Review request #{reviewId}</h2><label>Decision reason<textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} /></label><div className="ow-actions"><button className="ow-button" disabled={busy} onClick={() => reviewRelease(reviewId, "APPROVE")}>Approve</button><button className="ow-button ow-danger" disabled={busy} onClick={() => reviewRelease(reviewId, "REJECT")}>Reject</button><button className="ow-button ow-muted" onClick={() => setReviewId(null)}>Cancel</button></div></div>}
        </>
      );
    }
    if (currentSection === "notifications") {
      return (
        <>
          <div className="ow-actions"><span>{data?.unreadCount || 0} unread</span><button className="ow-button" onClick={() => markRead("all")}>Mark all as read</button></div>
          {actionError && <p className="ow-error" role="alert">{actionError}</p>}
          {notifications.length ? notifications.map((item) => (
            <article className={`ow-card ow-notification ${item.is_read ? "" : "unread"}`} key={item.id}>
              <button className="ow-notification-message" onClick={() => openNotification(item)}><strong>{item.message}</strong><small>{label(item.type)} · {formatDate(item.created_at)} · Open related record</small></button>
              {!item.is_read && <button className="ow-button" onClick={() => markRead(item.id)}>Mark read</button>}
            </article>
          )) : <div className="ow-empty">No officer notifications have been recorded.</div>}
        </>
      );
    }
    if (currentSection === "reports") {
      const reportStats = data?.stats || {};
      const maxBankCount = Math.max(1, ...(data?.byBank || []).map((bank) => bank.count));
      return (
        <div className="ow-stack">
          <section className="ow-grid ow-metrics">
            {[["Total FDRs", reportStats.total_fdrs], ["Verified", reportStats.verified], ["Pending", reportStats.pending], ["Flagged", reportStats.flagged], ["Failed", reportStats.failed], ["Institutions", reportStats.institutions], ["Deposits", formatAmount(reportStats.total_deposit_amount)]].map(([heading, value]) => <div className="ow-card" key={heading}><small>{heading}</small><strong>{value ?? 0}</strong></div>)}
          </section>
          <section className="ow-card"><h2>Bank-wise distribution</h2>{(data?.byBank || []).map((bank) => <div className="ow-bar-row" key={bank.label}><span>{bank.label}</span><div><i style={{ width: `${Math.max(3, bank.count / maxBankCount * 100)}%` }} /></div><strong>{bank.count} · {formatAmount(bank.amount)}</strong></div>)}</section>
          <section className="ow-card"><h2>Application type distribution</h2><Table columns={["Application Type", "FDR Count"]} rows={(data?.byApplicationType || []).map((item) => ({ id: item.label, cells: [label(item.label), item.count] }))} /></section>
          <section className="ow-card"><h2>Expiry distribution</h2><Table columns={["Matured", "Critical (<30 days)", "Expiring (30–90 days)", "Normal (>90 days)"]} rows={[{ id: "expiry", cells: [data?.expiry?.matured || 0, data?.expiry?.critical || 0, data?.expiry?.expiring_soon || 0, data?.expiry?.normal || 0] }]} /></section>
        </div>
      );
    }
    if (currentSection === "audit-log") {
      return <Table columns={["User", "Action", "Entity", "Entity ID", "Old Value", "New Value", "Date/Time"]} rows={(data?.logs || []).map((item) => ({ id: item.id, cells: [item.user_name || item.user_email || "Unknown", label(item.action), label(item.entity_type), item.entity_id ?? "—", <pre key="old">{item.old_value || "—"}</pre>, <pre key="new">{item.new_value || "—"}</pre>, formatDate(item.created_at)] }))} empty="No audit events have been recorded." />;
    }
    if (currentSection === "users") {
      return <Table columns={["Name", "Email", "Role", "Created At"]} rows={(data?.users || []).map((item) => ({ id: item.id, cells: [item.name, item.email, label(item.role), formatDate(item.created_at)] }))} empty="No users found." />;
    }
    if (currentSection === "renewals") {
      const renewalRequests = data?.renewals || [];
      return (
        <>
          {actionError && <p className="ow-error" role="alert">{actionError}</p>}
          <Table
            columns={["Old FDR", "New FDR", "Institution", "Requested Maturity", "Request Date", "Status", "Action"]}
            rows={renewalRequests.map((item) => ({
              id: item.id,
              cells: [
                item.old_fdr_number,
                item.new_fdr_number || "Not submitted",
                item.institution_name,
                formatDate(item.requested_maturity_date),
                formatDate(item.renewal_date),
                label(item.status),
                item.new_fdr_id
                  ? <button className="ow-button" key="view" onClick={() => viewFdr(item.new_fdr_id)}>View new FDR</button>
                  : ["APPROVED", "REJECTED"].includes(item.status)
                    ? "Reviewed"
                    : <button className="ow-button" key="review" onClick={() => {
                        setRenewalReviewId(item.id);
                        setReviewReason("");
                        setActionError("");
                      }}>Review</button>
              ]
            }))}
            empty="No renewal requests have been submitted."
          />
          {renewalReviewId && (
            <section className="ow-card ow-review">
              <h2>Review renewal request #{renewalReviewId}</h2>
              <label>
                Review reason
                <textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} />
              </label>
              <div className="ow-actions">
                <button className="ow-button" disabled={busy} onClick={() => reviewRenewal(renewalReviewId, "UNDER_REVIEW")}>Under Review</button>
                <button className="ow-button" disabled={busy} onClick={() => reviewRenewal(renewalReviewId, "APPROVED")}>Approve</button>
                <button className="ow-button ow-muted" disabled={busy} onClick={() => reviewRenewal(renewalReviewId, "ACTION_REQUIRED")}>Request Action</button>
                <button className="ow-button ow-danger" disabled={busy} onClick={() => reviewRenewal(renewalReviewId, "REJECTED")}>Reject</button>
                <button className="ow-button ow-muted" disabled={busy} onClick={() => setRenewalReviewId(null)}>Cancel</button>
              </div>
            </section>
          )}
        </>
      );
    }
    if (currentSection === "master-data") {
      return (
        <div className="ow-grid">
          {[
            ["Banks", data?.banks],
            ["Application Types", data?.applicationTypes],
            ["Programme Levels", data?.programmeLevels],
            ["Disciplines", data?.disciplines],
            ["States", data?.states]
          ].map(([heading, items]) => <section className="ow-card" key={heading}><h2>{heading}</h2>{items?.length ? <ul>{items.map((item) => <li key={item}>{label(item)}</li>)}</ul> : <p className="ow-subtle">No values in existing records.</p>}</section>)}
          <p className="ow-subtle">These lists are derived from existing database values and application configuration. Master data is view-only because no master-data tables or editing workflow exist.</p>
        </div>
      );
    }
    if (currentSection === "settings") {
      const preferences = JSON.parse(localStorage.getItem("officerNotificationPreferences") || '{"inApp":true,"email":false}');
      return (
        <div className="ow-stack">
          {profile && <form className="ow-card ow-form" onSubmit={saveProfile}><h2>Officer Profile</h2><label>Name<input value={profile.name || ""} onChange={(event) => setProfile({ ...profile, name: event.target.value })} required /></label><label>Email<input type="email" value={profile.email || ""} onChange={(event) => setProfile({ ...profile, email: event.target.value })} required /></label><button className="ow-button" disabled={busy}>Save profile</button>{settingsMessage && <p className="ow-success">{settingsMessage}</p>}{actionError && <p className="ow-error">{actionError}</p>}</form>}
          <section className="ow-card ow-form"><h2>Notification Preferences</h2><label className="ow-check"><input type="checkbox" checked={preferences.inApp} onChange={(event) => { const next = { ...preferences, inApp: event.target.checked }; localStorage.setItem("officerNotificationPreferences", JSON.stringify(next)); setRefreshKey((value) => value + 1); }} />In-app notifications</label><label className="ow-check"><input type="checkbox" checked={preferences.email} onChange={(event) => { const next = { ...preferences, email: event.target.checked }; localStorage.setItem("officerNotificationPreferences", JSON.stringify(next)); setRefreshKey((value) => value + 1); }} />Email preference (saved locally; email delivery is not configured)</label></section>
        </div>
      );
    }
    if (currentSection === "help") {
      return <div className="ow-stack"><section className="ow-card"><h2>FDR verification workflow</h2><p>Institutions submit an application, FDR details, and a document. Automated checks, OCR results (when configured), and bank verification are displayed separately from the officer’s recorded decision.</p></section><section className="ow-card"><h2>Document requirements</h2><p>Upload a clear, readable FDR document in an accepted file format. The current OCR adapter is not configured, so documents require manual review until an OCR provider is integrated.</p></section><section className="ow-card"><h2>Frequently Asked Questions</h2><details><summary>Why is a newly submitted FDR pending?</summary><p>Submission is not verification. It remains pending until required checks and a bank provider response are available.</p></details><details><summary>Is bank verification connected to a real bank?</summary><p>No. The current provider is a clearly labelled mock adapter and does not contact financial institutions.</p></details><details><summary>How do I report a portal issue?</summary><p>Contact the AICTE portal administrator through your organization’s approved support channel.</p></details></section></div>;
    }
    return <div className="ow-empty">This officer page is not available.</div>;
  }

  return (
    <div className="ow-layout">
      <style>{`
        .ow-layout{min-height:100vh;display:flex;background:#f3f6fa;color:#10233f;font-family:Arial,Helvetica,sans-serif}
        .ow-sidebar{position:fixed;inset:0 auto 0 0;width:220px;min-width:220px;box-sizing:border-box;background:#06264d;color:#fff;overflow:auto}
        .ow-brand{height:82px;display:flex;align-items:center;gap:12px;padding:12px 16px;background:#fff;color:#09284e;font-weight:700}
        .ow-logo{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#f4c542;border:3px solid #e4b12c;font-size:12px}
        .ow-brand small{display:block;color:#53657d;font-weight:400;margin-top:4px}
        .ow-nav{padding:14px 0}.ow-nav a{display:flex;gap:12px;align-items:center;padding:12px 18px;color:#dbe8f7;text-decoration:none;border-left:3px solid transparent;font-size:13px}
        .ow-nav a:hover,.ow-nav a.active{background:#0d4b91;color:#fff;border-left-color:#4ba3ff}
        .ow-main{margin-left:220px;width:calc(100% - 220px);min-width:0}
        .ow-header{height:72px;display:flex;align-items:center;justify-content:space-between;padding:0 24px;background:#fff;border-bottom:1px solid #e1e7ef}
        .ow-header h1{font-size:19px;margin:0}.ow-header a{color:#0767b8;text-decoration:none}
        .ow-header-actions{display:flex;align-items:center;gap:16px}
        .ow-logout{min-height:36px;padding:0 12px;border:1px solid #cbd7e5;border-radius:5px;background:#fff;color:#ad2533;font-size:11px;font-weight:700;cursor:pointer}
        .ow-content{padding:22px;max-width:1500px;margin:auto}.ow-card{background:#fff;border:1px solid #dfe6ee;border-radius:9px;padding:16px;min-width:0}
        .ow-card h2{font-size:15px;margin:0 0 14px}.ow-stack{display:grid;gap:13px}.ow-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .ow-grid small,.ow-metrics small{display:block;color:#718196;font-size:11px;margin-bottom:6px}.ow-grid strong,.ow-metrics strong{overflow-wrap:anywhere}
        .ow-table-wrap{overflow:auto;background:white;border:1px solid #e1e7ef;border-radius:8px}.ow-table{width:100%;border-collapse:collapse;font-size:12px}
        .ow-table th{text-align:left;background:#f8fafc;color:#596d84;font-size:10px;text-transform:uppercase;white-space:nowrap}
        .ow-table th,.ow-table td{padding:10px;border-bottom:1px solid #edf0f4;vertical-align:top}.ow-table tr:last-child td{border-bottom:0}
        .ow-table pre{max-width:220px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:10px;margin:0}
        .ow-empty{padding:24px!important;text-align:center;color:#718196}.ow-filters{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
        .ow-filters input,.ow-filters select,.ow-form input:not([type=checkbox]),.ow-review textarea{min-height:36px;border:1px solid #d6dee9;border-radius:5px;padding:7px 10px;background:#fff;color:#304d70}
        .ow-filters input{flex:1;min-width:230px}.ow-button{border:1px solid #cbd7e5;background:#f8fbff;color:#075ea8;padding:7px 11px;border-radius:5px;cursor:pointer;font-size:11px}
        .ow-button:disabled{opacity:.55;cursor:not-allowed}.ow-danger{color:#ad2533}.ow-muted{color:#536981}
        .ow-link{color:#0767b8}.ow-pagination,.ow-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;margin:12px 0}
        .ow-pagination span:first-child{margin-right:auto;color:#718196;font-size:12px}.ow-error{color:#ad2533;background:#fff0f1;padding:10px;border-radius:6px}
        .ow-success{color:#087b43}.ow-subtle{color:#718196;font-size:12px}.ow-notification{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}
        .ow-notification small{display:block;color:#718196;margin-top:6px}.ow-notification.unread{border-left:4px solid #1674bb;background:#f5faff}
        .ow-notification-message{border:0;background:transparent;color:inherit;text-align:left;padding:0;cursor:pointer;font:inherit}
        .ow-review{margin-top:16px}.ow-review label,.ow-form label{display:grid;gap:6px;margin:10px 0;font-size:12px}
        .ow-review textarea{min-height:75px}.ow-form input:not([type=checkbox]){max-width:500px;width:100%}.ow-check{display:flex!important;align-items:center}
        .ow-metrics{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.ow-metrics .ow-card strong{font-size:20px}
        .ow-bar-row{display:grid;grid-template-columns:minmax(110px,180px) 1fr minmax(120px,auto);gap:12px;align-items:center;margin:12px 0;font-size:11px}
        .ow-bar-row>div{height:12px;border-radius:10px;background:#edf2f7;overflow:hidden}.ow-bar-row i{display:block;height:100%;background:#4c9be8;border-radius:10px}
        @media(max-width:950px){.ow-sidebar{width:75px;min-width:75px}.ow-brand{justify-content:center;padding:8px}.ow-brand>span:last-child,.ow-nav a span:last-child{display:none}.ow-nav a{justify-content:center;padding:14px}.ow-main{margin-left:75px;width:calc(100% - 75px)}.ow-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:600px){.ow-header{padding:0 12px}.ow-content{padding:12px}.ow-grid{grid-template-columns:1fr}.ow-bar-row{grid-template-columns:1fr auto}.ow-bar-row>div{grid-column:1/-1;grid-row:2}.ow-bar-row strong{grid-column:2;grid-row:1}.ow-pagination{flex-wrap:wrap}}
      `}</style>
      <aside className="ow-sidebar">
        <div className="ow-brand"><span className="ow-logo">AICTE</span><span>AICTE FDR Portal<small>Officer Workspace</small></span></div>
        <nav className="ow-nav">{navItems.map(([name, href, icon]) => <Link key={href} className={(href === `/officer/${currentSection}` || (href === "/officer" && !currentSection)) ? "active" : ""} to={href}><span>{icon}</span><span>{name}</span></Link>)}</nav>
      </aside>
      <main className="ow-main">
        <header className="ow-header"><h1>{titles[currentSection] || "Officer Workspace"}</h1><div className="ow-header-actions"><Link to="/officer">← Dashboard</Link><button className="ow-logout" type="button" onClick={handleLogout}>Logout</button></div></header>
        <section className="ow-content">
          <div className="ow-actions" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <span className="ow-subtle">Signed in as {currentUser.name || "Officer"}</span>
            <button className="ow-button" onClick={() => setRefreshKey((value) => value + 1)}>Refresh</button>
          </div>
          {loading ? <div className="ow-card" role="status">Loading {titles[currentSection]?.toLowerCase() || "page"}…</div>
            : error ? <div className="ow-error" role="alert">{error} <button className="ow-button" onClick={() => setRefreshKey((value) => value + 1)}>Try again</button></div>
              : renderContent()}
        </section>
      </main>
    </div>
  );
}
