import { useState, useMemo, useCallback } from "react";
import "./OfficerAuditLog.css";

// Human-friendly rule descriptions
const RULE_TITLES = {
  R1: "Duplicate FDR Number Detected",
  R2: "Tenor Inversion (Maturity Precedes Issue)",
  R4: "Deposit Amount Ledger Mismatch",
  R7: "Unconfirmed Partner Bank API",
  R9: "Statutory 3-Year Lock-In Moratorium Active",
  R13: "Vigilance & Legal Compliance Scrutiny Hold"
};

// Friendly action labels
const ACTION_LABELS = {
  OFFICER_REVIEWED: "Officer Scrutiny & Review",
  FDR_VERIFIED: "FDR Lien Verified & Endorsed",
  BANK_VERIFICATION_PASS: "Bank Direct Verification (Pass)",
  BANK_VERIFICATION_FAIL: "Bank Direct Verification (Flagged)",
  FDR_SUBMITTED: "Security Deposit Submitted",
  DOCUMENT_UPLOADED: "Fixed Deposit Receipt Uploaded",
  OCR_COMPLETED: "Automated OCR Extraction",
  INGESTION_VALIDATED: "Checksum & Ingestion Validated",
  RELEASE_REQUESTED: "Collateral Release Requested",
  RENEWAL_WINDOW_OPENED: "Statutory Renewal Window Opened",
  MATURITY_ALERT_GENERATED: "Statutory Maturity Alert",
  NOTIFICATION_MARKED_READ: "Notification Read"
};

// Date formatter
function formatAuditDate(value) {
  if (!value) return { dateStr: "—", timeStr: "—", relative: "" };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { dateStr: String(value), timeStr: "", relative: "" };

  const dateStr = d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  const timeStr = d.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });

  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  let relative = "";
  if (diffDays === 0) relative = "Today";
  else if (diffDays === 1) relative = "Yesterday";
  else if (diffDays < 7) relative = `${diffDays}d ago`;

  return { dateStr, timeStr, relative };
}

