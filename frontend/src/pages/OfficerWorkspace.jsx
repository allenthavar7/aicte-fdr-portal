import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  FdrPriorityBadge
} from "../components/FdrPriority";
import OfficerFdrDetailsModal from "../components/OfficerFdrDetailsModal";
import { getFdrPriority } from "../utils/fdrPriority";
import {
  getOfficerAuditLogs,
  getOfficerFdrs,
  getOfficerFdrDetail,
  getOfficerFdrDocument,
  getOfficerVerificationQueue,
  getOfficerInstitution,
  getOfficerInstitutions,
  getOfficerMasterData,
  getOfficerNotifications,
  getOfficerProfile,
  getOfficerReleaseRequests,
  getOfficerRenewals,
  getOfficerUsers,
  markAllOfficerNotificationsRead,
  markOfficerNotificationRead,
  reviewOfficerReleaseRequest,
  reviewOfficerRenewal,
  postOfficerFdrOverride,
  updateOfficerProfile
} from "../services/api";
import OfficerLayout from "../components/OfficerLayout";
import OfficerReports from "../components/OfficerReports";
import OfficerAuditLog from "../components/OfficerAuditLog";
import OfficerReleaseRequestModal from "../components/OfficerReleaseRequestModal";
import { getDaysRemaining, formatAnalyticsAmount } from "../utils/officerAnalytics";
import officerDemoData from "../../../shared/officerDemoData.json";
import "./OfficerWorkspace.css";

const demoUserDetails = new Map(
  officerDemoData.users.map((user) => [
    user.email,
    {
      displayRole: user.displayRole,
      institutionName: officerDemoData.institutions.find(
        (institution) => institution.code === user.institutionCode
      )?.name
    }
  ])
);

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

function formatNotificationTimestamp(value) {
  if (!value) return "Just now";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
  if (diffSec < 172800) return "Yesterday";
  return date.toLocaleDateString("en-IN", {
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
  const norm = String(value || "").toUpperCase();
  if (norm === "MORE_INFO_REQUIRED" || norm === "MORE_INFORMATION_REQUIRED" || norm === "ACTION_REQUIRED") {
    return "More Info Required";
  }
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
  } else if (["MATURED", "RELEASE_REQUESTED", "RELEASED", "MORE_INFO_REQUIRED", "MORE_INFORMATION_REQUIRED", "ACTION_REQUIRED"].includes(norm)) {
    badgeClass = "ow-badge-purple";
    dotColor = "#7c3aed";
  }

  return (
    <span className={`ow-status-badge ${badgeClass}`}>
      <span className="ow-status-dot" style={{ backgroundColor: dotColor }} />
      {label(status)}
    </span>
  );
}

function TenorBadge({ dateValue }) {
  const status = maturityStatus(dateValue);
  const now = new Date();
  const d = dateValue ? new Date(dateValue) : null;
  const days = d && !Number.isNaN(d.getTime()) ? Math.ceil((d.getTime() - now.getTime()) / 86400000) : null;

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
      <span className="ow-tenor-date">{formatDate(dateValue)}</span>
      {subtext && <span className="ow-tenor-sub">{subtext}</span>}
    </div>
  );
}

function ScoreBadge({ score }) {
  if (!Number.isFinite(score)) {
    return <span className="ow-status-badge ow-badge-info">Pending</span>;
  }
  const s = Math.round(Number(score));
  let color = "#16a34a";
  let bg = "#f0fdf4";
  let border = "#bbf7d0";
  if (s < 70) {
    color = "#dc2626";
    bg = "#fef2f2";
    border = "#fecaca";
  } else if (s < 90) {
    color = "#d97706";
    bg = "#fffbeb";
    border = "#fde68a";
  }

  return (
    <span
      className="ow-status-badge"
      style={{ background: bg, borderColor: border, color, fontWeight: 800 }}
    >
      {s}/100
    </span>
  );
}

function ComplianceBar({ score }) {
  const s = Math.min(Math.max(Math.round(Number(score) || 0), 0), 100);
  let tier = "good";
  let color = "#16a34a";
  if (s < 70) {
    tier = "low";
    color = "#dc2626";
  } else if (s < 85) {
    tier = "medium";
    color = "#d97706";
  }

  return (
    <div className="compliance-bar-wrap">
      <div className="compliance-bar-labels">
        <span style={{ color }}>{s}% Compliance</span>
      </div>
      <div className="compliance-bar-track">
        <div className={`compliance-bar-fill ${tier}`} style={{ width: `${s}%` }} />
      </div>
    </div>
  );
}