// Currency formatter
function formatCurrency(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return null;
  const num = Number(amount);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${num.toLocaleString("en-IN")}`;
}

// Intelligent audit record parser
export function parseAuditRecord(item) {
  let newValue = null;
  let oldValue = null;

  if (item.new_value) {
    if (typeof item.new_value === "object") {
      newValue = item.new_value;
    } else {
      try {
        newValue = JSON.parse(item.new_value);
      } catch {
        newValue = { raw: item.new_value };
      }
    }
  }

  if (item.old_value) {
    if (typeof item.old_value === "object") {
      oldValue = item.old_value;
    } else {
      try {
        oldValue = JSON.parse(item.old_value);
      } catch {
        oldValue = { raw: item.old_value };
      }
    }
  }

  const action = (item.action || "").toUpperCase();

  // Extract decision
  let rawDecision = "";
  if (newValue?.decision) {
    rawDecision = String(newValue.decision).toUpperCase();
  } else if (newValue?.verificationStatus) {
    rawDecision = String(newValue.verificationStatus).toUpperCase();
  } else if (action === "FDR_VERIFIED" || action === "BANK_VERIFICATION_PASS") {
    rawDecision = "VERIFIED";
  } else if (action === "BANK_VERIFICATION_FAIL") {
    rawDecision = "FLAGGED";
  } else if (action === "OFFICER_REVIEWED") {
    rawDecision = "REVIEWED";
  } else if (action === "RELEASE_REQUESTED") {
    rawDecision = "RELEASE_REQUESTED";
  } else if (action === "FDR_SUBMITTED" || action === "DOCUMENT_UPLOADED") {
    rawDecision = "SUBMITTED";
  } else if (action === "MATURITY_ALERT_GENERATED") {
    rawDecision = "ALERT";
  }

  // Normalized status
  let normalizedStatus = "INFO";
  if (["FLAGGED", "FAILED"].includes(rawDecision)) normalizedStatus = "FLAGGED";
  else if (["VERIFIED", "APPROVED", "PASS"].includes(rawDecision)) normalizedStatus = "VERIFIED";
  else if (["REJECTED"].includes(rawDecision)) normalizedStatus = "REJECTED";
  else if (["REVIEWED", "UNDER_REVIEW"].includes(rawDecision)) normalizedStatus = "REVIEWED";
  else if (["SUBMITTED", "DOCUMENT_UPLOADED", "INGESTION_VALIDATED"].includes(rawDecision)) normalizedStatus = "SUBMITTED";
  else if (["RELEASE_REQUESTED"].includes(rawDecision)) normalizedStatus = "RELEASE_REQUESTED";
  else if (["ALERT", "MATURED"].includes(rawDecision)) normalizedStatus = "ALERT";

  // Rule extraction
  const ruleCode = newValue?.rule_code || oldValue?.rule_code || null;
  const ruleTitle = ruleCode ? RULE_TITLES[ruleCode] || `Rule ${ruleCode}` : null;
  const ruleReason = newValue?.rule_reason || oldValue?.rule_reason || null;
  const remark = newValue?.remark || newValue?.review_reason || null;

  // Metadata parameters
  const fdrNumber = newValue?.fdrNumber || newValue?.fdr_number || oldValue?.fdrNumber || null;
  const bank = newValue?.bank || newValue?.bank_name || oldValue?.bank || null;
  const amount = newValue?.amount || oldValue?.amount || null;
  const formattedAmount = formatCurrency(amount);
  const confidence = newValue?.confidence != null ? `${Math.round(newValue.confidence * 100)}%` : null;
  const fileName = newValue?.fileName || newValue?.file_name || null;
  const clearanceProgress = newValue?.clearance_progress || null;

  // Actor classification
  const email = (item.user_email || "").toLowerCase();
  const name = item.user_name || "AICTE Regulation Officer";
  let actorCategory = "SYSTEM";
  let actorRole = "Compliance Automation";
  let avatarInitials = "SYS";
  let avatarClass = "system";

  if (email.includes("officer") || name.toLowerCase().includes("officer")) {
    actorCategory = "OFFICER";
    actorRole = "AICTE Regulation Bureau";
    avatarInitials = "RO";
    avatarClass = "officer";
  } else if (email.includes("aicte-portal.in") || item.user_id) {
    actorCategory = "INSTITUTION";
    actorRole = "Registered Institution";
    avatarInitials = name.slice(0, 2).toUpperCase() || "IN";
    avatarClass = "institution";
  }

  // Action Category
  let actionCategory = "SYSTEM";
  if (action === "OFFICER_REVIEWED" || actorCategory === "OFFICER") {
    actionCategory = "OFFICER";
  } else if (action.includes("VERIFICATION") || action === "FDR_VERIFIED" || action === "OCR_COMPLETED") {
    actionCategory = "VERIFICATION";
  } else if (action === "FDR_SUBMITTED" || action === "DOCUMENT_UPLOADED" || action === "RELEASE_REQUESTED") {
    actionCategory = "SUBMISSION";
  } else if (action.includes("ALERT") || action.includes("WINDOW") || action === "INGESTION_VALIDATED") {
    actionCategory = "ALERT";
  }

  const { dateStr, timeStr, relative } = formatAuditDate(item.created_at);

  return {
    ...item,
    parsedNew: newValue,
    parsedOld: oldValue,
    rawDecision,
    normalizedStatus,
    ruleCode,
    ruleTitle,
    ruleReason,
    remark,
    fdrNumber,
    bank,
    amount,
    formattedAmount,
    confidence,
    fileName,
    clearanceProgress,
    actionLabel: ACTION_LABELS[action] || action.replace(/_/g, " "),
    actionCategory,
    actorCategory,
    actorRole,
    avatarInitials,
    avatarClass,
    dateStr,
    timeStr,
    relative
  };
}

// CSV export helper
function exportAuditToCsv(parsedRecords) {
  const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const headers = [
    "Event ID",
    "Timestamp",
    "Actor Name",
    "Actor Email",
    "Actor Role",
    "Action",
    "Entity Type",
    "Entity ID",
    "Compliance Decision",
    "Rule Code",
    "Rule Reason",
    "Officer Remark",
    "FDR Number",
    "Bank",
    "Amount",
    "New Value Payload"
  ];

  const rows = parsedRecords.map((r) => [
    r.id,
    `${r.dateStr} ${r.timeStr}`,
    r.user_name || "AICTE Officer",
    r.user_email || "officer@aicte.gov.in",
    r.actorRole,
    r.actionLabel,
    r.entity_type,
    r.entity_id ?? "—",
    r.normalizedStatus,
    r.ruleCode || "—",
    r.ruleReason || "—",
    r.remark || "—",
    r.fdrNumber || "—",
    r.bank || "—",
    r.formattedAmount || "—",
    typeof r.new_value === "string" ? r.new_value : JSON.stringify(r.new_value || {})
  ]);

  const headerLine = headers.map(escapeCsv).join(",");
  const rowLines = rows.map((row) => row.map(escapeCsv).join(","));
  const csvContent = "\uFEFF" + [headerLine, ...rowLines].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `AICTE_Audit_Compliance_Trail_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function OfficerAuditLog({ logs = [], onRefresh, isLoading = false, onSelectFdr }) {
  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [actionCategoryFilter, setActionCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [actorFilter, setActorFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL");
  const [viewMode, setViewMode] = useState("table"); // "table" or "timeline"
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedLog, setSelectedLog] = useState(null);
  const [rawPayloadExpanded, setRawPayloadExpanded] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Parse all logs
  const parsedLogs = useMemo(() => {
    return (logs || []).map(parseAuditRecord);
  }, [logs]);

  // Dynamic KPI calculations
  const kpis = useMemo(() => {
    const total = parsedLogs.length;
    let officerActions = 0;
    let verificationEvents = 0;
    let flaggedDecisions = 0;

    parsedLogs.forEach((r) => {
      if (r.actionCategory === "OFFICER" || r.actorCategory === "OFFICER") officerActions++;
      if (r.actionCategory === "VERIFICATION") verificationEvents++;
      if (r.normalizedStatus === "FLAGGED") flaggedDecisions++;
    });

    return {
      total,
      officerActions,
      verificationEvents,
      flaggedDecisions
    };
  }, [parsedLogs]);

  // Filtering
  const filteredLogs = useMemo(() => {
    const now = new Date();
    const query = searchQuery.trim().toLowerCase();

    return parsedLogs.filter((r) => {
      // Search
      if (query) {
        const matchesQuery =
          String(r.id).includes(query) ||
          String(r.user_name || "").toLowerCase().includes(query) ||
          String(r.user_email || "").toLowerCase().includes(query) ||
          String(r.action || "").toLowerCase().includes(query) ||
          String(r.actionLabel || "").toLowerCase().includes(query) ||
          String(r.entity_type || "").toLowerCase().includes(query) ||
          String(r.entity_id || "").toLowerCase().includes(query) ||
          String(r.fdrNumber || "").toLowerCase().includes(query) ||
          String(r.bank || "").toLowerCase().includes(query) ||
          String(r.ruleCode || "").toLowerCase().includes(query) ||
          String(r.ruleReason || "").toLowerCase().includes(query) ||
          String(r.remark || "").toLowerCase().includes(query);

        if (!matchesQuery) return false;
      }

      // Action category
      if (actionCategoryFilter !== "ALL" && r.actionCategory !== actionCategoryFilter) {
        return false;
      }

      // Status
      if (statusFilter !== "ALL" && r.normalizedStatus !== statusFilter) {
        return false;
      }

      // Actor
      if (actorFilter !== "ALL" && r.actorCategory !== actorFilter) {
        return false;
      }

      // Date range
      if (dateFilter !== "ALL" && r.created_at) {
        const d = new Date(r.created_at);
        const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
        if (dateFilter === "TODAY" && diffHours > 24) return false;
        if (dateFilter === "7DAYS" && diffHours > 24 * 7) return false;
        if (dateFilter === "30DAYS" && diffHours > 24 * 30) return false;
      }

      return true;
    });
  }, [parsedLogs, searchQuery, actionCategoryFilter, statusFilter, actorFilter, dateFilter]);

  // Reset pagination when filter changes
  const handleFilterChange = useCallback((setter, val) => {
    setter(val);
    setCurrentPage(1);
  }, []);

  // Quick filter toggle from KPI cards
  const handleKpiCardClick = (type) => {
    if (type === "FLAGGED") {
      setStatusFilter((prev) => (prev === "FLAGGED" ? "ALL" : "FLAGGED"));
    } else if (type === "OFFICER") {
      setActionCategoryFilter((prev) => (prev === "OFFICER" ? "ALL" : "OFFICER"));
    } else if (type === "VERIFICATION") {
      setActionCategoryFilter((prev) => (prev === "VERIFICATION" ? "ALL" : "VERIFICATION"));
    } else {
      // Clear filters
      clearAllFilters();
    }
    setCurrentPage(1);
  };

  const clearAllFilters = useCallback(() => {
    setSearchQuery("");
    setActionCategoryFilter("ALL");
    setStatusFilter("ALL");
    setActorFilter("ALL");
    setDateFilter("ALL");
    setCurrentPage(1);
  }, []);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    actionCategoryFilter !== "ALL" ||
    statusFilter !== "ALL" ||
    actorFilter !== "ALL" ||
    dateFilter !== "ALL";

  // Pagination slice
  const paginatedLogs = useMemo(() => {
    if (pageSize === "ALL") return filteredLogs;
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const totalPages = pageSize === "ALL" ? 1 : Math.ceil(filteredLogs.length / pageSize) || 1;

  // Grouped timeline items
  const timelineGroups = useMemo(() => {
    const groups = {};
    filteredLogs.forEach((item) => {
      const key = item.dateStr || "Unknown Date";
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return groups;
  }, [filteredLogs]);

  // Copy helper
  const handleCopy = (text, logId) => {
    navigator.clipboard?.writeText(String(text));
    setCopiedId(logId);
    setTimeout(() => setCopiedId(null), 1800);
  };

  return (
    <div className="audit-container">
      {/* 1. HERO HEADER */}
      <section className="audit-hero-card">
        <div className="audit-hero-content">
          <div className="audit-hero-badge">
            <span className="audit-badge-dot" />
            Immutable Audit Trail & Compliance Register
          </div>
          <h1 className="audit-hero-title">Audit & Compliance Trail</h1>
          <p className="audit-hero-subtitle">
            Complete cryptographic history of verification checks, officer scrutiny decisions, bank confirms, and regulatory actions.
          </p>
          <div className="audit-hero-subbar">
            <span>System Activity</span>
            <span>•</span>
            <span>Officer actions</span>
            <span>•</span>
            <span>Verification decisions</span>
            <span>•</span>
            <span>Compliance events</span>
          </div>
        </div>

        <div className="audit-hero-actions">
          {hasActiveFilters && (
            <button
              type="button"
              className="audit-action-btn secondary"
              onClick={clearAllFilters}
              title="Reset all active filters"
            >
              Reset Filters
            </button>
          )}

          <button
            type="button"
            className="audit-action-btn secondary"
            onClick={() => exportAuditToCsv(filteredLogs)}
            title="Export filtered records to CSV"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Trail (CSV)
          </button>

          <button
            type="button"
            className="audit-action-btn primary"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh latest audit events from database"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className={isLoading ? "spin-icon" : ""}
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isLoading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </section>

      {/* 2. SUMMARY KPI METRIC STRIP */}
      <section className="audit-kpi-grid">
        <div
          className="audit-kpi-card kpi-total"
          onClick={() => handleKpiCardClick("ALL")}
          title="Click to view all audit events"
        >
          <div className="audit-kpi-text">
            <span className="audit-kpi-label">Total Events</span>
            <div className="audit-kpi-value">{kpis.total}</div>
            <span className="audit-kpi-sub">Immutable audit entries logged</span>
          </div>
          <div className="audit-kpi-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
        </div>

        <div
          className={`audit-kpi-card kpi-officer ${actionCategoryFilter === "OFFICER" ? "active-kpi-filter" : ""}`}
          onClick={() => handleKpiCardClick("OFFICER")}
          title="Click to filter by officer review actions"
        >
          <div className="audit-kpi-text">
            <span className="audit-kpi-label">Officer Actions</span>
            <div className="audit-kpi-value">{kpis.officerActions}</div>
            <span className="audit-kpi-sub">Direct regulatory decisions</span>
          </div>
          <div className="audit-kpi-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        </div>

        <div
          className={`audit-kpi-card kpi-verified ${actionCategoryFilter === "VERIFICATION" ? "active-kpi-filter" : ""}`}
          onClick={() => handleKpiCardClick("VERIFICATION")}
          title="Click to filter by verification events"
        >
          <div className="audit-kpi-text">
            <span className="audit-kpi-label">Verification Events</span>
            <div className="audit-kpi-value">{kpis.verificationEvents}</div>
            <span className="audit-kpi-sub">Bank & OCR automated checks</span>
          </div>
          <div className="audit-kpi-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <div
          className={`audit-kpi-card kpi-flagged ${statusFilter === "FLAGGED" ? "active-kpi-filter" : ""}`}
          onClick={() => handleKpiCardClick("FLAGGED")}
          title="Click to filter by flagged decisions & discrepancies"
        >
          <div className="audit-kpi-text">
            <span className="audit-kpi-label">Flagged Decisions</span>
            <div className="audit-kpi-value">{kpis.flaggedDecisions}</div>
            <span className="audit-kpi-sub">Discrepancies & scrutiny holds</span>
          </div>
          <div className="audit-kpi-icon-wrap">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>
      </section>

      {/* 3. SEARCH & FILTER TOOLBAR */}
      <section className="audit-toolbar">
        <div className="audit-toolbar-row-top">
          <div className="audit-search-wrap">
            <svg className="audit-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="audit-search-input"
              placeholder="Search by actor, action, entity ID, FDR #, rule, reason, or remark…"
              value={searchQuery}
              onChange={(e) => handleFilterChange(setSearchQuery, e.target.value)}
            />
            {searchQuery && (
              <button
                type="button"
                className="audit-search-clear"
                onClick={() => handleFilterChange(setSearchQuery, "")}
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          <div className="audit-view-toggle">
            <button
              type="button"
              className={`audit-toggle-btn ${viewMode === "table" ? "active" : ""}`}
              onClick={() => setViewMode("table")}
              title="Structured Table View"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              Table View
            </button>
            <button
              type="button"
              className={`audit-toggle-btn ${viewMode === "timeline" ? "active" : ""}`}
              onClick={() => setViewMode("timeline")}
              title="Chronological Audit Timeline"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Timeline View
            </button>
          </div>
        </div>

        <div className="audit-toolbar-row-filters">
          <div className="audit-filter-item">
            <span>Action Type:</span>
            <select
              className="audit-select"
              value={actionCategoryFilter}
              onChange={(e) => handleFilterChange(setActionCategoryFilter, e.target.value)}
            >
              <option value="ALL">All Actions</option>
              <option value="OFFICER">Officer Scrutiny / Review</option>
              <option value="VERIFICATION">Bank & Verification</option>
              <option value="SUBMISSION">Submissions & Uploads</option>
              <option value="ALERT">Alerts & Automation</option>
            </select>
          </div>

          <div className="audit-filter-item">
            <span>Decision:</span>
            <select
              className="audit-select"
              value={statusFilter}
              onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
            >
              <option value="ALL">All Outcomes</option>
              <option value="FLAGGED">FLAGGED</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="REVIEWED">REVIEWED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="SUBMITTED">SUBMITTED</option>
              <option value="ALERT">ALERT</option>
            </select>
          </div>

          <div className="audit-filter-item">
            <span>Actor / Role:</span>
            <select
              className="audit-select"
              value={actorFilter}
              onChange={(e) => handleFilterChange(setActorFilter, e.target.value)}
            >
              <option value="ALL">All Actors</option>
              <option value="OFFICER">AICTE Officers</option>
              <option value="INSTITUTION">Institutions</option>
              <option value="SYSTEM">System Automation</option>
            </select>
          </div>

          <div className="audit-filter-item">
            <span>Time Window:</span>
            <select
              className="audit-select"
              value={dateFilter}
              onChange={(e) => handleFilterChange(setDateFilter, e.target.value)}
            >
              <option value="ALL">All Time</option>
              <option value="TODAY">Last 24 Hours</option>
              <option value="7DAYS">Last 7 Days</option>
              <option value="30DAYS">Last 30 Days</option>
            </select>
          </div>

          <span className="audit-count-pill">
            Showing <strong>{filteredLogs.length}</strong> of {parsedLogs.length} audit records
          </span>

          {hasActiveFilters && (
            <button
              type="button"
              className="audit-clear-filters-btn"
              onClick={clearAllFilters}
            >
              ✕ Clear Filters
            </button>
          )}
        </div>
      </section>

      {/* 4. CONTENT AREA: TABLE VIEW OR TIMELINE VIEW */}
      {filteredLogs.length === 0 ? (
        <section className="audit-empty-state">
          <div className="audit-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3 className="audit-empty-title">No audit events found</h3>
          <p className="audit-empty-sub">
            No audit records match the current filter criteria or search query. Try broadening your search or resetting filters.
          </p>
          <button type="button" className="audit-action-btn primary" onClick={clearAllFilters}>
            Clear All Filters
          </button>
        </section>
      ) : viewMode === "table" ? (
        <section className="audit-table-card">
          <div className="audit-table-responsive">
            <table className="audit-table">
              <thead>
                <tr>
                  <th style={{ width: 4, padding: 0 }} />
                  <th>Date & Time</th>
                  <th>Actor / User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Outcome</th>
                  <th>Compliance Details & Summary</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedLogs.map((item) => (
                  <tr
                    key={item.id}
                    className={`row-${item.normalizedStatus.toLowerCase()}`}
                  >
                    {/* Status vertical bar */}
                    <td className="col-indicator">
                      <div className={`status-indicator-bar ${item.normalizedStatus}`} />
                    </td>

                    {/* Date & Time */}
                    <td>
                      <div className="audit-date-cell">
                        <span className="audit-date-primary">{item.dateStr}</span>
                        <span className="audit-time-secondary">
                          {item.timeStr}
                          {item.relative && <span>• {item.relative}</span>}
                        </span>
                      </div>
                    </td>

                    {/* Actor */}
                    <td>
                      <div className="audit-user-cell">
                        <div className={`audit-avatar ${item.avatarClass}`}>
                          {item.avatarInitials}
                        </div>
                        <div className="audit-user-info">
                          <span className="audit-user-name" title={item.user_name || item.user_email}>
                            {item.user_name || "AICTE Regulation Officer"}
                          </span>
                          <span className="audit-user-role">
                            {item.actorRole}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td>
                      <div className="audit-action-cell">
                        <span className="audit-action-pill" title={item.action}>
                          {item.actionLabel}
                        </span>
                      </div>
                    </td>

                    {/* Entity & ID */}
                    <td>
                      <div className="audit-entity-cell">
                        <div className="audit-entity-pill">
                          <span className="audit-entity-type">{item.entity_type}</span>
                          {item.entity_type === "FDR" && typeof onSelectFdr === "function" && item.entity_id ? (
                            <button
                              type="button"
                              className="audit-entity-link"
                              onClick={() => onSelectFdr(item.entity_id)}
                              title={`Inspect FDR #${item.entity_id}`}
                            >
                              #{item.entity_id}
                            </button>
                          ) : (
                            <span className="audit-entity-id">#{item.entity_id ?? "—"}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Decision Outcome Badge */}
                    <td>
                      <span className={`audit-decision-badge ${item.normalizedStatus}`}>
                        <span className="badge-dot" />
                        {item.normalizedStatus}
                      </span>
                    </td>

                    {/* Parsed Human-Readable Details */}
                    <td className="audit-details-cell">
                      <div className="audit-details-stack">
                        {/* Rule code and headline */}
                        <div className="audit-details-primary">
                          {item.ruleCode && (
                            <span className={`rule-code-tag ${item.normalizedStatus === "FLAGGED" ? "" : "neutral"}`}>
                              Rule {item.ruleCode}
                            </span>
                          )}
                          <span className="audit-reason-text">
                            {item.ruleTitle || item.ruleReason || item.remark || item.actionLabel}
                          </span>
                        </div>

                        {/* Officer Remark Quote if available */}
                        {item.remark && item.ruleTitle && item.remark !== item.ruleTitle && (
                          <div className="audit-remark-quote" title={item.remark}>
                            “{item.remark}”
                          </div>
                        )}

                        {/* Key tags (Bank, FDR #, Amount, Confidence, File) */}
                        <div className="audit-meta-chips">
                          {item.fdrNumber && (
                            <span className="audit-chip" title="FDR Instrument Number">
                              📄 {item.fdrNumber}
                            </span>
                          )}
                          {item.bank && (
                            <span className="audit-chip bank" title="Issuer Bank">
                              🏦 {item.bank}
                            </span>
                          )}
                          {item.formattedAmount && (
                            <span className="audit-chip amount" title="Deposit Collateral Value">
                              💰 {item.formattedAmount}
                            </span>
                          )}
                          {item.confidence && (
                            <span className="audit-chip" title="OCR Confidence Score">
                              🎯 {item.confidence} OCR
                            </span>
                          )}
                          {item.fileName && (
                            <span className="audit-chip" title="Uploaded Document File">
                              📎 {item.fileName}
                            </span>
                          )}
                          {item.clearanceProgress && (
                            <span className="audit-chip" title="Clearance Check Progress">
                              ⏳ {item.clearanceProgress}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Action: View Details */}
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="audit-row-action-btn"
                        onClick={() => {
                          setSelectedLog(item);
                          setRawPayloadExpanded(false);
                        }}
                        title="View comprehensive audit event record"
                      >
                        View Details →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div className="audit-pagination-bar">
            <div className="pagination-info">
              Showing{" "}
              <strong>
                {filteredLogs.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–
                {pageSize === "ALL" ? filteredLogs.length : Math.min(currentPage * pageSize, filteredLogs.length)}
              </strong>{" "}
              of <strong>{filteredLogs.length}</strong> records
            </div>

            <div className="pagination-controls">
              <label style={{ fontSize: 12.5, color: "#64748b", marginRight: 8 }}>
                Rows per page:
                <select
                  className="audit-select"
                  style={{ height: 30, padding: "0 8px", marginLeft: 6 }}
                  value={pageSize}
                  onChange={(e) => {
                    const nextVal = e.target.value === "ALL" ? "ALL" : Number(e.target.value);
                    setPageSize(nextVal);
                    setCurrentPage(1);
                  }}
                >
                  <option value={20}>20</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value="ALL">All ({filteredLogs.length})</option>
                </select>
              </label>

              {pageSize !== "ALL" && (
                <>
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                  >
                    ← Previous
                  </button>
                  <span className="pagination-page-indicator">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="pagination-btn"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                  >
                    Next →
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      ) : (
        /* TIMELINE STREAM VIEW */
        <section className="audit-timeline-container">
          {Object.entries(timelineGroups).map(([dateLabel, items]) => (
            <div key={dateLabel} className="timeline-date-group">
              <div className="timeline-date-header">
                <span className="timeline-date-pill">{dateLabel}</span>
                <div className="timeline-date-line" />
              </div>

              <div className="timeline-cards-list">
                {items.map((item) => (
                  <div key={item.id} className="timeline-item-card">
                    <span className={`timeline-node-dot ${item.normalizedStatus}`} />

                    <div className="timeline-item-header">
                      <div className="timeline-item-top-left">
                        <span className={`audit-decision-badge ${item.normalizedStatus}`}>
                          {item.normalizedStatus}
                        </span>
                        <strong style={{ fontSize: 13.5, color: "#002b5c" }}>
                          {item.actionLabel}
                        </strong>
                        <span style={{ fontSize: 12, color: "#64748b" }}>
                          #{item.entity_type} {item.entity_id ?? "—"}
                        </span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{item.timeStr}</span>
                        <button
                          type="button"
                          className="audit-row-action-btn"
                          onClick={() => {
                            setSelectedLog(item);
                            setRawPayloadExpanded(false);
                          }}
                        >
                          Details →
                        </button>
                      </div>
                    </div>

                    <div className="timeline-item-body">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {item.ruleCode && (
                          <span className={`rule-code-tag ${item.normalizedStatus === "FLAGGED" ? "" : "neutral"}`}>
                            Rule {item.ruleCode}
                          </span>
                        )}
                        <span style={{ fontWeight: 600, fontSize: 13 }}>
                          {item.ruleTitle || item.ruleReason || item.remark || item.actionLabel}
                        </span>
                      </div>

                      {item.remark && item.ruleTitle && (
                        <div className="audit-remark-quote">“{item.remark}”</div>
                      )}

                      <div className="audit-meta-chips" style={{ marginTop: 4 }}>
                        <span className="audit-chip">
                          👤 {item.user_name || "AICTE Regulation Officer"} ({item.actorRole})
                        </span>
                        {item.fdrNumber && <span className="audit-chip">📄 {item.fdrNumber}</span>}
                        {item.bank && <span className="audit-chip bank">🏦 {item.bank}</span>}
                        {item.formattedAmount && <span className="audit-chip amount">💰 {item.formattedAmount}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 5. VIEW DETAILS MODAL / SLIDE-OUT DRAWER */}
      {selectedLog && (
        <div
          className="audit-modal-overlay"
          onClick={() => setSelectedLog(null)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setSelectedLog(null);
          }}
          tabIndex={0}
        >
          <div
            className="audit-drawer"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            {/* Drawer Header */}
            <div className="audit-drawer-header">
              <div className="audit-drawer-title-wrap">
                <span className="audit-drawer-tag">Audit Event Record</span>
                <h2 className="audit-drawer-title">
                  Event #{selectedLog.id} — {selectedLog.actionLabel}
                </h2>
              </div>
              <button
                type="button"
                className="audit-drawer-close-btn"
                onClick={() => setSelectedLog(null)}
                title="Close drawer (Esc)"
              >
                ✕
              </button>
            </div>

            {/* Drawer Body */}
            <div className="audit-drawer-body">
              {/* Event Metadata */}
              <div className="drawer-section-card">
                <div className="drawer-section-header">
                  <h3 className="drawer-section-title">Event Metadata & Provenance</h3>
                  <span style={{ fontSize: 11.5, color: "#64748b" }}>
                    Recorded: {selectedLog.dateStr} at {selectedLog.timeStr}
                  </span>
                </div>

                <div className="drawer-grid-two">
                  <div className="drawer-field">
                    <span className="drawer-field-label">Actor / Responsible User</span>
                    <span className="drawer-field-val">
                      {selectedLog.user_name || "AICTE Regulation Officer"}
                    </span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      {selectedLog.user_email || "officer@aicte.gov.in"}
                    </span>
                  </div>

                  <div className="drawer-field">
                    <span className="drawer-field-label">Actor Role & Classification</span>
                    <span className="drawer-field-val">{selectedLog.actorRole}</span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      Category: {selectedLog.actorCategory}
                    </span>
                  </div>

                  <div className="drawer-field">
                    <span className="drawer-field-label">Entity Under Scrutiny</span>
                    <span className="drawer-field-val">
                      {selectedLog.entity_type} #{selectedLog.entity_id ?? "—"}
                    </span>
                  </div>

                  <div className="drawer-field">
                    <span className="drawer-field-label">Raw Action Code</span>
                    <span className="drawer-field-val" style={{ fontFamily: "monospace" }}>
                      {selectedLog.action}
                    </span>
                  </div>
                </div>
              </div>

              {/* Compliance Finding & Decision */}
              <div className="drawer-section-card">
                <div className="drawer-section-header">
                  <h3 className="drawer-section-title">Compliance Decision & Rule Findings</h3>
                  <span className={`audit-decision-badge ${selectedLog.normalizedStatus}`}>
                    <span className="badge-dot" />
                    {selectedLog.normalizedStatus}
                  </span>
                </div>

                <div
                  className={`drawer-highlight-box ${
                    selectedLog.normalizedStatus === "VERIFIED"
                      ? "verified"
                      : selectedLog.normalizedStatus === "FLAGGED"
                      ? "flagged"
                      : ""
                  }`}
                >
                  {selectedLog.ruleCode && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="rule-code-tag">Rule {selectedLog.ruleCode}</span>
                      <strong style={{ fontSize: 14, color: "#002b5c" }}>
                        {selectedLog.ruleTitle || selectedLog.ruleCode}
                      </strong>
                    </div>
                  )}

                  {selectedLog.ruleReason && (
                    <div style={{ fontSize: 13, color: "#334155", lineHeight: 1.4 }}>
                      <strong>Regulatory Finding:</strong> {selectedLog.ruleReason}
                    </div>
                  )}

                  {selectedLog.remark && (
                    <div style={{ fontSize: 13, color: "#1e293b", lineHeight: 1.4 }}>
                      <strong>Officer Scrutiny Notice / Remark:</strong>
                      <div className="audit-remark-quote" style={{ marginTop: 4 }}>
                        “{selectedLog.remark}”
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Financial & Instrument Parameters */}
              {(selectedLog.fdrNumber || selectedLog.bank || selectedLog.amount || selectedLog.fileName) && (
                <div className="drawer-section-card">
                  <div className="drawer-section-header">
                    <h3 className="drawer-section-title">Associated Instrument Parameters</h3>
                  </div>

                  <div className="drawer-grid-two">
                    {selectedLog.fdrNumber && (
                      <div className="drawer-field">
                        <span className="drawer-field-label">FDR Instrument Number</span>
                        <span className="drawer-field-val" style={{ fontFamily: "monospace" }}>
                          {selectedLog.fdrNumber}
                        </span>
                      </div>
                    )}

                    {selectedLog.bank && (
                      <div className="drawer-field">
                        <span className="drawer-field-label">Scheduled Issuer Bank</span>
                        <span className="drawer-field-val">{selectedLog.bank}</span>
                      </div>
                    )}

                    {selectedLog.formattedAmount && (
                      <div className="drawer-field">
                        <span className="drawer-field-label">Deposit Collateral Value</span>
                        <span className="drawer-field-val text-navy" style={{ fontWeight: 700 }}>
                          {selectedLog.formattedAmount}
                        </span>
                      </div>
                    )}

                    {selectedLog.confidence && (
                      <div className="drawer-field">
                        <span className="drawer-field-label">OCR Confidence Metric</span>
                        <span className="drawer-field-val">{selectedLog.confidence}</span>
                      </div>
                    )}

                    {selectedLog.fileName && (
                      <div className="drawer-field">
                        <span className="drawer-field-label">Uploaded Document</span>
                        <span className="drawer-field-val">{selectedLog.fileName}</span>
                      </div>
                    )}

                    {selectedLog.clearanceProgress && (
                      <div className="drawer-field">
                        <span className="drawer-field-label">Clearance Progress</span>
                        <span className="drawer-field-val">{selectedLog.clearanceProgress}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* State Transition Diff */}
              <div className="drawer-section-card">
                <div className="drawer-section-header">
                  <h3 className="drawer-section-title">Audit State Transition</h3>
                </div>

                <div className="drawer-grid-two">
                  {/* Previous State */}
                  <div className="drawer-field">
                    <span className="drawer-field-label">Previous State (Before Event)</span>
                    {selectedLog.parsedOld ? (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px" }}>
                        {Object.entries(selectedLog.parsedOld).map(([k, v]) => (
                          <div key={k} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                            <span style={{ color: "#64748b" }}>{k}:</span>
                            <span style={{ fontWeight: 600 }}>{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                        No previous value (Initial creation or idempotent action)
                      </div>
                    )}
                  </div>

                  {/* New State */}
                  <div className="drawer-field">
                    <span className="drawer-field-label">New State (Recorded in Ledger)</span>
                    {selectedLog.parsedNew ? (
                      <div style={{ background: "#ffffff", border: "1px solid #e2e8f0", borderRadius: 6, padding: "8px 12px" }}>
                        {Object.entries(selectedLog.parsedNew).map(([k, v]) => (
                          <div key={k} style={{ fontSize: 12, display: "flex", justifyContent: "space-between", padding: "2px 0", gap: 10 }}>
                            <span style={{ color: "#64748b" }}>{k}:</span>
                            <span style={{ fontWeight: 600, wordBreak: "break-all" }}>
                              {typeof v === "object" ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 12.5, color: "#94a3b8", fontStyle: "italic", padding: "8px 0" }}>
                        No new state recorded
                      </div>
                    )}
                  </div>
                </div>

                {/* Collapsible Technical Payload */}
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    className="drawer-raw-toggle"
                    onClick={() => setRawPayloadExpanded((v) => !v)}
                  >
                    {rawPayloadExpanded ? "▼ Hide Technical Audit Payload (JSON)" : "▶ Show Technical Audit Payload (JSON)"}
                  </button>

                  {rawPayloadExpanded && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      <pre className="drawer-raw-pre">
                        {JSON.stringify(
                          {
                            id: selectedLog.id,
                            action: selectedLog.action,
                            entity_type: selectedLog.entity_type,
                            entity_id: selectedLog.entity_id,
                            old_value: selectedLog.old_value,
                            new_value: selectedLog.new_value,
                            created_at: selectedLog.created_at,
                            user_name: selectedLog.user_name,
                            user_email: selectedLog.user_email
                          },
                          null,
                          2
                        )}
                      </pre>
                      <button
                        type="button"
                        className="audit-row-action-btn"
                        style={{ alignSelf: "flex-end" }}
                        onClick={() => handleCopy(JSON.stringify(selectedLog.parsedNew || {}, null, 2), selectedLog.id)}
                      >
                        {copiedId === selectedLog.id ? "✓ Copied JSON" : "Copy Payload"}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="audit-drawer-footer">
              {selectedLog.entity_type === "FDR" && typeof onSelectFdr === "function" && selectedLog.entity_id ? (
                <button
                  type="button"
                  className="audit-action-btn secondary"
                  onClick={() => {
                    setSelectedLog(null);
                    onSelectFdr(selectedLog.entity_id);
                  }}
                >
                  Inspect FDR Record #{selectedLog.entity_id} →
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                className="audit-action-btn primary"
                onClick={() => setSelectedLog(null)}
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