function Table({ columns, rows, empty = "No records found." }) {
  return (
    <div className="ow-table-card">
      <div className="ow-table-responsive">
        <table className="ow-table-modern">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {rows.length ? rows.map((row, index) => (
              <tr key={row.id ?? row.key ?? index} className={row.className || ""} onClick={row.onClick} style={row.onClick ? { cursor: "pointer" } : undefined}>
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
    </div>
  );
}

function OfficerNotificationsView({
  notifications = [],
  unreadCount = 0,
  fdrs = [],
  onOpenNotification,
  onMarkRead,
  actionError
}) {
  const [activeTab, setActiveTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const discrepancyCount = notifications.filter(
    (n) => n.type === "DISCREPANCY_ALERT" || n.type === "RULE_VIOLATION"
  ).length;
  const renewalCount = notifications.filter(
    (n) =>
      n.type === "RENEWAL_ALERT" ||
      n.type === "RENEWAL_APPROVED" ||
      n.type === "RENEWAL_REMINDER"
  ).length;
  const submissionCount = notifications.filter(
    (n) =>
      n.type === "FDR_SUBMISSION" ||
      n.type === "RELEASE_REQUEST" ||
      n.type === "RELEASE_PROGRESS"
  ).length;

  const filteredNotifications = useMemo(() => {
    return notifications.filter((item) => {
      if (activeTab === "unread" && item.is_read) return false;
      if (
        activeTab === "discrepancies" &&
        !(item.type === "DISCREPANCY_ALERT" || item.type === "RULE_VIOLATION")
      )
        return false;
      if (
        activeTab === "renewals" &&
        !(
          item.type === "RENEWAL_ALERT" ||
          item.type === "RENEWAL_APPROVED" ||
          item.type === "RENEWAL_REMINDER"
        )
      )
        return false;
      if (
        activeTab === "submissions" &&
        !(
          item.type === "FDR_SUBMISSION" ||
          item.type === "RELEASE_REQUEST" ||
          item.type === "RELEASE_PROGRESS"
        )
      )
        return false;

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesMsg = item.message?.toLowerCase().includes(query);
        const matchesType = item.type?.toLowerCase().includes(query);
        return matchesMsg || matchesType;
      }
      return true;
    });
  }, [notifications, activeTab, searchTerm]);

  const getNotifMeta = (type) => {
    switch (type) {
      case "DISCREPANCY_ALERT":
        return {
          label: "Core Banking Discrepancy",
          badgeClass: "ow-badge-danger",
          borderClass: "ow-notif-border-danger",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          )
        };
      case "RULE_VIOLATION":
        return {
          label: "Rule Violation Flag",
          badgeClass: "ow-badge-warning",
          borderClass: "ow-notif-border-warning",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          )
        };
      case "RENEWAL_ALERT":
      case "RENEWAL_REMINDER":
        return {
          label: "Upcoming Maturity",
          badgeClass: "ow-badge-blue",
          borderClass: "ow-notif-border-blue",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          )
        };
      case "RENEWAL_APPROVED":
        return {
          label: "Renewal Approved",
          badgeClass: "ow-badge-success",
          borderClass: "ow-notif-border-emerald",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          )
        };
      case "FDR_SUBMISSION":
        return {
          label: "Deposit Submission",
          badgeClass: "ow-badge-success",
          borderClass: "ow-notif-border-teal",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="12" y1="18" x2="12" y2="12" />
              <line x1="9" y1="15" x2="15" y2="15" />
            </svg>
          )
        };
      case "RELEASE_REQUEST":
      case "RELEASE_PROGRESS":
        return {
          label: "Release & Moratorium",
          badgeClass: "ow-badge-purple",
          borderClass: "ow-notif-border-purple",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          )
        };
      default:
        return {
          label: "AICTE Regulatory Notice",
          badgeClass: "ow-badge-info",
          borderClass: "ow-notif-border-slate",
          icon: (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" style={{ marginRight: 5 }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="16" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          )
        };
    }
  };

  return (
    <>
      {/* 1. Hero Header */}
      <section className="ow-hero-header">
        <div className="ow-hero-text">
          <span className="ow-hero-pill">
            <span className="ow-pill-dot" /> Regulatory Compliance Surveillance
          </span>
          <h1>Alerts & Operational Notifications</h1>
          <p>
            Real-time regulatory alerts, banking verification discrepancies, upcoming instrument maturities, and statutory compliance notifications.
          </p>
        </div>
        <div className="ow-hero-meta">
          <span className="ow-meta-stat">{notifications.length}</span>
          <span className="ow-meta-label">Total Recorded Alerts</span>
        </div>
      </section>

      {/* 2. KPI Summary Cards */}
      <section className="ow-kpi-grid">
        <div className="ow-kpi-card kpi-navy">
          <div className="ow-kpi-content">
            <span className="ow-kpi-label">Pending Action / Unread</span>
            <div className="ow-kpi-value">{unreadCount}</div>
            <span className="ow-kpi-sub">Requires triage</span>
          </div>
          <div className="ow-kpi-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
        </div>

        <div className="ow-kpi-card kpi-amber">
          <div className="ow-kpi-content">
            <span className="ow-kpi-label">Discrepancies & Violations</span>
            <div className="ow-kpi-value">{discrepancyCount}</div>
            <span className="ow-kpi-sub">Rule & amount flags</span>
          </div>
          <div className="ow-kpi-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
        </div>

        <div className="ow-kpi-card kpi-blue">
          <div className="ow-kpi-content">
            <span className="ow-kpi-label">Maturities & Renewals</span>
            <div className="ow-kpi-value">{renewalCount}</div>
            <span className="ow-kpi-sub">Expiring deposit notices</span>
          </div>
          <div className="ow-kpi-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
        </div>

        <div className="ow-kpi-card kpi-teal">
          <div className="ow-kpi-content">
            <span className="ow-kpi-label">Submissions & Releases</span>
            <div className="ow-kpi-value">{submissionCount}</div>
            <span className="ow-kpi-sub">Inbound deposit actions</span>
          </div>
          <div className="ow-kpi-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          </div>
        </div>
      </section>

      {/* 3. Filter Toolbar & Search Bar */}
      <section className="ow-notif-toolbar">
        <div className="ow-notif-tabs">
          <button
            type="button"
            className={`ow-notif-tab ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Alerts <span className="tab-count">{notifications.length}</span>
          </button>
          <button
            type="button"
            className={`ow-notif-tab ${activeTab === "unread" ? "active" : ""}`}
            onClick={() => setActiveTab("unread")}
          >
            Unread <span className="tab-count">{unreadCount}</span>
          </button>
          <button
            type="button"
            className={`ow-notif-tab ${activeTab === "discrepancies" ? "active" : ""}`}
            onClick={() => setActiveTab("discrepancies")}
          >
            Discrepancies & Rules <span className="tab-count">{discrepancyCount}</span>
          </button>
          <button
            type="button"
            className={`ow-notif-tab ${activeTab === "renewals" ? "active" : ""}`}
            onClick={() => setActiveTab("renewals")}
          >
            Maturities & Renewals <span className="tab-count">{renewalCount}</span>
          </button>
          <button
            type="button"
            className={`ow-notif-tab ${activeTab === "submissions" ? "active" : ""}`}
            onClick={() => setActiveTab("submissions")}
          >
            Submissions & Releases <span className="tab-count">{submissionCount}</span>
          </button>
        </div>

        <div className="ow-notif-actions-bar">
          <div className="ow-notif-search">
            <svg
              className="ow-notif-search-icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              className="ow-notif-search-input"
              placeholder="Search notifications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="ow-notif-mark-all-btn"
            onClick={() => onMarkRead("all")}
            disabled={unreadCount === 0}
            title={unreadCount === 0 ? "All notifications are already read" : "Mark all notifications as read"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Mark All Read
          </button>
        </div>
      </section>

      {actionError && (
        <p className="ow-error" role="alert" style={{ marginBottom: 16 }}>
          {actionError}
        </p>
      )}

      {/* 4. Notification List */}
      <section className="ow-notif-stack">
        {filteredNotifications.length > 0 ? (
          filteredNotifications.map((item) => {
            const meta = getNotifMeta(item.type);
            const relatedFdr = fdrs.find(
              (f) =>
                (item.fdr_id && f.id === item.fdr_id) ||
                item.message?.includes(f.fdr_number)
            );

            return (
              <article
                className={`ow-notif-card ${item.is_read ? "is-read" : "is-unread"} ${meta.borderClass}`}
                key={item.id}
              >
                <div className="ow-notif-card-header">
                  <div className="ow-notif-meta-left">
                    <span className={`ow-status-badge ${meta.badgeClass}`}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    {!item.is_read && (
                      <span className="ow-notif-unread-pill">
                        <span className="ow-notif-dot" /> New Alert
                      </span>
                    )}
                  </div>
                  <div className="ow-notif-meta-right">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{formatNotificationTimestamp(item.created_at)}</span>
                  </div>
                </div>

                <div
                  className="ow-notif-card-body"
                  onClick={() => onOpenNotification(item)}
                  title="Click to view related FDR or details"
                >
                  {item.message}
                </div>

                <div className="ow-notif-card-footer">
                  <div className="ow-notif-footer-chips">
                    {relatedFdr && (
                      <span className="ow-notif-chip">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                        </svg>
                        {relatedFdr.fdr_number} • {relatedFdr.bank_name}
                      </span>
                    )}
                    {relatedFdr?.institution?.name && (
                      <span className="ow-notif-chip">
                        {relatedFdr.institution.name}
                      </span>
                    )}
                  </div>

                  <div className="ow-notif-footer-actions">
                    {(relatedFdr || item.fdr_id) && (
                      <button
                        type="button"
                        className="ow-notif-view-btn"
                        onClick={() => onOpenNotification(item)}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="3" />
                        </svg>
                        Inspect FDR Record →
                      </button>
                    )}
                    {!item.is_read && (
                      <button
                        type="button"
                        className="ow-notif-mark-btn"
                        onClick={() => onMarkRead(item.id)}
                      >
                        Mark Read ✓
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        ) : (
          <div className="ow-notif-empty-state">
            <div className="ow-notif-empty-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3>No Notifications Found</h3>
            <p>
              {searchTerm
                ? `No notifications matched your search "${searchTerm}". Try adjusting your filters.`
                : activeTab === "unread"
                ? "All caught up! There are no unread regulatory alerts or notifications."
                : "No compliance notifications have been recorded in this category."}
            </p>
            {(activeTab !== "all" || searchTerm) && (
              <button
                type="button"
                className="ow-notif-mark-btn"
                onClick={() => {
                  setActiveTab("all");
                  setSearchTerm("");
                }}
                style={{ marginTop: 8 }}
              >
                Clear Filters
              </button>
            )}
          </div>
        )}
      </section>
    </>
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
  const [minimumPriorityScore, setMinimumPriorityScore] = useState("");
  const [maximumPriorityScore, setMaximumPriorityScore] = useState("");
  const [issueFilter, setIssueFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expiryFilter, setExpiryFilter] = useState(
    () => searchParams.get("expiry") || ""
  );
  const [page, setPage] = useState(1);
  const [selectedInstitution, setSelectedInstitution] = useState(null);
  const [selectedFdr, setSelectedFdr] = useState(null);
  const [fdrDetailState, setFdrDetailState] = useState({
    detail: null,
    loading: false,
    error: "",
    openingDocumentId: null
  });
  const [reviewId, setReviewId] = useState(null);
  const [renewalReviewId, setRenewalReviewId] = useState(null);
  const [reviewReason, setReviewReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(null);
  const [settingsMessage, setSettingsMessage] = useState("");
  const [selectedReleaseRequest, setSelectedReleaseRequest] = useState(null);
  const [releaseTab, setReleaseTab] = useState("all");
  const [releaseSearch, setReleaseSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const token = localStorage.getItem("token");
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const currentSection = section === "alerts" ? "notifications" : section;
  const selectedFdrId = selectedFdr?.id;

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
            result = await getOfficerFdrs(token);
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

  useEffect(() => {
    if (!selectedFdrId) {
      return undefined;
    }

    let active = true;
    setFdrDetailState({
      detail: null,
      loading: true,
      error: "",
      openingDocumentId: null
    });
    getOfficerFdrDetail(token, selectedFdrId)
      .then((detail) => {
        if (active) {
          setFdrDetailState({
            detail,
            loading: false,
            error: "",
            openingDocumentId: null
          });
        }
      })
      .catch((detailError) => {
        if (active) {
          setFdrDetailState({
            detail: null,
            loading: false,
            error: detailError.message || "Unable to load FDR details.",
            openingDocumentId: null
          });
        }
      });

    return () => {
      active = false;
    };
  }, [currentSection, selectedFdrId, token]);

  useEffect(() => {
    if (currentSection !== "verification" && currentSection !== "notifications") {
      setSelectedFdr(null);
    }
  }, [currentSection]);

  const fdrs = useMemo(() => data?.fdrs || [], [data]);
  const matchingFdrs = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("en-IN");
    const matches = fdrs.filter((fdr) => {
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
      const priority = getFdrPriority(fdr);
      const bankStatus = String(
        fdr.verification?.bank_verification?.status || ""
      ).toUpperCase();
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
        (!priorityFilter || priority.level.toUpperCase() === priorityFilter) &&
        (!minimumPriorityScore || priority.score >= Number(minimumPriorityScore)) &&
        (!maximumPriorityScore || priority.score <= Number(maximumPriorityScore)) &&
        (!fromDate || (!Number.isNaN(recordDate.getTime()) && recordDate >= lowerDate)) &&
        (!toDate || (!Number.isNaN(recordDate.getTime()) && recordDate <= upperDate)) &&
        (!expiryFilter || maturityStatus(fdr.maturity_date).toUpperCase() === expiryFilter) &&
        issueMatches &&
        (currentSection !== "verification" || queueStatus);
    });
    return matches.sort((left, right) => {
      if (currentSection === "verification" || currentSection === "fdrs") {
        const priorityRank = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        const priorityDifference =
          priorityRank[getFdrPriority(right).level.toUpperCase()] -
          priorityRank[getFdrPriority(left).level.toUpperCase()];
        if (priorityDifference) return priorityDifference;
        const scoreDifference =
          getFdrPriority(right).score - getFdrPriority(left).score;
        if (scoreDifference) return scoreDifference;
      }
      return new Date(right.created_at).getTime() -
        new Date(left.created_at).getTime();
    });
  }, [
    fdrs,
    query,
    statusFilter,
    bankFilter,
    applicationFilter,
    priorityFilter,
    minimumPriorityScore,
    maximumPriorityScore,
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
    if (currentSection === "verification" || currentSection === "fdrs" || currentSection === "notifications") {
      const allFdrs = (fdrs && fdrs.length > 0) ? fdrs : (data?.fdrs || []);
      const fdr = allFdrs.find((item) => item.id === fdrId);
      if (fdr) {
        setFdrDetailState({
          detail: null,
          loading: true,
          error: "",
          openingDocumentId: null
        });
        setSelectedFdr(fdr);
        return;
      }
    }
    navigate(`/officer?fdr=${fdrId}`);
  }

  async function openFdrDocument(fdr, document) {
    const documentWindow = window.open("about:blank", "_blank");
    if (!documentWindow) {
      setFdrDetailState((state) => ({
        ...state,
        error: "Allow pop-ups to open this FDR document."
      }));
      return;
    }

    setFdrDetailState((state) => ({
      ...state,
      error: "",
      openingDocumentId: document.id
    }));
    try {
      const blob = await getOfficerFdrDocument(token, fdr.id, document.id);
      const documentUrl = URL.createObjectURL(blob);
      documentWindow.location.href = documentUrl;
      window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60000);
    } catch (documentError) {
      documentWindow.close();
      setFdrDetailState((state) => ({
        ...state,
        error: documentError.message || "Unable to open FDR document."
      }));
    } finally {
      setFdrDetailState((state) => ({
        ...state,
        openingDocumentId: null
      }));
    }
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
        setData((prev) => ({
          ...prev,
          unreadCount: 0,
          notifications: (prev?.notifications || []).map((n) => ({ ...n, is_read: 1 }))
        }));
      } else {
        await markOfficerNotificationRead(token, notificationId);
        setData((prev) => ({
          ...prev,
          unreadCount: Math.max(0, (prev?.unreadCount || 1) - 1),
          notifications: (prev?.notifications || []).map((n) =>
            n.id === notificationId ? { ...n, is_read: 1 } : n
          )
        }));
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
        setData((prev) => ({
          ...prev,
          unreadCount: Math.max(0, (prev?.unreadCount || 1) - 1),
          notifications: (prev?.notifications || []).map((n) =>
            n.id === item.id ? { ...n, is_read: 1 } : n
          )
        }));
      }
    } catch (markError) {
      console.warn("Could not mark notification read:", markError);
    }

    const allFdrs = (fdrs && fdrs.length > 0) ? fdrs : (data?.fdrs || []);
    let targetFdr = null;
    if (item.fdr_id) {
      targetFdr = allFdrs.find((fdr) => fdr.id === item.fdr_id);
    }
    if (!targetFdr) {
      targetFdr = allFdrs.find(
        (fdr) =>
          item.message?.includes(fdr.fdr_number) ||
          item.message?.includes(fdr.institution?.name)
      );
    }

    if (targetFdr) {
      viewFdr(targetFdr.id);
    } else if (item.fdr_id) {
      navigate(`/officer?fdr=${item.fdr_id}`);
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
  const renewalRequests = data?.renewals || [];

  // Filter Reset & Count
  const activeFiltersCount =
    (query ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (bankFilter ? 1 : 0) +
    (applicationFilter ? 1 : 0) +
    (priorityFilter ? 1 : 0) +
    (minimumPriorityScore ? 1 : 0) +
    (maximumPriorityScore ? 1 : 0) +
    (issueFilter ? 1 : 0) +
    (fromDate ? 1 : 0) +
    (toDate ? 1 : 0) +
    (expiryFilter ? 1 : 0);

  function resetFdrFilters() {
    setQuery("");
    setStatusFilter("");
    setBankFilter("");
    setApplicationFilter("");
    setPriorityFilter("");
    setMinimumPriorityScore("");
    setMaximumPriorityScore("");
    setIssueFilter("");
    setFromDate("");
    setToDate("");
    setExpiryFilter("");
    setPage(1);
  }

  // Dynamic KPI Metrics derived from real loaded datasets
  const queueKpis = useMemo(() => {
    const total = fdrs.length;
    let flaggedCount = 0;
    let criticalUrgentCount = 0;
    let pendingOfficerCount = 0;

    fdrs.forEach((fdr) => {
      const v = String(fdr.verification_status || "").toUpperCase();
      const hasMismatch =
        ["FLAGGED", "FAILED", "REJECTED"].includes(v) ||
        fdr.verification?.checks?.some((c) => c.status === "FAILED") ||
        fdr.verification?.comparisons?.some((c) => c.result === "MISMATCH") ||
        fdr.review_reason;
      if (hasMismatch) flaggedCount++;

      const p = getFdrPriority(fdr);
      if (p.level === "CRITICAL" || p.level === "HIGH") criticalUrgentCount++;

      if (v === "PENDING" || v === "UNDER_REVIEW") pendingOfficerCount++;
    });

    return { total, flaggedCount, criticalUrgentCount, pendingOfficerCount };
  }, [fdrs]);

  const fdrRepositoryKpis = useMemo(() => {
    const total = fdrs.length;
    let totalCollateral = 0;
    let activeVerified = 0;
    let expiringSoon = 0;
    const now = new Date();

    fdrs.forEach((f) => {
      totalCollateral += Number(f.amount || 0);
      const s = String(f.status || "").toUpperCase();
      const v = String(f.verification_status || "").toUpperCase();
      if (s === "ACTIVE" || v === "VERIFIED") activeVerified++;

      const days = getDaysRemaining(f.maturity_date, now);
      if (days !== null && days >= 0 && days <= 90) expiringSoon++;
    });

    return { total, totalCollateral, activeVerified, expiringSoon };
  }, [fdrs]);

  const renewalKpis = useMemo(() => {
    const total = renewalRequests.length;
    let totalValue = 0;
    let pendingCount = 0;
    let overdueCount = 0;
    let expiringSoonCount = 0;

    renewalRequests.forEach((item) => {
      totalValue += Number(item.amount || 0);
      if (item.status === "PENDING") pendingCount++;
      const days = getDaysRemaining(item.current_maturity_date);
      if (days !== null) {
        if (days < 0) overdueCount++;
        else if (days <= 60) expiringSoonCount++;
      }
    });

    return { total, totalValue, pendingCount, overdueCount, expiringSoonCount };
  }, [renewalRequests]);

  const institutionKpis = useMemo(() => {
    const total = institutions.length;
    let totalCollateral = 0;
    let highCompliance = 0;
    let attentionNeeded = 0;

    institutions.forEach((item) => {
      totalCollateral += Number(item.total_deposit_value || 0);
      if ((item.compliance_score ?? 0) >= 90) highCompliance++;
      if ((item.pending_fdrs || 0) > 0 || (item.compliance_score ?? 0) < 80) attentionNeeded++;
    });

    return { total, totalCollateral, highCompliance, attentionNeeded };
  }, [institutions]);

  const releaseKpis = useMemo(() => {
    const total = releaseRequests.length;
    let pending = 0;
    let underReview = 0;
    let moreInfo = 0;
    let approved = 0;
    let rejected = 0;
    releaseRequests.forEach((r) => {
      const s = String(r.status || "").toUpperCase();
      if (s === "PENDING") pending++;
      else if (s === "UNDER_REVIEW") underReview++;
      else if (s === "MORE_INFO_REQUIRED" || s === "MORE_INFORMATION_REQUIRED" || s === "ACTION_REQUIRED") moreInfo++;
      else if (s === "APPROVED") approved++;
      else if (s === "REJECTED") rejected++;
    });
    return { total, pending, underReview, moreInfo, approved, rejected };
  }, [releaseRequests]);

  const filteredReleaseRequests = useMemo(() => {
    return releaseRequests.filter((item) => {
      const s = String(item.status || "").toUpperCase();
      if (releaseTab === "pending" && s !== "PENDING") return false;
      if (releaseTab === "under_review" && s !== "UNDER_REVIEW") return false;
      if (releaseTab === "more_info" && !(s === "MORE_INFO_REQUIRED" || s === "MORE_INFORMATION_REQUIRED" || s === "ACTION_REQUIRED")) return false;
      if (releaseTab === "approved" && s !== "APPROVED") return false;
      if (releaseTab === "rejected" && s !== "REJECTED") return false;

      if (releaseSearch.trim()) {
        const q = releaseSearch.toLowerCase();
        const matchesInst = item.institution_name?.toLowerCase().includes(q);
        const matchesFdr = item.fdr_number?.toLowerCase().includes(q);
        const matchesBank = item.bank_name?.toLowerCase().includes(q);
        const matchesCode = item.aicte_code?.toLowerCase().includes(q);
        return matchesInst || matchesFdr || matchesBank || matchesCode;
      }
      return true;
    });
  }, [releaseRequests, releaseTab, releaseSearch]);

  // Unified FDR Table Renderer for Verification Queue and FDR Repository
  function renderFdrTable() {
    const isQueue = currentSection === "verification";

    const rows = pageFdrs.map((fdr) => {
      const isFlagged =
        ["FLAGGED", "FAILED", "REJECTED"].includes(
          String(fdr.verification_status || "").toUpperCase()
        ) || fdr.review_reason;

      return {
        id: fdr.id,
        className: isFlagged ? "row-flagged" : "",
        cells: [
          <div key="number" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <strong className="ow-link">{fdr.fdr_number}</strong>
            {fdr.review_reason && (
              <span style={{ fontSize: 11, color: "#ea580c", fontWeight: 600 }}>
                {fdr.review_reason}
              </span>
            )}
          </div>,
          <FdrPriorityBadge key="priority" priority={getFdrPriority(fdr)} compact />,
          <div key="inst" style={{ minWidth: 160 }}>
            <div style={{ fontWeight: 600, color: "#0f172a" }}>{fdr.institution?.name || "—"}</div>
            {fdr.institution?.aicte_code && (
              <span className="inst-detail-code-badge" style={{ marginTop: 2 }}>
                {fdr.institution.aicte_code}
              </span>
            )}
          </div>,
          fdr.bank_name || "—",
          <strong key="amt" style={{ color: "#002b5c" }}>
            {formatAmount(fdr.amount)}
          </strong>,
          <span key="app" className="ow-status-badge ow-badge-blue">
            {label(fdr.application?.application_type)}
          </span>,
          <TenorBadge key="tenor" dateValue={fdr.maturity_date} />,
          <StatusBadge key="status" status={fdr.status} />,
          <StatusBadge key="vstatus" status={fdr.verification_status} />,
          <ScoreBadge key="score" score={fdr.verification?.score} />,
          <button
            className="ow-action-view-btn"
            key="view"
            onClick={() => viewFdr(fdr.id)}
            title={isQueue ? "Open regulatory review drawer" : "View FDR details"}
          >
            {isQueue ? "Review →" : "View →"}
          </button>
        ]
      };
    });

    return (
      <>
        {/* HERO HEADER */}
        {isQueue ? (
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Regulatory Scrutiny & Review
              </span>
              <h1>Verification Queue</h1>
              <p>
                Review submitted FDR instruments, inspect automated discrepancy checks, and issue official lien verification decisions.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">{queueKpis.total}</span>
              <span className="ow-meta-label">Total in Queue</span>
            </div>
          </section>
        ) : (
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Master Collateral Register
              </span>
              <h1>FDR Portfolio Repository</h1>
              <p>
                Centralized repository of all fixed deposit receipts, institutional lien endorsements, and statutory collateral under AICTE custody.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">{formatAnalyticsAmount(fdrRepositoryKpis.totalCollateral, true)}</span>
              <span className="ow-meta-label">Total Collateral Under Lien</span>
            </div>
          </section>
        )}

        {/* SUMMARY KPI CARDS */}
        {isQueue ? (
          <section className="ow-kpi-grid">
            <div className="ow-kpi-card kpi-navy">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total In Queue</span>
                <div className="ow-kpi-value">{queueKpis.total}</div>
                <span className="ow-kpi-sub">Awaiting officer action</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-orange">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Flagged Discrepancies</span>
                <div className="ow-kpi-value">{queueKpis.flaggedCount}</div>
                <span className="ow-kpi-sub">Rule anomalies detected</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-red">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Critical & High Priority</span>
                <div className="ow-kpi-value">{queueKpis.criticalUrgentCount}</div>
                <span className="ow-kpi-sub">Urgent review required</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-blue">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Pending Scrutiny</span>
                <div className="ow-kpi-value">{queueKpis.pendingOfficerCount}</div>
                <span className="ow-kpi-sub">Under regulatory review</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
          </section>
        ) : (
          <section className="ow-kpi-grid">
            <div className="ow-kpi-card kpi-navy">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total Instruments</span>
                <div className="ow-kpi-value">{fdrRepositoryKpis.total}</div>
                <span className="ow-kpi-sub">Registered FDR instruments</span>
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
                <div className="ow-kpi-value">{formatAnalyticsAmount(fdrRepositoryKpis.totalCollateral, false)}</div>
                <span className="ow-kpi-sub">Under statutory AICTE lien</span>
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
                <span className="ow-kpi-label">Active & Compliant</span>
                <div className="ow-kpi-value">{fdrRepositoryKpis.activeVerified}</div>
                <span className="ow-kpi-sub">Verified lien with banks</span>
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
                <span className="ow-kpi-label">Expiring Soon (≤90 Days)</span>
                <div className="ow-kpi-value">{fdrRepositoryKpis.expiringSoon}</div>
                <span className="ow-kpi-sub">Mandatory renewal window</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>
          </section>
        )}

        {/* FILTER TOOLBAR */}
        <div className="ow-filter-toolbar">
          <div className="ow-filter-row-top">
            <div className="ow-search-box">
              <svg className="ow-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                className="ow-search-input"
                aria-label="Search FDRs"
                placeholder="Search FDR number, institution name, AICTE code, bank, state..."
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              />
            </div>
            <span className="ow-filter-count-badge">
              Showing <strong>{matchingFdrs.length}</strong> of {fdrs.length} records
            </span>
          </div>

          <div className="ow-filter-row-bottom">
            {isQueue && (
              <select
                className="ow-filter-select"
                aria-label="Filter by issue"
                value={issueFilter}
                onChange={(event) => { setIssueFilter(event.target.value); setPage(1); }}
              >
                <option value="">All Review Reasons</option>
                <option value="DUPLICATE">Duplicate FDR (R1)</option>
                <option value="AMOUNT_MISMATCH">Amount Mismatch (R4)</option>
                <option value="OCR_MISMATCH">OCR Mismatch</option>
                <option value="BANK_FAILED">Bank Verification Failure</option>
                <option value="PENDING">Pending Verification</option>
              </select>
            )}

            <select
              className="ow-filter-select"
              aria-label="Filter by priority"
              value={priorityFilter}
              onChange={(event) => { setPriorityFilter(event.target.value); setPage(1); }}
            >
              <option value="">All Priorities</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((level) => (
                <option key={level} value={level}>{label(level)}</option>
              ))}
            </select>

            <select
              className="ow-filter-select"
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
            >
              <option value="">All Statuses</option>
              {["PENDING", "VERIFIED", "FLAGGED", "FAILED", "REJECTED"].map((value) => (
                <option key={value} value={value}>{label(value)}</option>
              ))}
            </select>

            <select
              className="ow-filter-select"
              aria-label="Filter by bank"
              value={bankFilter}
              onChange={(event) => { setBankFilter(event.target.value); setPage(1); }}
            >
              <option value="">All Banks</option>
              {[...new Set(fdrs.map((fdr) => fdr.bank_name).filter(Boolean))].map((bank) => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>

            <select
              className="ow-filter-select"
              aria-label="Filter by maturity status"
              value={expiryFilter}
              onChange={(event) => { setExpiryFilter(event.target.value); setPage(1); }}
            >
              <option value="">All Maturity Statuses</option>
              <option value="NORMAL">Normal</option>
              <option value="EXPIRING SOON">Expiring Soon</option>
              <option value="CRITICAL">Critical (≤30d)</option>
              <option value="MATURED">Matured</option>
            </select>

            {activeFiltersCount > 0 && (
              <button
                type="button"
                className="ow-filter-clear-btn"
                onClick={resetFdrFilters}
              >
                ✕ Reset Filters ({activeFiltersCount})
              </button>
            )}
          </div>
        </div>

        <Table
          columns={["FDR Number", "Priority", "Institution", "Bank", "Amount", "Application", "Maturity Date", "Status", "Verification", "Score", "Action"]}
          rows={rows}
          empty={isQueue ? "No pending or flagged FDRs need attention." : "No FDR records are available."}
        />

        <div className="ow-pagination-bar">
          <span style={{ fontSize: 12.5, color: "#64748b" }}>
            Showing <strong>{matchingFdrs.length === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, matchingFdrs.length)}</strong> of <strong>{matchingFdrs.length}</strong> matching records
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              type="button"
              className="ow-button"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              ← Previous
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#002b5c", padding: "0 6px" }}>
              Page {page} of {pageCount}
            </span>
            <button
              type="button"
              className="ow-button"
              disabled={page >= pageCount}
              onClick={() => setPage(page + 1)}
            >
              Next →
            </button>
          </div>
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
            <button
              type="button"
              className="ow-action-view-btn"
              style={{ width: "fit-content", marginBottom: 12 }}
              onClick={() => { setSelectedInstitution(null); navigate("/officer/institutions"); }}
            >
              ← Back to Institutions Directory
            </button>

            <section className="inst-detail-hero">
              <div className="inst-detail-header-top">
                <div className="inst-detail-title-wrap">
                  <span className="inst-detail-code-badge">
                    AICTE CODE: {institution?.aicte_code || "—"}
                  </span>
                  <h2 className="inst-detail-name">{institution?.name}</h2>
                </div>
                {institutionDetail.compliance && (
                  <ComplianceBar score={institutionDetail.compliance.score} />
                )}
              </div>

              <div className="inst-detail-grid">
                <div className="inst-grid-item">
                  <span className="inst-grid-label">Campus Address</span>
                  <span className="inst-grid-val">{institution?.address || "—"}</span>
                </div>
                <div className="inst-grid-item">
                  <span className="inst-grid-label">City & State</span>
                  <span className="inst-grid-val">{[institution?.city, institution?.state].filter(Boolean).join(", ") || "—"}</span>
                </div>
                <div className="inst-grid-item">
                  <span className="inst-grid-label">Official Email</span>
                  <span className="inst-grid-val">{institution?.email || "—"}</span>
                </div>
                <div className="inst-grid-item">
                  <span className="inst-grid-label">FDRs on Record</span>
                  <span className="inst-grid-val" style={{ fontSize: 16, color: "#002b5c" }}>
                    {institutionDetail.fdrs?.length || 0} Instruments
                  </span>
                </div>
              </div>
            </section>

            <section className="ow-card">
              <h2>Security Deposit Receipts (FDRs)</h2>
              <Table
                columns={["FDR Number", "Priority", "Bank", "Amount", "Status", "Verification", "Action"]}
                rows={(institutionDetail.fdrs || []).map((fdr) => ({
                  id: fdr.id,
                  cells: [
                    <strong className="ow-link" key="num">{fdr.fdr_number}</strong>,
                    <FdrPriorityBadge key="priority" priority={getFdrPriority(fdr)} compact />,
                    fdr.bank_name,
                    <strong key="amt" style={{ color: "#002b5c" }}>{formatAmount(fdr.amount)}</strong>,
                    <StatusBadge key="status" status={fdr.status} />,
                    <StatusBadge key="vstatus" status={fdr.verification_status} />,
                    <button className="ow-action-view-btn" key="view" onClick={() => viewFdr(fdr.id)}>View →</button>
                  ]
                }))}
              />
            </section>

            <section className="ow-card">
              <h2>Applications & Approvals</h2>
              <Table
                columns={["Type", "Programme", "Level", "Discipline", "Academic Year", "Status", "Created"]}
                rows={(institutionDetail.applications || []).map((item) => ({
                  id: item.id,
                  cells: [
                    <span key="type" className="ow-status-badge ow-badge-blue">{label(item.application_type)}</span>,
                    item.programme_name || "—",
                    item.programme_level || "—",
                    item.discipline || "—",
                    item.academic_year || "—",
                    <StatusBadge key="status" status={item.status} />,
                    formatDate(item.created_at)
                  ]
                }))}
              />
            </section>

            <section className="ow-card">
              <h2>Verification Audit History & Evidence Documents</h2>
              <Table
                columns={["FDR Number", "Result", "Source", "Message", "Verification Date"]}
                rows={(institutionDetail.verificationHistory || []).map((item) => ({
                  id: item.id,
                  cells: [
                    <strong key="num">{item.fdr_number}</strong>,
                    <StatusBadge key="res" status={item.result} />,
                    item.verification_source || "—",
                    item.message || "—",
                    formatDate(item.verified_at)
                  ]
                }))}
              />
              <div style={{ marginTop: 18 }}>
                <Table
                  columns={["FDR Number", "File Name", "Document Type", "Uploaded At"]}
                  rows={(institutionDetail.documents || []).map((item) => ({
                    id: item.id,
                    cells: [
                      <strong key="num">{item.fdr_number}</strong>,
                      item.file_name,
                      <span key="type" className="ow-status-badge ow-badge-info">{label(item.document_type)}</span>,
                      formatDate(item.uploaded_at)
                    ]
                  }))}
                />
              </div>
            </section>
          </div>
        );
      }

      // Main Institution Directory List
      const filteredInstitutions = institutions.filter((item) =>
        `${item.name} ${item.aicte_code} ${item.city} ${item.state} ${item.email}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );

      return (
        <>
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Institutional Directory
              </span>
              <h1>Institutions & Compliance Directory</h1>
              <p>
                Directory of AICTE approved technical institutes, compliance rating performance, and security deposit custody portfolios.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">{institutions.length}</span>
              <span className="ow-meta-label">Approved Institutions</span>
            </div>
          </section>

          <section className="ow-kpi-grid">
            <div className="ow-kpi-card kpi-navy">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Approved Institutions</span>
                <div className="ow-kpi-value">{institutionKpis.total}</div>
                <span className="ow-kpi-sub">Registered technical institutes</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M3 7v14M21 7v14M6 10h2M6 14h2M6 18h2M11 10h2M11 14h2M11 18h2M16 10h2M16 14h2M16 18h2M3 7l9-4 9 4" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-blue">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total Collateral Value</span>
                <div className="ow-kpi-value">{formatAnalyticsAmount(institutionKpis.totalCollateral, true)}</div>
                <span className="ow-kpi-sub">All institutional liens</span>
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
                <span className="ow-kpi-label">High Compliance (≥90%)</span>
                <div className="ow-kpi-value">{institutionKpis.highCompliance}</div>
                <span className="ow-kpi-sub">Institutions fully compliant</span>
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
                <span className="ow-kpi-label">Requiring Scrutiny</span>
                <div className="ow-kpi-value">{institutionKpis.attentionNeeded}</div>
                <span className="ow-kpi-sub">Pending FDRs or score &lt;80</span>
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

          <div className="ow-filter-toolbar">
            <div className="ow-filter-row-top">
              <div className="ow-search-box">
                <svg className="ow-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="ow-search-input"
                  aria-label="Search institutions"
                  placeholder="Search institution name, AICTE code, city, state, email..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <span className="ow-filter-count-badge">
                Showing <strong>{filteredInstitutions.length}</strong> of {institutions.length} institutions
              </span>
            </div>
          </div>

          <Table
            columns={["Institution Name", "AICTE Code", "Location", "FDR Count", "Collateral Value", "Verified / Pending", "Compliance Score", "Status", "Action"]}
            rows={filteredInstitutions.map((item) => ({
              id: item.id,
              cells: [
                <strong key="name">{item.name}</strong>,
                <span key="code" className="inst-detail-code-badge">{item.aicte_code}</span>,
                [item.city, item.state].filter(Boolean).join(", ") || "—",
                <strong key="c" style={{ color: "#002b5c" }}>{item.total_fdrs || 0}</strong>,
                <strong key="v" style={{ color: "#002b5c" }}>{formatAmount(item.total_deposit_value)}</strong>,
                `${item.verified_fdrs || 0} / ${item.pending_fdrs || 0}`,
                <ComplianceBar key="score" score={item.compliance_score} />,
                <StatusBadge key="status" status={item.total_fdrs ? "ACTIVE" : "PENDING"} />,
                <button
                  type="button"
                  className="ow-action-view-btn"
                  key="view"
                  onClick={() => navigate(`/officer/institutions?institution=${item.id}`)}
                >
                  View Details →
                </button>
              ]
            }))}
            empty="No institutions found."
          />
        </>
      );
    }
    if (currentSection === "release-requests") {
      return (
        <>
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Security Deposit Refund & Lien Discharge
              </span>
              <h1>Collateral Release Requests</h1>
              <p>
                Review and process institutional requests to release or refund Fixed Deposit Receipts (FDR) upon course closure, programme capacity adjustments, or statutory completion.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">{releaseKpis.total}</span>
              <span className="ow-meta-label">Total Requests</span>
            </div>
          </section>

          {/* 5-card KPI Grid */}
          <section className="ow-kpi-grid" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            <div className="ow-kpi-card kpi-navy">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Total Dossiers</span>
                <div className="ow-kpi-value">{releaseKpis.total}</div>
                <span className="ow-kpi-sub">All release requests</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-orange">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Pending Review</span>
                <div className="ow-kpi-value">{releaseKpis.pending}</div>
                <span className="ow-kpi-sub">Awaiting officer clearance</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-blue">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Under Review</span>
                <div className="ow-kpi-value">{releaseKpis.underReview}</div>
                <span className="ow-kpi-sub">Active scrutiny</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-green">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Approved & Released</span>
                <div className="ow-kpi-value">{releaseKpis.approved}</div>
                <span className="ow-kpi-sub">Discharged collateral</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-red">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Rejected / Held</span>
                <div className="ow-kpi-value">{releaseKpis.rejected}</div>
                <span className="ow-kpi-sub">Moratorium holds</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
            </div>
          </section>

          {/* Filter Toolbar & Search */}
          <section className="ow-notif-toolbar" style={{ margin: "18px 0" }}>
            <div className="ow-notif-tabs">
              <button
                type="button"
                className={`ow-notif-tab ${releaseTab === "all" ? "active" : ""}`}
                onClick={() => setReleaseTab("all")}
              >
                All Requests <span className="tab-count">{releaseKpis.total}</span>
              </button>
              <button
                type="button"
                className={`ow-notif-tab ${releaseTab === "pending" ? "active" : ""}`}
                onClick={() => setReleaseTab("pending")}
              >
                Pending <span className="tab-count">{releaseKpis.pending}</span>
              </button>
              <button
                type="button"
                className={`ow-notif-tab ${releaseTab === "under_review" ? "active" : ""}`}
                onClick={() => setReleaseTab("under_review")}
              >
                Under Review <span className="tab-count">{releaseKpis.underReview}</span>
              </button>
              <button
                type="button"
                className={`ow-notif-tab ${releaseTab === "more_info" ? "active" : ""}`}
                onClick={() => setReleaseTab("more_info")}
              >
                More Info Required <span className="tab-count">{releaseKpis.moreInfo}</span>
              </button>
              <button
                type="button"
                className={`ow-notif-tab ${releaseTab === "approved" ? "active" : ""}`}
                onClick={() => setReleaseTab("approved")}
              >
                Approved <span className="tab-count">{releaseKpis.approved}</span>
              </button>
              <button
                type="button"
                className={`ow-notif-tab ${releaseTab === "rejected" ? "active" : ""}`}
                onClick={() => setReleaseTab("rejected")}
              >
                Rejected <span className="tab-count">{releaseKpis.rejected}</span>
              </button>
            </div>

            <div className="ow-notif-actions-bar">
              <div className="ow-notif-search">
                <svg
                  className="ow-notif-search-icon"
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="ow-notif-search-input"
                  placeholder="Search by college, FDR, or bank..."
                  value={releaseSearch}
                  onChange={(e) => setReleaseSearch(e.target.value)}
                  style={{ width: 280 }}
                />
              </div>
            </div>
          </section>

          {actionError && <p className="ow-error" role="alert">{actionError}</p>}

          {/* Table */}
          <Table
            columns={[
              "Request ID",
              "Institution Name",
              "FDR Number",
              "FDR Amount",
              "Bank Name",
              "Request Date",
              "Request Type",
              "Current Status",
              "Action"
            ]}
            rows={filteredReleaseRequests.map((item) => ({
              id: item.id,
              onClick: () => setSelectedReleaseRequest(item),
              className: "ow-clickable-row",
              cells: [
                <strong key="id">#{item.id}</strong>,
                <strong key="inst">{item.institution_name}</strong>,
                <span key="fdr" className="ow-link">{item.fdr_number}</span>,
                <strong key="amt" style={{ color: "#002b5c", fontSize: 14 }}>{formatAmount(item.amount)}</strong>,
                <span key="bank">{item.bank_name}</span>,
                <span key="date">{formatDate(item.created_at)}</span>,
                <span key="type" className="ow-status-badge ow-badge-blue">
                  {item.request_type || "Release"}
                </span>,
                <StatusBadge key="status" status={item.status} />,
                <button
                  className="ow-action-primary-btn"
                  key="review"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedReleaseRequest(item);
                  }}
                >
                  Review Request
                </button>
              ]
            }))}
            empty="No release requests match the selected filters."
          />

          {/* Release Request Detailed Review Modal */}
          {selectedReleaseRequest && (
            <OfficerReleaseRequestModal
              request={selectedReleaseRequest}
              onClose={() => setSelectedReleaseRequest(null)}
              onDecision={async (requestId, decision, reason) => {
                await reviewOfficerReleaseRequest(token, requestId, decision, reason);
                setSelectedReleaseRequest(null);
                setRefreshKey((value) => value + 1);
              }}
              onOpenDocument={(fdrObj, docObj) => openFdrDocument(fdrObj, docObj)}
            />
          )}
        </>
      );
    }
    if (currentSection === "notifications") {
      return (
        <OfficerNotificationsView
          notifications={notifications}
          unreadCount={data?.unreadCount || 0}
          fdrs={data?.fdrs || []}
          onOpenNotification={openNotification}
          onMarkRead={markRead}
          actionError={actionError}
        />
      );
    }
    if (currentSection === "reports") {
      return (
        <OfficerReports fdrs={data?.fdrs || []} onSelectFdr={viewFdr} />
      );
    }
    if (currentSection === "audit-log") {
      return (
        <OfficerAuditLog
          logs={data?.logs || []}
          onRefresh={() => setRefreshKey((value) => value + 1)}
          isLoading={loading}
          onSelectFdr={viewFdr}
        />
      );
    }
    if (currentSection === "users") {
      return (
        <>
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> User Administration
              </span>
              <h1>Authorized Portal Users</h1>
              <p>
                Roster of registered technical officers, institutional nodal contacts, and system administrators with active portal credentials.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">{data?.users?.length || 0}</span>
              <span className="ow-meta-label">Active Users</span>
            </div>
          </section>

          <Table
            columns={["Institution Name", "User Name", "Assigned Role", "Official Email", "Account Status", "Created Date"]}
            rows={(data?.users || []).map((item) => ({
              id: item.id,
              cells: [
                item.institution_name || demoUserDetails.get(item.email)?.institutionName || "AICTE Headquarters",
                <strong key="u">{item.name}</strong>,
                <span key="r" className="ow-status-badge ow-badge-blue">
                  {demoUserDetails.get(item.email)?.displayRole || label(item.role)}
                </span>,
                item.email,
                <StatusBadge
                  key="st"
                  status={item.email.endsWith(".invalid") ? "DEMO" : "ACTIVE"}
                />,
                formatDate(item.created_at)
              ]
            }))}
            empty="No users found."
          />
        </>
      );
    }
    if (currentSection === "renewals") {
      return (
        <>
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Maturity & Renewal Monitoring
              </span>
              <h1>Renewals & Maturity Management</h1>
              <p>
                Track approaching FDR maturity schedules, evaluate institutional renewal requests, and oversee replacement security deposit instruments.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">{renewalKpis.total}</span>
              <span className="ow-meta-label">Renewal Requests</span>
            </div>
          </section>

          <section className="ow-kpi-grid">
            <div className="ow-kpi-card kpi-navy">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Renewal Applications</span>
                <div className="ow-kpi-value">{renewalKpis.total}</div>
                <span className="ow-kpi-sub">Requests recorded</span>
              </div>
              <div className="ow-kpi-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </div>
            </div>

            <div className="ow-kpi-card kpi-blue">
              <div className="ow-kpi-content">
                <span className="ow-kpi-label">Renewal Collateral Value</span>
                <div className="ow-kpi-value">{formatAnalyticsAmount(renewalKpis.totalValue, true)}</div>
                <span className="ow-kpi-sub">Total under renewal review</span>
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
                <span className="ow-kpi-label">Expiring Soon (≤60 Days)</span>
                <div className="ow-kpi-value">{renewalKpis.expiringSoonCount}</div>
                <span className="ow-kpi-sub">Mandatory renewal window</span>
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
                <span className="ow-kpi-label">Overdue Instruments</span>
                <div className="ow-kpi-value">{renewalKpis.overdueCount}</div>
                <span className="ow-kpi-sub">Matured without action</span>
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

          {actionError && <p className="ow-error" role="alert">{actionError}</p>}

          <Table
            columns={["Institution", "Previous FDR & Bank", "Amount", "Current Maturity", "Renewal FDR Number", "Requested Maturity", "Request Date", "Status", "Action"]}
            rows={renewalRequests.map((item) => ({
              id: item.id,
              cells: [
                <strong key="inst">{item.institution_name}</strong>,
                <div key="prev" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontWeight: 600 }}>{item.old_fdr_number}</span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>{item.bank_name || "—"}</span>
                </div>,
                <strong key="amt" style={{ color: "#002b5c" }}>{formatAmount(item.amount)}</strong>,
                <TenorBadge key="mat" dateValue={item.current_maturity_date} />,
                item.new_fdr_number ? (
                  <span key="new" className="ow-status-badge ow-badge-blue">{item.new_fdr_number}</span>
                ) : (
                  <span key="new" className="ow-status-badge ow-badge-info">Awaiting Submission</span>
                ),
                formatDate(item.requested_maturity_date),
                formatDate(item.renewal_date),
                <StatusBadge key="status" status={item.status === "PENDING" ? "PENDING" : item.status} />,
                item.new_fdr_id ? (
                  <button className="ow-action-view-btn" key="view" onClick={() => viewFdr(item.new_fdr_id)}>
                    View New FDR →
                  </button>
                ) : ["APPROVED", "REJECTED"].includes(item.status) ? (
                  <span key="rev" style={{ fontSize: 12, color: "#16a34a", fontWeight: 700 }}>Reviewed ✓</span>
                ) : (
                  <button
                    className="ow-action-primary-btn"
                    key="review"
                    onClick={() => {
                      setRenewalReviewId(item.id);
                      setReviewReason("");
                      setActionError("");
                    }}
                  >
                    Review Application
                  </button>
                )
              ]
            }))}
            empty="No renewal requests have been submitted."
          />

          {renewalReviewId && (
            <section className="ow-card" style={{ marginTop: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h2>Review Renewal Request #{renewalReviewId}</h2>
                <button
                  type="button"
                  className="ow-button"
                  onClick={() => setRenewalReviewId(null)}
                >
                  ✕ Close
                </button>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>
                  Officer Decision Remarks & Statutory Notes
                </span>
                <textarea
                  value={reviewReason}
                  onChange={(event) => setReviewReason(event.target.value)}
                  placeholder="Enter compliance decision rationale, lien terms, or scrutiny comments..."
                  rows={3}
                  style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #cbd5e1" }}
                />
              </label>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="ow-action-primary-btn"
                  disabled={busy}
                  onClick={() => reviewRenewal(renewalReviewId, "APPROVED")}
                >
                  ✓ Approve Renewal
                </button>
                <button
                  type="button"
                  className="ow-button"
                  disabled={busy}
                  onClick={() => reviewRenewal(renewalReviewId, "UNDER_REVIEW")}
                >
                  Mark Under Review
                </button>
                <button
                  type="button"
                  className="ow-button"
                  disabled={busy}
                  onClick={() => reviewRenewal(renewalReviewId, "ACTION_REQUIRED")}
                >
                  Request Institution Action
                </button>
                <button
                  type="button"
                  className="ow-action-danger-btn"
                  disabled={busy}
                  onClick={() => reviewRenewal(renewalReviewId, "REJECTED")}
                >
                  ✕ Reject Renewal
                </button>
                <button
                  type="button"
                  className="ow-button"
                  onClick={() => setRenewalReviewId(null)}
                >
                  Cancel
                </button>
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
      const preferences = JSON.parse(
        localStorage.getItem("officerNotificationPreferences") || '{"inApp":true,"email":false}'
      );
      const officerName = profile?.name || currentUser?.name || "AICTE Regulation Officer";
      const officerEmail = profile?.email || currentUser?.email || "officer@aicte.gov.in";
      const officerRole = profile?.role || currentUser?.role || "OFFICER";
      const initials =
        officerName
          .split(" ")
          .map((p) => p[0])
          .slice(0, 2)
          .join("")
          .toUpperCase() || "RO";

      return (
        <div className="ow-stack">
          {/* HERO BANNER */}
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Administrative Configuration
              </span>
              <h1>Officer Control Centre & Settings</h1>
              <p>
                Manage regulatory officer credentials, operational notification delivery, audit trail governance, and platform security.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">Active</span>
              <span className="ow-meta-label">Officer Session</span>
            </div>
          </section>

          {/* SECTION 1: PROFILE / OFFICER ACCOUNT */}
          <section className="settings-section-card">
            <div className="settings-card-header">
              <div className="settings-header-text">
                <h2>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Officer Account & Identity
                </h2>
                <p>Official regulatory credentials and nodal administrative identity.</p>
              </div>
            </div>

            <div className="settings-profile-hero">
              <div className="settings-avatar-circle">{initials}</div>
              <div className="settings-profile-info">
                <h3 className="settings-profile-name">{officerName}</h3>
                <div className="settings-profile-meta">
                  <span className="settings-profile-role">{label(officerRole)} · Regulatory Scrutiny</span>
                  <span className="settings-profile-org">
                    AICTE Headquarters · Nelson Mandela Marg, New Delhi
                  </span>
                </div>
              </div>
            </div>

            <div className="settings-card-body">
              {profile ? (
                <form onSubmit={saveProfile}>
                  <div className="settings-form-grid">
                    <div className="settings-field-group">
                      <label className="settings-field-label">Official Full Name</label>
                      <input
                        className="settings-input"
                        value={profile.name || ""}
                        onChange={(event) =>
                          setProfile({ ...profile, name: event.target.value })
                        }
                        required
                        placeholder="Enter full name"
                      />
                    </div>
                    <div className="settings-field-group">
                      <label className="settings-field-label">Official Email Address</label>
                      <input
                        className="settings-input"
                        type="email"
                        value={profile.email || ""}
                        onChange={(event) =>
                          setProfile({ ...profile, email: event.target.value })
                        }
                        required
                        placeholder="officer@aicte.gov.in"
                      />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                    <button
                      type="submit"
                      className="ow-action-primary-btn"
                      disabled={busy}
                      style={{ padding: "8px 20px" }}
                    >
                      {busy ? "Saving Changes..." : "Save Profile Changes"}
                    </button>
                    {settingsMessage && (
                      <span className="ow-success" style={{ fontWeight: 600, fontSize: "13px" }}>
                        ✓ {settingsMessage}
                      </span>
                    )}
                    {actionError && (
                      <span className="ow-error" role="alert" style={{ fontWeight: 600, fontSize: "13px" }}>
                        ⚠ {actionError}
                      </span>
                    )}
                  </div>
                </form>
              ) : (
                <div style={{ color: "#64748b", fontSize: "13px" }}>Loading officer profile...</div>
              )}
            </div>
          </section>

          {/* SECTION 2: NOTIFICATION PREFERENCES */}
          <section className="settings-section-card">
            <div className="settings-card-header">
              <div className="settings-header-text">
                <h2>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Operational Notification Preferences
                </h2>
                <p>Configure automated verification alerts, renewal warnings, and compliance digests.</p>
              </div>
            </div>

            <div className="settings-card-body">
              <div className="settings-toggle-list">
                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-title">In-Portal Real-time Alerts</span>
                    <span className="settings-toggle-desc">
                      Display immediate badge counters and push alerts for newly submitted FDRs, OCR discrepancy flags, and urgent 30-day renewals.
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: preferences.inApp ? "#15803d" : "#64748b" }}>
                      {preferences.inApp ? "ENABLED" : "DISABLED"}
                    </span>
                    <label className="settings-switch-label">
                      <input
                        type="checkbox"
                        checked={preferences.inApp}
                        onChange={(event) => {
                          const next = { ...preferences, inApp: event.target.checked };
                          localStorage.setItem("officerNotificationPreferences", JSON.stringify(next));
                          setRefreshKey((value) => value + 1);
                        }}
                      />
                      <span className="settings-switch-slider" />
                    </label>
                  </div>
                </div>

                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-title">Officer Email Alerts</span>
                    <span className="settings-toggle-desc">
                      Deliver high-priority discrepancy escalations, audit export confirmations, and weekly compliance summaries to officer inbox.
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: preferences.email ? "#15803d" : "#64748b" }}>
                      {preferences.email ? "ENABLED" : "DISABLED"}
                    </span>
                    <label className="settings-switch-label">
                      <input
                        type="checkbox"
                        checked={preferences.email}
                        onChange={(event) => {
                          const next = { ...preferences, email: event.target.checked };
                          localStorage.setItem("officerNotificationPreferences", JSON.stringify(next));
                          setRefreshKey((value) => value + 1);
                        }}
                      />
                      <span className="settings-switch-slider" />
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3: SECURITY & AUTHENTICATION GOVERNANCE */}
          <section className="settings-section-card">
            <div className="settings-card-header">
              <div className="settings-header-text">
                <h2>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Security & Authentication Governance
                </h2>
                <p>Session encryption parameters, RBAC authorization tiers, and immutable audit controls.</p>
              </div>
            </div>

            <div className="settings-card-body">
              <div className="settings-info-grid">
                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Authentication Token</span>
                    <span className="settings-info-val">JSON Web Token (JWT Bearer)</span>
                  </div>
                  <span className="ow-status-badge ow-badge-success">
                    <span className="ow-status-dot" style={{ backgroundColor: "#16a34a" }} />
                    Active Session
                  </span>
                </div>

                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Regulatory RBAC Tier</span>
                    <span className="settings-info-val">AICTE Level 3 Regulation Officer</span>
                  </div>
                  <span className="ow-status-badge ow-badge-blue">
                    <span className="ow-status-dot" style={{ backgroundColor: "#0284c7" }} />
                    Full Scrutiny
                  </span>
                </div>

                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Audit Trail Integrity</span>
                    <span className="settings-info-val">SHA-256 Tamper-Evident Ledger</span>
                  </div>
                  <span className="ow-status-badge ow-badge-success">
                    <span className="ow-status-dot" style={{ backgroundColor: "#16a34a" }} />
                    Protected
                  </span>
                </div>

                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Regulatory Session Timeout</span>
                    <span className="settings-info-val">24 Hours Sliding Window</span>
                  </div>
                  <span className="ow-status-badge ow-badge-info">
                    <span className="ow-status-dot" style={{ backgroundColor: "#64748b" }} />
                    Auto-Refreshed
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 4: PLATFORM & SYSTEM INFORMATION */}
          <section className="settings-section-card">
            <div className="settings-card-header">
              <div className="settings-header-text">
                <h2>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  Platform & System Information
                </h2>
                <p>Runtime specifications, build metadata, and regulatory compliance standards.</p>
              </div>
            </div>

            <div className="settings-card-body">
              <div className="settings-info-grid">
                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Application Name</span>
                    <span className="settings-info-val">AICTE FDR & Security Deposit Portal</span>
                  </div>
                  <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>Web Enterprise</span>
                </div>

                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">System Build Version</span>
                    <span className="settings-info-val">v1.0.0 Production Release</span>
                  </div>
                  <span className="ow-status-badge ow-badge-blue">
                    <span className="ow-status-dot" style={{ backgroundColor: "#0284c7" }} />
                    Verified Build
                  </span>
                </div>

                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Deployment Environment</span>
                    <span className="settings-info-val">AICTE Central Regulatory Cloud</span>
                  </div>
                  <span className="ow-status-badge ow-badge-success">
                    <span className="ow-status-dot" style={{ backgroundColor: "#16a34a" }} />
                    Live
                  </span>
                </div>

                <div className="settings-info-box">
                  <div className="settings-info-left">
                    <span className="settings-info-label">Automated OCR Pipeline</span>
                    <span className="settings-info-val">Tesseract OCR v7.0 Neural Engine</span>
                  </div>
                  <span className="ow-status-badge ow-badge-purple">
                    <span className="ow-status-dot" style={{ backgroundColor: "#8b5cf6" }} />
                    Online
                  </span>
                </div>
              </div>
            </div>
          </section>
        </div>
      );
    }
    if (currentSection === "help") {
      return (
        <div className="ow-stack">
          {/* HERO BANNER */}
          <section className="ow-hero-header">
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Regulatory Help Desk
              </span>
              <h1>Officer Assistance & Compliance Desk</h1>
              <p>
                Standard operating procedures, statutory lien endorsement guidelines, automated verification rules, and portal operation manuals.
              </p>
            </div>
            <div className="ow-hero-meta">
              <span className="ow-meta-stat">6 Modules</span>
              <span className="ow-meta-label">Quick Guidance</span>
            </div>
          </section>

          {/* 6 QUICK HELP CARDS */}
          <section className="help-quick-grid">
            <button
              type="button"
              className="help-quick-card"
              onClick={() => navigate("/officer/verification")}
            >
              <div className="help-card-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <div className="help-card-content">
                <h3>Verification Queue</h3>
                <p>Inspect automated OCR checks, core-banking matches, and rule-based discrepancy flags.</p>
              </div>
              <span className="help-card-link">Open Queue →</span>
            </button>

            <button
              type="button"
              className="help-quick-card"
              onClick={() => navigate("/officer/fdrs")}
            >
              <div className="help-card-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <div className="help-card-content">
                <h3>FDR Portfolio Repository</h3>
                <p>Audit registered deposit certificates, search by issuing bank, and monitor lien status.</p>
              </div>
              <span className="help-card-link">Browse FDRs →</span>
            </button>

            <button
              type="button"
              className="help-quick-card"
              onClick={() => navigate("/officer/renewals")}
            >
              <div className="help-card-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                </svg>
              </div>
              <div className="help-card-content">
                <h3>Renewals & Maturity</h3>
                <p>Track approaching expirations, review replacement deposits, and issue renewal clearances.</p>
              </div>
              <span className="help-card-link">Manage Renewals →</span>
            </button>

            <button
              type="button"
              className="help-quick-card"
              onClick={() => navigate("/officer/release-requests")}
            >
              <div className="help-card-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                </svg>
              </div>
              <div className="help-card-content">
                <h3>Release Requests</h3>
                <p>Audit collateral release requests, 3-year statutory lock-in checks, and lien discharges.</p>
              </div>
              <span className="help-card-link">View Requests →</span>
            </button>

            <button
              type="button"
              className="help-quick-card"
              onClick={() => navigate("/officer/institutions")}
            >
              <div className="help-card-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 21h18M3 7v14M21 7v14M6 11h2M6 15h2M16 11h2M16 15h2M9 21V11h6v10" />
                </svg>
              </div>
              <div className="help-card-content">
                <h3>Institutions Directory</h3>
                <p>Inspect institutional compliance scores, FDR portfolios, and approved academic programmes.</p>
              </div>
              <span className="help-card-link">Explore Institutions →</span>
            </button>

            <button
              type="button"
              className="help-quick-card"
              onClick={() => navigate("/officer/reports")}
            >
              <div className="help-card-icon-wrap">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="20" x2="18" y2="10" />
                  <line x1="12" y1="20" x2="12" y2="4" />
                  <line x1="6" y1="20" x2="6" y2="14" />
                </svg>
              </div>
              <div className="help-card-content">
                <h3>Reports & Analytics</h3>
                <p>Access high-level portfolio distribution, maturity forecast schedules, and export data.</p>
              </div>
              <span className="help-card-link">View Analytics →</span>
            </button>
          </section>

          {/* FREQUENTLY ASKED QUESTIONS */}
          <section className="settings-section-card">
            <div className="settings-card-header">
              <div className="settings-header-text">
                <h2>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Frequently Asked Questions (FAQ)
                </h2>
                <p>Official regulatory guidelines and answers to common operational questions.</p>
              </div>
            </div>

            <div className="settings-card-body">
              {/* FAQ GROUP 1: VERIFICATION & DISCREPANCIES */}
              <div className="help-faq-group">
                <div className="help-faq-group-title">Automated Verification & Discrepancy Scrutiny</div>

                <details className="help-accordion" open>
                  <summary className="help-summary">
                    <span>Why does a submitted FDR show as "Pending Verification"?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    When an institution lodges a new Fixed Deposit Receipt, the system creates the initial ledger entry in <strong>PENDING</strong> status. The instrument remains pending until the automated background verification pipeline (optical character recognition, field consistency checks, and core-banking verification) executes, or until an AICTE regulation officer completes manual verification in the Verification Queue.
                  </div>
                </details>

                <details className="help-accordion">
                  <summary className="help-summary">
                    <span>What causes an FDR to receive a "Discrepancy Found" (FLAGGED) status?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    An FDR is automatically flagged when regulatory rule violations are detected:
                    <ul style={{ margin: "8px 0 0 0", paddingLeft: "20px" }}>
                      <li><strong>Rule R1 (Duplicate Instrument):</strong> The same FDR number has already been registered across another institution or submission.</li>
                      <li><strong>Rule R2 (Invalid Dates):</strong> The certificate's stated maturity date precedes its issuance date.</li>
                      <li><strong>Rule R4 (Financial Mismatch):</strong> Scanned certificate amount differs from core banking ledger confirmation.</li>
                      <li><strong>Rule R7 (Bank Timeout / Unconfirmed):</strong> Issuing bank API was unable to confirm existence of the deposit.</li>
                      <li><strong>Rule R9 (Lock-in Moratorium):</strong> Premature release attempt prior to statutory 3-year minimum lock-in.</li>
                    </ul>
                  </div>
                </details>

                <details className="help-accordion">
                  <summary className="help-summary">
                    <span>Is the direct bank check connected to live financial institutions?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    In the current configuration, scheduled banking verifications interface with a sandboxed core-banking adapter designed to simulate live banking responses for State Bank of India, HDFC Bank, ICICI Bank, Canara Bank, and Union Bank of India under realistic institutional compliance conditions.
                  </div>
                </details>

                <details className="help-accordion">
                  <summary className="help-summary">
                    <span>How does an officer issue an official verification decision or override?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    Navigate to the <strong>Verification Queue</strong>, locate the FDR record, and click <strong>Review</strong>. Inspect the OCR extracted text pane, mock bank ledger values, and discrepancy flags. Enter decision remarks and select either <strong>Verify FDR</strong> or <strong>Flag Discrepancy</strong>. Every decision is immutably timestamped in the Audit Log.
                  </div>
                </details>
              </div>

              {/* FAQ GROUP 2: RENEWALS & MATURITY */}
              <div className="help-faq-group">
                <div className="help-faq-group-title">Maturity Monitoring & Renewal Schedules</div>

                <details className="help-accordion">
                  <summary className="help-summary">
                    <span>When does an FDR transition into "Approaching Maturity"?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    Any active security deposit whose maturity date is within <strong>90 calendar days</strong> is automatically categorized under Approaching Maturity. Instruments with 30 or fewer days remaining are highlighted with an urgent warning status, requiring immediate institutional renewal.
                  </div>
                </details>

                <details className="help-accordion">
                  <summary className="help-summary">
                    <span>What is the standard regulatory procedure for an overdue matured FDR?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    If an FDR reaches its maturity date without a corresponding replacement deposit or approved renewal application, automated renewal reminders are sent to the institution's nodal officer. Officers can issue an "Action Required" notice from the Renewals desk or initiate regulatory review proceedings.
                  </div>
                </details>
              </div>

              {/* FAQ GROUP 3: RELEASE & LIEN DISCHARGE */}
              <div className="help-faq-group">
                <div className="help-faq-group-title">Collateral Release & Lien Discharge Governance</div>

                <details className="help-accordion">
                  <summary className="help-summary">
                    <span>What are the statutory prerequisites for approving an FDR Release Request?</span>
                    <span style={{ fontSize: "16px", color: "#64748b" }}>▾</span>
                  </summary>
                  <div className="help-accordion-body">
                    AICTE Approval Process Handbook (APH) mandates that security deposits must remain in joint custody for a minimum of <strong>3 years</strong> (or the statutory duration of the approved programme). Release requests submitted prior to lock-in expiry are rejected under Rule R9 unless accompanied by approved programme closure orders.
                  </div>
                </details>
              </div>
            </div>
          </section>

          {/* SOP AND SUPPORT CONTACT GRID */}
          <div className="help-bottom-grid">
            {/* SOP CARD */}
            <section className="help-sop-card">
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                Document Specifications & Endorsement Criteria
              </h3>
              <ul className="help-sop-list">
                <li>
                  <strong>Joint Lien Endorsement:</strong> Fixed deposit receipt must be explicitly drawn in the joint names of <em>"The Institution / Trust"</em> and <em>"The Member Secretary, AICTE, New Delhi"</em>.
                </li>
                <li>
                  <strong>High-Resolution Scans:</strong> Scanned documents must be uploaded in PDF or image format (≥300 DPI) with clear, unclipped instrument edges.
                </li>
                <li>
                  <strong>Signature & Seal:</strong> The instrument must feature valid authorized branch manager signatures, bank IFSC code, and institutional nodal signatures.
                </li>
                <li>
                  <strong>Auto-Renewal Clause:</strong> Security deposits should carry an endorsement confirming that the FDR is non-encashable without written AICTE discharge concurrence.
                </li>
              </ul>
            </section>

            {/* CONTACT / SUPPORT DESK */}
            <section className="help-contact-box">
              <h3>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                Officer Support & Help Desk
              </h3>

              <div className="help-contact-item">
                <div className="help-contact-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <div className="help-contact-text">
                  <span className="help-contact-label">Official Support Desk</span>
                  <span className="help-contact-val">officer@aicte.gov.in</span>
                </div>
              </div>

              <div className="help-contact-item">
                <div className="help-contact-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div className="help-contact-text">
                  <span className="help-contact-label">Operational Hours</span>
                  <span className="help-contact-val">Monday – Friday · 09:30 AM to 05:30 PM IST</span>
                </div>
              </div>

              <div className="help-contact-item">
                <div className="help-contact-icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </div>
                <div className="help-contact-text">
                  <span className="help-contact-label">Nodal Headquarters</span>
                  <span className="help-contact-val">Nelson Mandela Marg, Vasant Kunj, New Delhi - 110070</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      );
    }
    return <div className="ow-empty">This officer page is not available.</div>;
  }

  return (
    <OfficerLayout>
      <style>{`
        .ow-header {
          height: 74px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          background: #ffffff;
          border-bottom: 1px solid #cbd5e1;
        }
        .ow-header h1 {
          font-size: 22px;
          font-weight: 700;
          color: #0a2540;
          margin: 0;
          letter-spacing: -0.01em;
        }
        .ow-header a {
          color: #0369a1;
          font-size: 13.5px;
          font-weight: 600;
          text-decoration: none;
        }
        .ow-header a:hover {
          text-decoration: underline;
        }
        .ow-header-actions {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .ow-logout {
          min-height: 38px;
          padding: 0 16px;
          border: 1px solid #fca5a5;
          border-radius: 6px;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ow-logout:hover {
          background: #fee2e2;
        }
        .ow-content {
          padding: 24px 28px;
          max-width: 1560px;
          margin: auto;
        }
        .ow-card {
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 10px;
          padding: 20px;
          min-width: 0;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
        }
        .ow-card h2 {
          font-size: 17px;
          font-weight: 700;
          color: #0f294a;
          margin: 0 0 16px;
        }
        .ow-stack {
          display: grid;
          gap: 16px;
        }
        .ow-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }
        .ow-grid small,
        .ow-metrics small {
          display: block;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 6px;
        }
        .ow-grid strong,
        .ow-metrics strong {
          color: #0f172a;
          font-size: 14px;
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        .ow-table-wrap {
          overflow: auto;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 9px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
        }
        .ow-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          color: #1e293b;
        }
        .ow-table th {
          text-align: left;
          background: #f8fafc;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          white-space: nowrap;
          padding: 12px 14px;
          border-bottom: 1px solid #cbd5e1;
        }
        .ow-table td {
          padding: 12px 14px;
          border-bottom: 1px solid #e2e8f0;
          vertical-align: middle;
          color: #1e293b;
        }
        .ow-table tr:last-child td {
          border-bottom: 0;
        }
        .ow-table pre {
          max-width: 240px;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          font-size: 12px;
          margin: 0;
          color: #1e293b;
          font-family: inherit;
        }
        .ow-empty {
          padding: 32px !important;
          text-align: center;
          color: #475569;
          font-size: 13.5px;
        }
        .ow-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 14px;
        }
        .ow-filters input,
        .ow-filters select,
        .ow-form input:not([type=checkbox]),
        .ow-review textarea {
          min-height: 38px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 12px;
          background: #ffffff;
          color: #0f172a;
          font-size: 13px;
          font-family: inherit;
          box-sizing: border-box;
        }
        .ow-filters input::placeholder,
        .ow-form input::placeholder {
          color: #64748b;
        }
        .ow-filters input {
          flex: 1;
          min-width: 240px;
        }
        .ow-button {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #0369a1;
          padding: 8px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.15s ease;
        }
        .ow-button:hover:not(:disabled) {
          background: #f1f5f9;
          border-color: #94a3b8;
        }
        .ow-button:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .ow-danger {
          color: #b91c1c;
          border-color: #fca5a5;
          background: #fef2f2;
        }
        .ow-danger:hover:not(:disabled) {
          background: #fee2e2;
        }
        .ow-muted {
          color: #475569;
        }
        .ow-link {
          color: #0284c7;
          font-weight: 700;
          text-decoration: none;
        }
        .ow-link:hover {
          text-decoration: underline;
        }
        .ow-pagination,
        .ow-actions {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: flex-end;
          margin: 14px 0;
          font-size: 13px;
        }
        .ow-pagination span {
          color: #334155;
          font-weight: 500;
        }
        .ow-pagination span:first-child {
          margin-right: auto;
          color: #475569;
          font-size: 13px;
        }
        .ow-error {
          color: #991b1b;
          background: #fef2f2;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #fecaca;
          font-size: 13px;
        }
        .ow-success {
          color: #166534;
          background: #f0fdf4;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #bbf7d0;
          font-size: 13px;
          font-weight: 600;
        }
        .ow-subtle {
          color: #475569;
          font-size: 13px;
        }
        .ow-notification {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 10px;
          padding: 14px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .ow-notification small {
          display: block;
          color: #475569;
          font-size: 12px;
          margin-top: 6px;
        }
        .ow-notification.unread {
          border-left: 4px solid #0284c7;
          background: #f8fafc;
        }
        .ow-notification-message {
          border: 0;
          background: transparent;
          color: #0f172a;
          text-align: left;
          padding: 0;
          cursor: pointer;
          font: inherit;
          font-size: 13.5px;
          font-weight: 600;
        }
        .ow-review {
          margin-top: 18px;
        }
        .ow-review label,
        .ow-form label {
          display: grid;
          gap: 6px;
          margin: 12px 0;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }
        .ow-review textarea {
          min-height: 85px;
        }
        .ow-form input:not([type=checkbox]) {
          max-width: 500px;
          width: 100%;
        }
        .ow-check {
          display: flex !important;
          align-items: center;
          font-weight: 500;
          color: #1e293b;
        }
        .ow-metrics {
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
        }
        .ow-metrics .ow-card strong {
          font-size: 24px;
          font-weight: 800;
          color: #0a2540;
        }
        .ow-bar-row {
          display: grid;
          grid-template-columns: minmax(120px, 190px) 1fr minmax(120px, auto);
          gap: 14px;
          align-items: center;
          margin: 14px 0;
          font-size: 13px;
          color: #1e293b;
        }
        .ow-bar-row > div {
          height: 14px;
          border-radius: 10px;
          background: #edf2f7;
          overflow: hidden;
        }
        .ow-bar-row i {
          display: block;
          height: 100%;
          background: #0284c7;
          border-radius: 10px;
        }
        @media (max-width: 950px) {
          .ow-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        @media (max-width: 600px) {
          .ow-header {
            padding: 0 16px;
          }
          .ow-content {
            padding: 14px;
          }
          .ow-grid {
            grid-template-columns: 1fr;
          }
          .ow-bar-row {
            grid-template-columns: 1fr auto;
          }
          .ow-bar-row > div {
            grid-column: 1 / -1;
            grid-row: 2;
          }
          .ow-bar-row strong {
            grid-column: 2;
            grid-row: 1;
          }
          .ow-pagination {
            flex-wrap: wrap;
          }
        }
        .settings-layout-stack {
          max-width: 820px;
          gap: 24px;
        }
        .settings-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px 28px;
          box-shadow: 0 1px 3px rgba(0, 43, 92, 0.05), 0 1px 2px rgba(0, 0, 0, 0.02);
        }
        .settings-card-header {
          margin-bottom: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid #f1f5f9;
        }
        .settings-card-header h2 {
          font-size: 18px;
          font-weight: 700;
          color: #002b5c;
          margin: 0 0 4px 0;
          letter-spacing: -0.01em;
        }
        .settings-card-sub {
          font-size: 13.5px;
          color: #475569;
          margin: 0;
          font-weight: 400;
        }
        .settings-form-body {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .settings-form-body label {
          display: flex;
          flex-direction: column;
          gap: 7px;
          margin: 0;
          font-size: 13.5px;
          font-weight: 600;
          color: #0f172a;
        }
        .settings-form-body input {
          max-width: 520px;
          width: 100%;
          min-height: 42px;
          border: 1.5px solid #cbd5e1;
          border-radius: 8px;
          padding: 10px 14px;
          font-size: 14px;
          color: #0f172a;
          background: #ffffff;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .settings-form-body input:focus {
          border-color: #002b5c;
          box-shadow: 0 0 0 3px rgba(0, 43, 92, 0.12);
          outline: none;
        }
        .settings-btn-row {
          margin-top: 8px;
        }
        .ow-primary-button {
          background: #002b5c !important;
          color: #ffffff !important;
          border: none !important;
          padding: 10px 24px !important;
          font-size: 14px !important;
          font-weight: 600 !important;
          border-radius: 8px !important;
          cursor: pointer;
          transition: background 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 1px 2px rgba(0, 43, 92, 0.2);
        }
        .ow-primary-button:hover:not(:disabled) {
          background: #003e85 !important;
          box-shadow: 0 4px 12px rgba(0, 43, 92, 0.25);
        }
        .settings-checkbox-list {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .settings-check-item {
          display: flex !important;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          font-size: 14px;
          font-weight: 600;
          color: #1e293b;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .settings-check-item:hover {
          background: #f1f5f9;
          border-color: #cbd5e1;
        }
        .settings-check-item input[type="checkbox"] {
          width: 18px;
          height: 18px;
          accent-color: #002b5c;
          cursor: pointer;
          margin: 0;
        }
        .ow-top-meta-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .ow-user-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 20px;
          font-size: 13px;
          color: #334155;
          font-weight: 500;
        }
        .ow-user-badge strong {
          color: #002b5c;
          font-weight: 700;
        }
        .ow-badge-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #16a34a;
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.2);
        }
        .ow-refresh-button {
          display: inline-flex;
          align-items: center;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          color: #002b5c;
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .ow-refresh-button:hover {
          background: #f1f5f9;
          border-color: #002b5c;
        }
      `}</style>
        <header className="ow-header"><h1>{titles[currentSection] || "Officer Workspace"}</h1><div className="ow-header-actions"><Link to="/officer">← Dashboard</Link><button className="ow-logout" type="button" onClick={handleLogout}>Logout</button></div></header>
        <section className="ow-content">
          <div className="ow-top-meta-bar">
            <div className="ow-user-badge">
              <span className="ow-badge-status-dot" />
              <span>Signed in as <strong>{currentUser.name || "AICTE Regulation Officer"}</strong></span>
            </div>
            <button className="ow-button ow-refresh-button" type="button" onClick={() => setRefreshKey((value) => value + 1)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ marginRight: 6 }}>
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              Refresh
            </button>
          </div>
          {loading ? <div className="ow-card" role="status">Loading {titles[currentSection]?.toLowerCase() || "page"}…</div>
            : error ? <div className="ow-error" role="alert">{error} <button className="ow-button" onClick={() => setRefreshKey((value) => value + 1)}>Try again</button></div>
              : renderContent()}
        </section>
        {selectedFdr && (
          <OfficerFdrDetailsModal
            fdr={selectedFdr}
            detail={fdrDetailState.detail}
            loading={fdrDetailState.loading}
            error={fdrDetailState.error}
            openingDocumentId={fdrDetailState.openingDocumentId}
            onClose={() => setSelectedFdr(null)}
            onOpenDocument={openFdrDocument}
            onDecision={async (fdrId, decision, reason) => {
              await postOfficerFdrOverride(token, fdrId, decision, reason);
              setRefreshKey((value) => value + 1);
            }}
          />
        )}
    </OfficerLayout>
  );
}
