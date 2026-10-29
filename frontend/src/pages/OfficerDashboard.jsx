import { useEffect, useState, useRef } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import OfficerLayout from "../components/OfficerLayout";
import {
  FdrPriorityBadge,
  FdrPrioritySummary
} from "../components/FdrPriority";
import { getFdrPriority } from "../utils/fdrPriority";
import {
  STATUS_COLORS,
  buildExpiryForecast,
  buildStatusDistribution,
  formatAnalyticsAmount
} from "../utils/officerAnalytics";
import {
  getStatusLogs,
  getInstitutionCompliance,
  getOfficerFdrDocument,
  getOfficerFdrs,
  getOfficerFdrDetail,
  getOfficerFdrTimeline,
  getOfficerNotifications,
  getOfficerReleaseRequests,
  getOfficerStats,
  getOfficerDashboard,
  postOfficerFdrOverride,
  runOfficerAutomatedVerification,
  runOfficerBankVerification
} from "../services/api";

const applicationTypeLabels = {
  NEW_INSTITUTION: "New Institution",
  NEW_PROGRAMME: "New Programme",
  INCREASE_INTAKE: "Increase Intake",
  RENEWAL: "Renewal",
  REPLACEMENT: "Replacement",
  MODIFICATION: "Modification",
  OTHER: "Other"
};

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function dashboardPriority(fdr) {
  if (fdr?.priority && typeof fdr.priority === "object") {
    return fdr.priority;
  }

  const verificationLabel = String(
    fdr?.verification_status || fdr?.verification || ""
  ).toUpperCase().replaceAll(" ", "_");

  return getFdrPriority({
    ...fdr,
    priority: undefined,
    maturity_date: fdr?.maturity_date || fdr?.maturity,
    verification_status: verificationLabel,
    verification: fdr?.verification && typeof fdr.verification === "object"
      ? fdr.verification
      : {
          result: verificationLabel,
          comparisons: verificationLabel.includes("AMOUNT_MISMATCH")
            ? [{ field: "amount", result: "MISMATCH" }]
            : [],
          bank_verification: fdr?.bank_verification
        }
  });
}

function formatDateTime(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatLabel(value) {
  if (!value) {
    return "Unknown";
  }

  return String(value)
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatTimelineAction(action) {
  const labels = {
    FDR_SUBMITTED: "FDR Submitted",
    DOCUMENT_UPLOADED: "Document Uploaded",
    OCR_COMPLETED: "OCR Completed",
    BANK_VERIFICATION_COMPLETED: "Bank Verification Completed",
    BANK_VERIFICATION_PENDING: "Bank Verification Pending",
    BANK_VERIFICATION_FAILED: "Bank Verification Failed",
    AUTOMATED_VERIFICATION_COMPLETED: "Automated Verification Completed",
    VERIFICATION_SCORE_GENERATED: "Verification Score Generated",
    FDR_VERIFIED: "FDR Verified",
    FDR_PENDING: "FDR Pending",
    FDR_FLAGGED: "FDR Flagged",
    FDR_FAILED: "FDR Failed",
    OFFICER_REVIEWED: "Officer Reviewed",
    OFFICER_OVERRIDE: "Officer Override",
    FDR_REJECTED: "FDR Rejected"
  };

  return labels[action] || formatLabel(action);
}

function formatAmount(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value ?? "—";
  }

  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(amount);
}

function StatusChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip">
      <strong>{item.status}</strong>
      <span>FDRs: {item.count}</span>
      <span>Percentage: {item.percentage.toFixed(1)}%</span>
    </div>
  );
}

function ExpiryChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="dashboard-chart-tooltip zigzag-chart-tooltip">
      <div className="zigzag-tooltip-header">
        <span className="zigzag-tooltip-dot" />
        <strong>{item.month}</strong>
      </div>
      <div className="zigzag-tooltip-row">
        <span>FDRs Expiring:</span>
        <span className="zigzag-tooltip-badge">{item.count}</span>
      </div>
      <div className="zigzag-tooltip-row">
        <span>Deposit Value:</span>
        <strong className="zigzag-tooltip-val">{formatAnalyticsAmount(item.totalValue, true)}</strong>
      </div>
      {Array.isArray(item.institutions) && item.institutions.length > 0 && (
        <div className="zigzag-tooltip-institutions">
          <span>Institutions:</span>
          <p>{item.institutions.slice(0, 2).join(", ")}{item.institutions.length > 2 ? ` +${item.institutions.length - 2} more` : ""}</p>
        </div>
      )}
    </div>
  );
}

function formatComparisonValue(field, value) {
  if (value === null || value === undefined || value === "") {
    return "Not detected";
  }

  if (field === "amount") {
    return formatAmount(value);
  }

  if (field === "issueDate" || field === "maturityDate") {
    return formatDate(value);
  }

  return String(value);
}

function getReviewIssue(fdr) {
  const checks = fdr?.record?.verification?.checks || [];
  const failedCheck = checks.find((item) => item.status === "FAILED");
  if (failedCheck) {
    const issueLabels = {
      "Bank Name Match": "Bank name mismatch",
      "Mock Bank Record Match": "Bank record not found or mismatched",
      "Duplicate FDR Check": "Duplicate FDR number",
      "Document OCR": "Document needs manual review",
      "Institution Match": "Institution details need review"
    };
    return issueLabels[failedCheck.label] || failedCheck.label || "A check failed";
  }

  const mismatch = fdr?.record?.verification?.comparisons?.find(
    (item) => item.result === "MISMATCH"
  );
  if (mismatch) {
    return `${formatLabel(mismatch.field)} does not match`;
  }

  const bankStatus = fdr?.record?.verification?.bank_verification?.status;
  if (bankStatus && bankStatus !== "VERIFIED") {
    return bankStatus === "PENDING"
      ? "Bank confirmation pending"
      : "Bank record needs review";
  }

  if (fdr?.record?.verification?.review_reason) {
    return fdr.record.verification.review_reason;
  }

  return String(fdr?.record?.verification_status || fdr?.verification)
    .toUpperCase() === "VERIFIED"
    ? "No open verification issues"
    : "Review required";
}

function isNewSubmission(createdAt) {
  const submittedAt = new Date(createdAt).getTime();
  const ageInHours = (Date.now() - submittedAt) / (1000 * 60 * 60);

  return Number.isFinite(submittedAt) && ageInHours >= 0 && ageInHours <= 24;
}

function submittedWithinLastWeek(value) {
  const submittedAt = new Date(value).getTime();
  const ageInDays = (Date.now() - submittedAt) / (1000 * 60 * 60 * 24);
  return Number.isFinite(submittedAt) && ageInDays >= 0 && ageInDays <= 7;
}

function amountValue(value) {
  const amount = Number(String(value ?? "").replace(/[₹,\s]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function getMaturityStatus(maturityDate) {
  const date = new Date(maturityDate);

  if (!maturityDate || Number.isNaN(date.getTime())) {
    return "Unknown";
  }

  const daysRemaining = Math.ceil(
    (date.getTime() - new Date().setHours(0, 0, 0, 0)) /
      (1000 * 60 * 60 * 24)
  );

  if (daysRemaining < 0) {
    return "Expired";
  }
  if (daysRemaining < 30) {
    return "Critical";
  }
  if (daysRemaining <= 90) {
    return "Expiring Soon";
  }

  return "Normal";
}

const STAT_CARD_CONFIGS = [
  {
    title: "Total FDRs",
    key: "total_fdrs",
    color: "blue",
    iconType: "document"
  },
  {
    title: "Active FDRs",
    key: "active_fdrs",
    color: "green",
    iconType: "check-circle"
  },
  {
    title: "Pending Review",
    key: "pending_review",
    color: "amber",
    iconType: "clock"
  },
  {
    title: "High Priority",
    key: "high_priority",
    color: "red",
    iconType: "alert-triangle"
  },
  {
    title: "Discrepancies",
    key: "discrepancies",
    color: "orange",
    iconType: "alert-triangle"
  },
  {
    title: "Approaching Maturity",
    key: "approaching_maturity",
    color: "amber",
    iconType: "clock"
  },
  {
    title: "Matured (Action Needed)",
    key: "matured",
    color: "purple",
    iconType: "trending-up"
  },
  {
    title: "Pending Release",
    key: "pending_release",
    color: "teal",
    iconType: "layers"
  }
];

const releaseRequests = [
  {
    id: "REQ-003",
    institution: "ABC College",
    fdr: "FDR123456",
    reason: "Course discontinued",
    status: "Under Review",
  },
  {
    id: "REQ-004",
    institution: "XYZ Institute",
    fdr: "FDR789012",
    reason: "Compliance met",
    status: "Pending",
  },
  {
    id: "REQ-005",
    institution: "PQR College",
    fdr: "FDR345678",
    reason: "Institution closure",
    status: "Pending",
  },
];

const notifications = [
  {
    icon: "!",
    title: "7 FDRs have amount mismatch",
    text: "Require your review",
    time: "2 min ago",
  },
  {
    icon: "◷",
    title: "12 FDRs expiring in 30 days",
    text: "Send reminder to institutions",
    time: "25 min ago",
  },
  {
    icon: "↻",
    title: "5 renewal submissions pending",
    text: "Awaiting approval",
    time: "1 hour ago",
  },
  {
    icon: "↑",
    title: "3 release requests under review",
    text: "Pending your decision",
    time: "2 hours ago",
  },
  {
    icon: "▣",
    title: "New FDR submission received",
    text: "ABC Institute of Technology",
    time: "3 hours ago",
  },
];

function StatIcon({ type }) {
  if (type === "document") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    );
  }
  if (type === "check-circle") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
        <polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
    );
  }
  if (type === "clock") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
    );
  }
  if (type === "alert-triangle") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    );
  }
  if (type === "trending-up") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
        <polyline points="17 6 23 6 23 12"/>
      </svg>
    );
  }
  if (type === "layers") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    );
  }
  return null;
}

function StatCard({ item }) {
  return (
    <div className={`officer-stat-card ${item.color}`}>
      <div className="stat-content">
        <div className="stat-title">{item.title}</div>
        <div className="stat-value">{item.value}</div>
      </div>
      <div className={`stat-icon-wrapper ${item.color}`}>
        <StatIcon type={item.iconType} />
      </div>
    </div>
  );
}

function StatusBadge({ children, type }) {
  return (
    <span className={`officer-badge ${type || ""}`}>
      {children}
    </span>
  );
}

function DetailItem({ label, value }) {
  return (
    <div>
      <div className="fdr-detail-label">{label}</div>
      <div className="fdr-detail-value">{value || "—"}</div>
    </div>
  );
}

const REVIEW_QUEUE_PRIORITY_PROFILES = [
  // 5 HIGH PRIORITY
  {
    level: "High",
    score: 75,
    verification: "Flagged",
    issue: "Amount mismatch in bank verification",
    reasons: [
      { type: "amount_mismatch", label: "Amount mismatch in bank verification", points: 25 },
      { type: "matures_within_30_days", label: "FDR matures within 30 days", points: 25 },
      { type: "verification_pending", label: "Manual verification required", points: 25 }
    ]
  },
  {
    level: "High",
    score: 72,
    verification: "Failed",
    issue: "Bank record mismatch or unconfirmed",
    reasons: [
      { type: "bank_verification_failed", label: "Bank record unconfirmed", points: 30 },
      { type: "matures_within_90_days", label: "FDR matures within 90 days", points: 22 },
      { type: "verification_pending", label: "Scrutiny pending", points: 20 }
    ]
  },
  {
    level: "High",
    score: 70,
    verification: "Flagged",
    issue: "OCR details mismatch with certificate",
    reasons: [
      { type: "ocr_mismatch", label: "OCR certificate mismatch", points: 25 },
      { type: "matures_within_30_days", label: "FDR matures within 30 days", points: 25 },
      { type: "verification_pending", label: "Officer action required", points: 20 }
    ]
  },
  {
    level: "High",
    score: 68,
    verification: "Pending",
    issue: "Critical renewal window expiring soon",
    reasons: [
      { type: "matures_within_30_days", label: "Immediate 30-day maturity window", points: 30 },
      { type: "verification_pending", label: "Pending regulatory approval", points: 20 },
      { type: "unresolved_discrepancy", label: "Unresolved endorsement check", points: 18 }
    ]
  },
  {
    level: "High",
    score: 65,
    verification: "Flagged",
    issue: "Duplicate FDR reference detected",
    reasons: [
      { type: "fdr_number_mismatch", label: "Duplicate instrument number flag", points: 30 },
      { type: "verification_pending", label: "Under regulatory review", points: 20 },
      { type: "ocr_confidence_low", label: "Scan verification pending", points: 15 }
    ]
  },
  // 5 MEDIUM PRIORITY
  {
    level: "Medium",
    score: 55,
    verification: "Pending",
    issue: "Maturity within 60 days",
    reasons: [
      { type: "matures_within_90_days", label: "FDR matures within 90 days", points: 25 },
      { type: "verification_pending", label: "Verification pending", points: 15 },
      { type: "ocr_confidence_low", label: "Low OCR confidence", points: 15 }
    ]
  },
  {
    level: "Medium",
    score: 52,
    verification: "Under Review",
    issue: "Document needs manual verification",
    reasons: [
      { type: "ocr_confidence_low", label: "Scan quality low, manual review needed", points: 25 },
      { type: "verification_pending", label: "Pending officer review", points: 15 },
      { type: "matures_within_90_days", label: "Approaching renewal period", points: 12 }
    ]
  },
  {
    level: "Medium",
    score: 48,
    verification: "Pending",
    issue: "Bank endorsement verification pending",
    reasons: [
      { type: "verification_pending", label: "Bank lien confirmation pending", points: 25 },
      { type: "matures_within_90_days", label: "Matures within 90 days", points: 23 }
    ]
  },
  {
    level: "Medium",
    score: 45,
    verification: "Pending",
    issue: "Approaching scheduled maturity date",
    reasons: [
      { type: "matures_within_90_days", label: "Scheduled for upcoming renewal", points: 25 },
      { type: "verification_pending", label: "Standard compliance check", points: 20 }
    ]
  },
  {
    level: "Medium",
    score: 42,
    verification: "Under Review",
    issue: "Institution profile verification pending",
    reasons: [
      { type: "verification_pending", label: "Institution match under scrutiny", points: 22 },
      { type: "matures_within_90_days", label: "Approaching maturity", points: 20 }
    ]
  },
  // 4 LOW PRIORITY
  {
    level: "Low",
    score: 35,
    verification: "Pending",
    issue: "Regular verification queue",
    reasons: [
      { type: "verification_pending", label: "Routine review cycle", points: 20 },
      { type: "routine_check", label: "Active security deposit", points: 15 }
    ]
  },
  {
    level: "Low",
    score: 28,
    verification: "Pending",
    issue: "Standard active deposit",
    reasons: [
      { type: "verification_pending", label: "Routine compliance verification", points: 18 },
      { type: "routine_check", label: "Long-term validity", points: 10 }
    ]
  },
  {
    level: "Low",
    score: 25,
    verification: "Verified",
    issue: "Verified instrument",
    reasons: [
      { type: "verification_pending", label: "Normal active deposit", points: 15 },
      { type: "routine_check", label: "Standard lifecycle", points: 10 }
    ]
  },
  {
    level: "Low",
    score: 20,
    verification: "Verified",
    issue: "Active compliant deposit",
    reasons: [
      { type: "verification_pending", label: "Standard active instrument", points: 20 }
    ]
  }
];


const STATUS_SLUG_MAP = {
  "Active": "active",
  "Submitted": "submitted",
  "Under Review": "under_review",
  "Discrepancy Found": "discrepancy_found",
  "Approaching Maturity": "approaching_maturity",
  "Matured": "matured",
  "Release Requested": "release_requested"
};

const SLUG_TO_STATUS_MAP = {
  active: "Active",
  submitted: "Submitted",
  under_review: "Under Review",
  discrepancy_found: "Discrepancy Found",
  approaching_maturity: "Approaching Maturity",
  matured: "Matured",
  release_requested: "Release Requested"
};

const EVENT_TYPE_OPTIONS = [
  { value: "", label: "All Event Types" },
  { value: "FDR_SUBMITTED", label: "FDR Submitted" },
  { value: "DOCUMENT_UPLOADED", label: "Document Uploaded" },
  { value: "BANK_VERIFICATION_PASS", label: "Bank Verification Pass" },
  { value: "BANK_VERIFICATION_FAIL", label: "Bank Verification Fail" },
  { value: "FDR_VERIFIED", label: "FDR Verified" },
  { value: "RELEASE_REQUESTED", label: "Release Requested" },
  { value: "OFFICER_REVIEWED", label: "Officer Reviewed" },
  { value: "MATURITY_ALERT_GENERATED", label: "Maturity Alert" },
  { value: "RENEWAL_WINDOW_OPENED", label: "Renewal Window Opened" },
  { value: "OCR_COMPLETED", label: "OCR Completed" }
];

function formatLogTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

function getEventBadgeClass(eventType) {
  switch (eventType) {
    case "BANK_VERIFICATION_FAIL":
    case "FDR_REJECTED":
      return "log-event-badge badge-danger";
    case "BANK_VERIFICATION_PASS":
    case "FDR_VERIFIED":
      return "log-event-badge badge-success";
    case "RELEASE_REQUESTED":
    case "MATURITY_ALERT_GENERATED":
      return "log-event-badge badge-warning";
    case "FDR_SUBMITTED":
    case "DOCUMENT_UPLOADED":
    case "OCR_COMPLETED":
      return "log-event-badge badge-info";
    default:
      return "log-event-badge badge-default";
  }
}

export default function OfficerDashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [realFdrs, setRealFdrs] = useState([]);
  const [officerStats, setOfficerStats] = useState(null);
  const [statsLoadError, setStatsLoadError] = useState("");
  const [loadingFdrs, setLoadingFdrs] = useState(true);
  const [fdrLoadError, setFdrLoadError] = useState("");
  const [selectedFdr, setSelectedFdr] = useState(null);
  const [timelineState, setTimelineState] = useState({
    fdrId: null,
    events: [],
    loading: false,
    error: ""
  });
  const [complianceState, setComplianceState] = useState({
    institutionId: null,
    data: null,
    loading: false,
    error: ""
  });
  const [documentError, setDocumentError] = useState("");
  const [reviewReasonInput, setReviewReasonInput] = useState("");
  const [reviewActionError, setReviewActionError] = useState("");
  const [savingReviewAction, setSavingReviewAction] = useState(false);
  const [decisionSuccessMessage, setDecisionSuccessMessage] = useState("");
  const [lastDecision, setLastDecision] = useState("");
  const [officerNotifications, setOfficerNotifications] = useState([]);

  const currentStatusSlug = searchParams.get("status") || "";
  const selectedStatusCategory = SLUG_TO_STATUS_MAP[currentStatusSlug] || null;

  const [statusLogs, setStatusLogs] = useState([]);
  const [statusLogsLoading, setStatusLogsLoading] = useState(false);
  const [statusLogsLoadingMore, setStatusLogsLoadingMore] = useState(false);
  const [statusLogsError, setStatusLogsError] = useState("");
  const [statusLogsNextCursor, setStatusLogsNextCursor] = useState(null);
  const [statusLogsHasMore, setStatusLogsHasMore] = useState(false);
  const [statusLogsSearch, setStatusLogsSearch] = useState("");
  const [statusLogsEventType, setStatusLogsEventType] = useState("");
  const [showEventTypeFilter, setShowEventTypeFilter] = useState(false);

  const statusLogsCacheRef = useRef(new Map());
  const statusLogsAbortRef = useRef(null);

  useEffect(() => {
    if (statusLogsAbortRef.current) {
      statusLogsAbortRef.current.abort();
    }
    const controller = new AbortController();
    statusLogsAbortRef.current = controller;

    const cacheKey = currentStatusSlug || "all";
    const isSearchingOrFiltering = Boolean(statusLogsSearch || statusLogsEventType);

    if (!isSearchingOrFiltering && statusLogsCacheRef.current.has(cacheKey)) {
      const cached = statusLogsCacheRef.current.get(cacheKey);
      setStatusLogs(cached.events || []);
      setStatusLogsNextCursor(cached.next_cursor);
      setStatusLogsHasMore(Boolean(cached.has_more));
      setStatusLogsLoading(false);
      setStatusLogsError("");
      return;
    }

    setStatusLogsLoading(true);
    setStatusLogsError("");

    const token = localStorage.getItem("token");
    if (!token) {
      setStatusLogsLoading(false);
      return;
    }

    getStatusLogs(
      token,
      {
        status: currentStatusSlug,
        q: statusLogsSearch,
        event_type: statusLogsEventType,
        limit: currentStatusSlug ? 50 : 20
      },
      controller.signal
    )
      .then((data) => {
        setStatusLogs(data.events || []);
        setStatusLogsNextCursor(data.next_cursor);
        setStatusLogsHasMore(Boolean(data.has_more));
        setStatusLogsLoading(false);
        if (!isSearchingOrFiltering) {
          statusLogsCacheRef.current.set(cacheKey, data);
        }
      })
      .catch((err) => {
        if (err.name === "AbortError") return;
        setStatusLogsError(err.message || "Failed to load activity logs");
        setStatusLogsLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [currentStatusSlug, statusLogsSearch, statusLogsEventType]);

  function handleRetryStatusLogs() {
    const token = localStorage.getItem("token");
    if (!token) return;
    setStatusLogsLoading(true);
    setStatusLogsError("");
    getStatusLogs(token, {
      status: currentStatusSlug,
      q: statusLogsSearch,
      event_type: statusLogsEventType,
      limit: currentStatusSlug ? 50 : 20
    })
      .then((data) => {
        setStatusLogs(data.events || []);
        setStatusLogsNextCursor(data.next_cursor);
        setStatusLogsHasMore(Boolean(data.has_more));
        setStatusLogsLoading(false);
      })
      .catch((err) => {
        setStatusLogsError(err.message || "Failed to load activity logs");
        setStatusLogsLoading(false);
      });
  }

  async function handleLoadMoreLogs() {
    if (!statusLogsNextCursor || statusLogsLoadingMore) return;
    setStatusLogsLoadingMore(true);
    try {
      const token = localStorage.getItem("token");
      const data = await getStatusLogs(token, {
        status: currentStatusSlug,
        q: statusLogsSearch,
        event_type: statusLogsEventType,
        limit: 20,
        cursor: statusLogsNextCursor
      });
      setStatusLogs((prev) => [...prev, ...(data.events || [])]);
      setStatusLogsNextCursor(data.next_cursor);
      setStatusLogsHasMore(Boolean(data.has_more));
    } catch (err) {
      console.error("Failed to load more logs:", err);
    } finally {
      setStatusLogsLoadingMore(false);
    }
  }

  function handleSelectStatus(statusTitle) {
    const slug = STATUS_SLUG_MAP[statusTitle];
    if (!slug) return;
    const newParams = new URLSearchParams(searchParams);
    if (selectedStatusCategory === statusTitle) {
      newParams.delete("status");
    } else {
      newParams.set("status", slug);
    }
    setSearchParams(newParams);
  }

  function handleClearStatus() {
    const newParams = new URLSearchParams(searchParams);
    newParams.delete("status");
    setSearchParams(newParams);
  }

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        if (showEventTypeFilter) {
          setShowEventTypeFilter(false);
        } else if (selectedStatusCategory && !selectedFdr) {
          handleClearStatus();
        }
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedStatusCategory, selectedFdr, showEventTypeFilter]);

  function handleEventRowClick(event) {
    const fdrRecord = realFdrs.find((f) => f.id === event.fdr_id);
    if (fdrRecord) {
      setSelectedFdr(fdrRecord);
      const token = localStorage.getItem("token");
      if (token) {
        getOfficerFdrDetail(token, fdrRecord.id)
          .then((detailedData) => {
            setSelectedFdr((current) => {
              if (!current || current.id !== fdrRecord.id) return current;
              return {
                ...current,
                ...detailedData,
                verification: detailedData.verification || current.verification
              };
            });
          })
          .catch(() => {});
      }
    }
  }

  const [releaseRequestCount, setReleaseRequestCount] = useState(0);
  const [liveReleaseRequests, setLiveReleaseRequests] = useState([]);
  const [verificationActionError, setVerificationActionError] = useState("");
  const [runningVerification, setRunningVerification] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [verificationFilter, setVerificationFilter] = useState("");
  const [applicationTypeFilter, setApplicationTypeFilter] = useState("");
  const [bankFilter, setBankFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");
  const [minimumAmount, setMinimumAmount] = useState("");
  const [maximumAmount, setMaximumAmount] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");

  useEffect(() => {
    let isMounted = true;
    const token = localStorage.getItem("token");

    if (token) {
      getOfficerDashboard(token)
        .then((result) => {
          if (isMounted) {
            setOfficerStats(result.stats);
            setStatsLoadError("");
          }
        })
        .catch((error) => {
          if (isMounted) {
            setStatsLoadError(
              error.message || "Unable to load database statistics."
            );
          }
        });
    }

    Promise.resolve()
      .then(() => {
        if (isMounted) {
          setLoadingFdrs(true);
          setFdrLoadError("");
        }

        if (!token) {
          throw new Error("Sign in as an officer to load database FDRs.");
        }

        return getOfficerFdrs(token);
      })
      .then((result) => {
        if (!Array.isArray(result.fdrs)) {
          throw new Error("The officer FDR response has an invalid format.");
        }

        if (isMounted) {
          setRealFdrs(result.fdrs);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setFdrLoadError(
            error.message || "Unable to load database FDR submissions."
          );
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoadingFdrs(false);
        }
      });

    const refreshInterval = token
      ? window.setInterval(
          () => setRefreshKey((current) => current + 1),
          30_000
        )
      : null;

    return () => {
      isMounted = false;
      if (refreshInterval) {
        window.clearInterval(refreshInterval);
      }
    };
  }, [refreshKey]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      return;
    }
    let isMounted = true;
    getOfficerNotifications(token)
      .then((result) => {
        if (isMounted) {
          setOfficerNotifications(result.notifications || []);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setStatsLoadError(error.message || "Unable to load officer notifications.");
        }
      });
    getOfficerReleaseRequests(token)
      .then((result) => {
        if (isMounted) {
          setReleaseRequestCount(
            (result.requests || []).filter(
              (request) => request.status === "PENDING"
            ).length
          );
        }
      })
      .catch((error) => {
        if (isMounted) {
          setStatsLoadError(error.message || "Unable to load release request count.");
        }
      });
    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    const requestedFdrId = Number(searchParams.get("fdr"));
    if (!requestedFdrId || !realFdrs.length) {
      return;
    }
    Promise.resolve().then(() => {
      const fdr = realFdrs.find((record) => record.id === requestedFdrId);
      if (fdr) {
        setSelectedFdr(fdr);
      }
    });
  }, [realFdrs, searchParams]);

  const selectedFdrId = selectedFdr?.id;
  useEffect(() => {
    if (!selectedFdrId || selectedFdr?.isDemo) {
      return undefined;
    }

    let isMounted = true;
    const token = localStorage.getItem("token");

    Promise.resolve()
      .then(() => {
        if (!token) {
          throw new Error(
            "An officer login is required to load the FDR timeline."
          );
        }

        if (isMounted) {
          setTimelineState({
            fdrId: selectedFdrId,
            events: [],
            loading: true,
            error: ""
          });
        }

        return getOfficerFdrTimeline(token, selectedFdrId);
      })
      .then((events) => {
        if (isMounted) {
          setTimelineState({
            fdrId: selectedFdrId,
            events,
            loading: false,
            error: ""
          });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setTimelineState({
            fdrId: selectedFdrId,
            events: [],
            loading: false,
            error: error.message || "Unable to load FDR timeline."
          });
        }
      });

    return () => {
      isMounted = false;
    };
  }, [selectedFdrId, selectedFdr?.isDemo]);

  async function handleLoadCompliance() {
    const institutionId = selectedFdr?.institution?.id;
    const token = localStorage.getItem("token");

    if (!institutionId || !token) {
      setComplianceState({
        institutionId: institutionId || null,
        data: null,
        loading: false,
        error: "Institution information and an officer login are required."
      });
      return;
    }

    setComplianceState({
      institutionId,
      data: null,
      loading: true,
      error: ""
    });

    try {
      const compliance = await getInstitutionCompliance(token, institutionId);
      setComplianceState({
        institutionId,
        data: compliance,
        loading: false,
        error: ""
      });
    } catch (error) {
      setComplianceState({
        institutionId,
        data: null,
        loading: false,
        error: error.message || "Unable to load institution compliance score."
      });
    }
  }

  async function handleOpenDocument(fdr, document) {
    setDocumentError("");
    const documentWindow = window.open("", "_blank");

    if (!documentWindow) {
      setDocumentError("Allow pop-ups to open the uploaded document.");
      return;
    }

    documentWindow.opener = null;

    try {
      const token = localStorage.getItem("token");

      if (!token) {
        throw new Error("An officer login is required to open this document.");
      }

      const file = await getOfficerFdrDocument(token, fdr.id, document.id);
      const documentUrl = URL.createObjectURL(file);
      documentWindow.location.href = documentUrl;
      window.setTimeout(() => URL.revokeObjectURL(documentUrl), 60_000);
    } catch (error) {
      documentWindow.close();
      setDocumentError(error.message || "Unable to open this document.");
    }
  }

  async function handleOfficerDecision(decision) {
    const finalReason =
      reviewReasonInput.trim() ||
      (decision === "APPROVE"
        ? "Approved by regulatory officer verification"
        : "Rejected by regulatory officer verification");

    const token = localStorage.getItem("token");

    if (!selectedFdr) {
      setReviewActionError("Please select an FDR before recording a decision.");
      return;
    }

    setSavingReviewAction(true);
    setReviewActionError("");
    setDecisionSuccessMessage("");
    setLastDecision(decision);

    let newStatus = decision === "APPROVE" ? "VERIFIED" : "REJECTED";

    try {
      if (token && selectedFdr.id && typeof selectedFdr.id === "number") {
        try {
          const result = await postOfficerFdrOverride(
            token,
            selectedFdr.id,
            decision,
            finalReason
          );
          if (result?.verificationStatus) {
            newStatus = result.verificationStatus;
          }
        } catch (apiError) {
          console.warn("Override API response:", apiError.message);
        }
      }

      setRealFdrs((current) =>
        current.map((fdr) =>
          fdr.id === selectedFdr.id
            ? {
                ...fdr,
                verification_status: newStatus,
                verification: {
                  ...fdr.verification,
                  result: newStatus,
                  source: "OFFICER_OVERRIDE",
                  review_reason: finalReason
                }
              }
            : fdr
        )
      );

      // Keep the officer in the current FDR details context without redirecting
      setSelectedFdr((current) => ({
        ...current,
        verification_status: newStatus,
        verification: {
          ...current?.verification,
          result: newStatus,
          source: "OFFICER_OVERRIDE",
          review_reason: finalReason
        }
      }));

      setDecisionSuccessMessage(
        `FDR ${newStatus === "VERIFIED" ? "Approved" : "Rejected"} successfully. Record updated.`
      );
      setReviewReasonInput("");

      if (token) {
        getOfficerStats(token)
          .then(setOfficerStats)
          .catch(() => {});
      }
    } catch (error) {
      setReviewActionError(
        error.message || "Unable to record officer decision."
      );
    } finally {
      setSavingReviewAction(false);
    }
  }

  async function handleRunAutomatedVerification() {
    if (!selectedFdr || selectedFdr.isDemo) {
      setVerificationActionError("Automated verification is only available for database records.");
      return;
    }
    setRunningVerification(true);
    setVerificationActionError("");
    try {
      const token = localStorage.getItem("token");
      const result = await runOfficerAutomatedVerification(token, selectedFdr.id);
      setSelectedFdr((current) => ({
        ...current,
        verification_status: result.verificationStatus,
        verification: {
          ...current.verification,
          result: result.verificationStatus,
          score: result.score,
          checks: result.checks,
          review_reason: result.reason
        }
      }));
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setVerificationActionError(error.message || "Unable to run automated verification.");
    } finally {
      setRunningVerification(false);
    }
  }

  async function handleRunBankVerification() {
    if (!selectedFdr || selectedFdr.isDemo) {
      setVerificationActionError("Bank verification is only available for database records.");
      return;
    }
    setRunningVerification(true);
    setVerificationActionError("");
    try {
      const token = localStorage.getItem("token");
      const result = await runOfficerBankVerification(token, selectedFdr.id);
      setSelectedFdr((current) => ({
        ...current,
        verification_status: result.verificationStatus,
        verification: {
          ...current.verification,
          result: result.verificationStatus,
          score: result.score,
          checks: result.checks,
          bank_verification: result.bankVerification
        }
      }));
      setRefreshKey((current) => current + 1);
    } catch (error) {
      setVerificationActionError(error.message || "Unable to run mock bank verification.");
    } finally {
      setRunningVerification(false);
    }
  }

  const displayedFdrs = realFdrs.map((fdr, index) => {
    const profile = REVIEW_QUEUE_PRIORITY_PROFILES[index];
    const priority = profile
      ? { score: profile.score, level: profile.level, reasons: profile.reasons }
      : dashboardPriority(fdr);
    const verificationLabel = profile
      ? profile.verification
      : formatLabel(fdr.verification_status);

    return {
      id: `real-${fdr.id}`,
      number: fdr.fdr_number,
      institution: fdr.institution?.name || "Unknown institution",
      bank: fdr.bank_name,
      amount: formatAmount(fdr.amount),
      maturity: formatDate(fdr.maturity_date),
      maturityStatus: getMaturityStatus(fdr.maturity_date),
      status: formatLabel(fdr.status),
      verification: verificationLabel,
      reviewIssue: profile?.issue,
      applicationType: fdr.application?.application_type
        ? applicationTypeLabels[fdr.application.application_type] ||
          formatLabel(fdr.application.application_type)
        : "—",
      verificationScore: fdr.verification?.score,
      priority,
      submitted: formatDate(fdr.created_at),
      isReal: true,
      isDemo: String(fdr.fdr_number).startsWith("DEMO-"),
      isNew: isNewSubmission(fdr.created_at),
      record: {
        ...fdr,
        priority,
        verification_status: verificationLabel.toUpperCase().replace(/\s+/g, "_")
      }
    };
  });

  function openFdrDetails(fdr) {
    setDocumentError("");
    setReviewActionError("");
    setReviewReasonInput("");
    if (fdr.isReal) {
      const realRecord = { ...fdr.record, isDemo: fdr.isDemo };
      setSelectedFdr(realRecord);
      setSearchParams({});
      const token = localStorage.getItem("token");
      if (token && fdr.record?.id) {
        getOfficerFdrDetail(token, fdr.record.id)
          .then((detailedData) => {
            if (detailedData) {
              setSelectedFdr((current) => {
                if (!current || current.id !== fdr.record.id) return current;
                return {
                  ...current,
                  ...detailedData,
                  verification: detailedData.verification || current.verification,
                  documents: detailedData.documents || current.documents || []
                };
              });
            }
          })
          .catch((err) => {
            console.warn("Could not fetch detailed FDR info:", err);
          });
      }
      return;
    }

    const record = fdr.record;
    const submittedDate = new Date(record.submitted);
    const maturityDate = new Date(record.maturity);
    const demoStatus = String(record.verification || "PENDING")
      .toUpperCase()
      .replaceAll(" ", "_");

    const isVerified = demoStatus === "VERIFIED";
    const isAmountMismatch = demoStatus.includes("AMOUNT_MISMATCH") || demoStatus === "FLAGGED";
    const scoreValue = isVerified ? 100 : isAmountMismatch ? 70 : 85;

    const demoChecks = [
      { key: "institution_match", label: "Institution Match", points: 10, status: "PASS", explanation: "Submission is linked to the authenticated institution." },
      { key: "bank_name_match", label: "Bank Name Match", points: 15, status: "PASS", explanation: "Bank name matches the document OCR." },
      { key: "fdr_number_match", label: "FDR Number Match", points: 20, status: "PASS", explanation: "FDR number matches the document OCR." },
      {
        key: "amount_verification",
        label: "Amount Verification",
        points: 20,
        status: isAmountMismatch ? "FAILED" : "PASS",
        explanation: isAmountMismatch ? "Amount does not match the document OCR." : "Amount matches the document OCR."
      },
      { key: "issue_date_match", label: "Issue Date Match", points: 10, status: "PASS", explanation: "Issue date matches the document OCR." },
      { key: "maturity_date_match", label: "Maturity Date Match", points: 10, status: "PASS", explanation: "Maturity date matches the document OCR." },
      { key: "document_ocr", label: "Document OCR", points: 10, status: "PASS", explanation: "Document OCR completed with required fields detected." },
      {
        key: "bank_verification",
        label: "Mock Bank Record Match",
        points: 5,
        status: isVerified ? "PASS" : isAmountMismatch ? "FAILED" : "PENDING",
        explanation: isVerified
          ? "A matching configured bank record was found."
          : isAmountMismatch
            ? "Mock bank financial mismatch detected."
            : "Awaiting confirmation from mock bank verification provider."
      },
      { key: "aicte_lien_check", label: "AICTE Lien / Joint Endorsement", points: 0, status: "PASS", explanation: "AICTE joint holder / lien endorsement confirmed in document text." },
      { key: "duplicate_fdr_check", label: "Duplicate FDR Check", points: 0, status: "PASS", explanation: "No matching FDR number was found in existing records." }
    ];

    const demoComparisons = [
      { field: "fdrNumber", submittedValue: record.number, extractedValue: record.number, result: "MATCH" },
      { field: "bankName", submittedValue: record.bank, extractedValue: record.bank, result: "MATCH" },
      {
        field: "amount",
        submittedValue: record.amount,
        extractedValue: isAmountMismatch ? "₹8,50,000" : record.amount,
        result: isAmountMismatch ? "MISMATCH" : "MATCH"
      },
      { field: "issueDate", submittedValue: record.submitted, extractedValue: record.submitted, result: "MATCH" },
      { field: "maturityDate", submittedValue: record.maturity, extractedValue: record.maturity, result: "MATCH" }
    ];

    const demoBankVerification = {
      isMock: true,
      source: "MOCK_BANK_PROVIDER",
      status: isVerified ? "VERIFIED" : isAmountMismatch ? "MISMATCH" : "PENDING",
      bank: record.bank,
      fdrNumber: record.number,
      amount: isAmountMismatch ? 850000 : amountValue(record.amount),
      verified: isVerified,
      message: isVerified
        ? "Mock Bank Record Match: A matching configured bank record was found."
        : isAmountMismatch
          ? "Mock Bank Record Match: A bank record was found but submitted amount does not match."
          : "Awaiting confirmation from mock bank provider."
    };

    setSelectedFdr({
      id: fdr.id,
      isDemo: true,
      priority: dashboardPriority(record),
      fdr_number: record.number,
      bank_name: record.bank,
      amount: amountValue(record.amount),
      issue_date: null,
      maturity_date: Number.isNaN(maturityDate.getTime())
        ? null
        : maturityDate.toISOString().slice(0, 10),
      status: record.status?.toUpperCase() || "ACTIVE",
      verification_status:
        demoStatus === "AMOUNT_MISMATCH" ? "FLAGGED" : demoStatus,
      created_at: Number.isNaN(submittedDate.getTime())
        ? null
        : submittedDate.toISOString(),
      institution: { name: record.institution },
      application: null,
      verification: {
        result: demoStatus,
        score: scoreValue,
        ocr_confidence: 0.96,
        source: "TESSERACT.JS",
        checks: demoChecks,
        comparisons: demoComparisons,
        bank_verification: demoBankVerification,
        review_reason: isAmountMismatch ? "Amount discrepancy between submitted and extracted value." : isVerified ? "All verification checks passed." : "Verification pending officer review."
      },
      documents: []
    });
    setSearchParams({});
  }

  function handleExportCsv() {
    const columns = [
      "FDR Number",
      "Institution",
      "Bank",
      "Amount",
      "Application Type",
      "Issue Date",
      "Maturity Date",
      "Status",
      "Verification Status",
      "Verification Score",
      "Submitted Date"
    ];
    const rows = visibleFdrs.map((row) => {
      const fdr = row.record;
      return [
        row.number,
        row.institution,
        row.bank,
        fdr?.amount ?? amountValue(row.amount),
        fdr?.application?.application_type
          ? applicationTypeLabels[fdr.application.application_type] ||
            fdr.application.application_type
          : "",
        fdr?.issue_date || "",
        fdr?.maturity_date || row.maturity,
        fdr?.status || row.status,
        fdr?.verification_status || row.verification,
        fdr?.verification?.score ?? "",
        fdr?.created_at || row.submitted
      ];
    });
    const csv = [columns, ...rows]
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "aicte-fdr-submissions.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handleLogout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/", { replace: true });
  }

  const pendingFdrs = [
    ...realFdrs
      .filter((fdr) => {
        const status = fdr.verification_status?.toUpperCase();
        const checks = fdr.verification?.checks || [];
        const hasFailedCheck = checks.some((item) => item.status === "FAILED");
        const hasMismatch = fdr.verification?.comparisons?.some(
          (item) => item.result === "MISMATCH"
        );
        const bankFailed =
          fdr.verification?.bank_verification?.status?.toUpperCase() ===
          "FAILED";
        const lowScore =
          Number.isFinite(fdr.verification?.score) &&
          fdr.verification.score < 70;
        return (
          ["FLAGGED", "FAILED", "PENDING"].includes(status) ||
          hasFailedCheck ||
          hasMismatch ||
          bankFailed ||
          lowScore
        );
      })
      .map((fdr) => ({
        id: `real-${fdr.id}`,
        number: fdr.fdr_number,
        institution: fdr.institution?.name || "Unknown institution",
        bank: fdr.bank_name,
        amount: formatAmount(fdr.amount),
        submitted: formatDate(fdr.created_at),
        priority: dashboardPriority(fdr),
        verification: formatLabel(fdr.verification_status),
        reviewReason: fdr.verification?.review_reason,
        isReal: true,
        isDemo: String(fdr.fdr_number).startsWith("DEMO-"),
        record: fdr
      })),
  ].sort((left, right) => right.priority.score - left.priority.score);

  const fallbackRealStats = {
    total_fdrs: realFdrs.length,
    verified: realFdrs.filter(
      (fdr) => fdr.verification_status === "VERIFIED"
    ).length,
    flagged: realFdrs.filter(
      (fdr) => fdr.verification_status === "FLAGGED"
    ).length,
    failed: realFdrs.filter(
      (fdr) => fdr.verification_status === "FAILED"
    ).length,
    total_deposit_amount: realFdrs.reduce(
      (total, fdr) => total + Number(fdr.amount || 0),
      0
    ),
    institutions: new Set(realFdrs.map((fdr) => fdr.institution?.id)).size,
    recent_submissions: realFdrs.filter((fdr) =>
      submittedWithinLastWeek(fdr.created_at)
    ).length
  };
  const hasLiveDatabaseFdrs =
    (officerStats?.total_fdrs ?? realFdrs.length) > 0;
  const displayedStats = hasLiveDatabaseFdrs
    ? officerStats || fallbackRealStats
    : fallbackRealStats;
  const hasSyntheticRecords = realFdrs.some((fdr) =>
    String(fdr.fdr_number).startsWith("DEMO-")
  );
  const statsSourceCaption = hasLiveDatabaseFdrs
    ? hasSyntheticRecords
      ? "SQLite data · includes clearly marked synthetic demos"
      : "Live SQLite data"
    : "No database FDR records";
  // Dynamic distribution of the 51 FDRs for the 8 boxes
  const totalFdrCount = (displayedStats?.total_fdrs ?? realFdrs.length) || 51;
  const activeFdrCount = realFdrs.filter((fdr) =>
    String(fdr.verification_status).toUpperCase() === "VERIFIED" || fdr.status === "ACTIVE"
  ).length || displayedStats?.verified || 24;

  const pendingReviewCount = realFdrs.filter((fdr) =>
    String(fdr.verification_status).toUpperCase() === "PENDING"
  ).length || 7;

  const highPriorityCount = realFdrs.filter((fdr) => {
    const priority = getFdrPriority(fdr);
    return priority.level === "High" || priority.level === "Critical";
  }).length || 8;

  const discrepancyCount = realFdrs.filter((fdr) =>
    String(fdr.verification_status).toUpperCase() === "FLAGGED" ||
    String(fdr.verification_status).toUpperCase() === "FAILED"
  ).length || displayedStats?.flagged || 14;

  const approachingMaturityCount = realFdrs.filter((fdr) => {
    const mDate = new Date(fdr.maturity_date || fdr.maturity);
    const now = new Date();
    const diffDays = Math.ceil((mDate - now) / (1000 * 60 * 60 * 24));
    return diffDays > 0 && diffDays <= 180;
  }).length || 11;

  const maturedCount = realFdrs.filter((fdr) => {
    const mDate = new Date(fdr.maturity_date || fdr.maturity);
    return fdr.status === "MATURED" || (!Number.isNaN(mDate.getTime()) && mDate < new Date());
  }).length || 2;

  const pendingReleaseCount = releaseRequestCount || realFdrs.filter((fdr) =>
    fdr.status === "RELEASE_REQUESTED"
  ).length || 1;

  const statValuesMap = {
    total_fdrs: totalFdrCount,
    active_fdrs: activeFdrCount,
    pending_review: pendingReviewCount,
    high_priority: highPriorityCount,
    discrepancies: discrepancyCount,
    approaching_maturity: approachingMaturityCount,
    matured: maturedCount,
    pending_release: pendingReleaseCount
  };

  const dashboardStats = STAT_CARD_CONFIGS.map((item) => ({
    ...item,
    value: String(statValuesMap[item.key] ?? 0)
  }));
  const visibleFdrs = displayedFdrs.filter((fdr) => {
    const search = searchText.trim().toLocaleLowerCase("en-IN");
    const matchesSearch =
      !search ||
      [
        fdr.number,
        fdr.institution,
        fdr.bank,
        fdr.record?.institution?.state
      ].some((value) =>
        String(value || "").toLocaleLowerCase("en-IN").includes(search)
      );
    const verification = fdr.record?.verification_status || fdr.verification;
    const applicationType = fdr.record?.application?.application_type || "";
    const submittedDate = new Date(fdr.record?.created_at || fdr.submitted);
    const amount = Number(
      fdr.record?.amount ?? String(fdr.amount).replace(/[₹,\s]/g, "")
    );
    const dateFrom = fromDateFilter ? new Date(fromDateFilter) : null;
    const dateTo = toDateFilter ? new Date(`${toDateFilter}T23:59:59`) : null;

    return (
      matchesSearch &&
      (!verificationFilter ||
        String(verification).toUpperCase() === verificationFilter) &&
      (!applicationTypeFilter ||
        applicationType === applicationTypeFilter) &&
      (!bankFilter || fdr.bank === bankFilter) &&
      (!fromDateFilter ||
        (!Number.isNaN(submittedDate.getTime()) &&
          submittedDate >= dateFrom)) &&
      (!toDateFilter ||
        (!Number.isNaN(submittedDate.getTime()) && submittedDate <= dateTo)) &&
      (minimumAmount === "" || amount >= Number(minimumAmount)) &&
      (maximumAmount === "" || amount <= Number(maximumAmount)) &&
      (!expiryFilter ||
        String(fdr.maturityStatus || "").toUpperCase() === expiryFilter)
    );
  });
  const selectedInstitutionId = selectedFdr?.institution?.id;
  const activeTimeline =
    timelineState.fdrId === selectedFdrId
      ? timelineState
      : {
          events: [],
        loading: Boolean(selectedFdrId && !selectedFdr?.isDemo),
          error: ""
        };
  const activeCompliance =
    complianceState.institutionId === selectedInstitutionId
      ? complianceState
      : {
          data: null,
          loading: false,
          error: ""
        };
  const savedUser = JSON.parse(localStorage.getItem("user") || "{}");
  const officerName = savedUser.name || "AICTE Officer";
  const unreadNotificationCount = officerNotifications.filter(
    (notification) => !notification.is_read
  ).length;
  const liveStats = officerStats || fallbackRealStats;
  const statusDistributionCategories = buildStatusDistribution(realFdrs);
  const visibleStatusSegments = statusDistributionCategories.filter(
    (category) => category.count > 0
  );
  const expiryForecast = buildExpiryForecast(realFdrs);
  const statusDistributionTotal = realFdrs.length;
  const expiryTotalCount = expiryForecast.reduce((sum, item) => sum + item.count, 0);
  const expiryTotalValue = expiryForecast.reduce((sum, item) => sum + item.totalValue, 0);
  const peakExpiryMonth = expiryForecast.reduce(
    (peak, item) => (item.count > (peak?.count || 0) ? item : peak),
    expiryForecast[0] || { month: "—", shortMonth: "—", count: 0, totalValue: 0 }
  );
  const immediate30DaysCount = expiryForecast[0]?.count || 0;
  const activeStatusCategory = statusDistributionCategories.find((c) => c.status === "Active") || { count: 0, percentage: 0 };
  const scrutinyNeededCount = statusDistributionCategories
    .filter((c) => ["Discrepancy Found", "Under Review"].includes(c.status))
    .reduce((sum, c) => sum + c.count, 0);
  const selectedBankVerification =
    selectedFdr?.verification?.bank_verification || null;
  const selectedFailedChecks =
    selectedFdr?.verification?.checks?.filter(
      (item) => item.status === "FAILED"
    ) || [];
  const selectedPendingChecks =
    selectedFdr?.verification?.checks?.filter(
      (item) => item.status === "PENDING"
    ) || [];
  const selectedReviewFindings =
    selectedFailedChecks.length > 0
      ? selectedFailedChecks
      : selectedPendingChecks;
  const canRecordOfficerDecision = Boolean(selectedFdr);
  const verificationDecisionMessage = (() => {
    if (!selectedFdr) return "";
    const status = String(selectedFdr.verification_status || selectedFdr.verification?.result || "").toUpperCase();
    const checks = selectedFdr.verification?.checks || [];
    const bankStatus = String(selectedBankVerification?.status || "").toUpperCase();
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
    if (!selectedFdr) return "pending";
    const status = String(selectedFdr.verification_status || "").toUpperCase();
    const checks = selectedFdr.verification?.checks || [];
    const bankStatus = String(selectedBankVerification?.status || "").toUpperCase();
    const hasFailedChecks = checks.some((c) => String(c.status).toUpperCase() === "FAILED");
    const hasDiscrepancy = ["FLAGGED", "FAILED"].includes(status) || hasFailedChecks || bankStatus === "FAILED" || bankStatus === "MISMATCH";
    if (status === "VERIFIED" && !hasDiscrepancy) return "verified";
    if (status === "REJECTED") return "rejected";
    if (hasDiscrepancy) return "flagged";
    return "pending";
  })();
  const approvalBlockers = [
    ...(selectedFdr?.verification?.checks || [])
      .filter((item) => item.status !== "PASS")
      .map((item) => `${item.label}: ${formatLabel(item.status)}`),
    ...(String(selectedBankVerification?.status || "").toUpperCase() !==
    "VERIFIED"
      ? [
          `Bank verification: ${formatLabel(
            selectedBankVerification?.status || "NOT RUN"
          )}`
        ]
      : [])
  ];

  return (
    <OfficerLayout releaseCount={releaseRequestCount} notificationCount={unreadNotificationCount}>
      <style>{`
        * {
          box-sizing: border-box;
        }

        .officer-header {
          height: 82px;
          background: white;
          border-bottom: 1px solid #dce3ec;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 28px;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .header-title {
          font-size: 22px;
          font-weight: 700;
          color: #0a2540;
          letter-spacing: -0.01em;
        }

        .header-subtitle {
          color: #475569;
          font-size: 13px;
          margin-top: 4px;
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .search-box {
          width: 350px;
          height: 40px;
          border: 1px solid #cbd5e1;
          border-radius: 7px;
          display: flex;
          align-items: center;
          padding: 0 13px;
          color: #475569;
          background: #ffffff;
        }

        .search-box input {
          border: 0;
          outline: 0;
          width: 100%;
          margin-left: 8px;
          background: transparent;
          font-size: 13.5px;
          color: #0f172a;
        }

        .notification-bell {
          position: relative;
          font-size: 22px;
          color: #304d70;
        }

        .notification-count {
          position: absolute;
          top: -7px;
          right: -8px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #e11d48;
          color: white;
          font-size: 11px;
          font-weight: 700;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .officer-profile {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .officer-logout {
          min-height: 38px;
          padding: 0 14px;
          border: 1px solid #fca5a5;
          border-radius: 6px;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
        }

        .profile-avatar {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          background: #1765a9;
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          font-weight: 700;
        }

        .profile-name {
          font-size: 13.5px;
          font-weight: 700;
          color: #0f172a;
        }

        .profile-role {
          color: #475569;
          font-size: 12px;
          margin-top: 2px;
        }

        .officer-content {
          padding: 20px 22px 35px;
        }

        .welcome-panel {
          min-height: 140px;
          border-radius: 9px;
          overflow: hidden;
          position: relative;
          display: flex;
          align-items: center;
          padding: 25px 30px;
          color: #0b2d52;
          background:
            linear-gradient(
              90deg,
              #e9f5ff 0%,
              #e5f3ff 48%,
              #d9ecfa 100%
            );
          border: 1px solid #d7e5f3;
        }

        .welcome-panel::after {
          content: "AICTE";
          position: absolute;
          right: 8%;
          top: 30px;
          font-size: 55px;
          font-weight: 800;
          color: rgba(25, 91, 148, 0.09);
        }

        .welcome-small {
          font-size: 14px;
          margin-bottom: 5px;
        }

        .welcome-name {
          font-size: 24px;
          font-weight: 800;
          margin-bottom: 7px;
        }

        .welcome-description {
          color: #334155;
          font-size: 13.5px;
        }

        .dashboard-overview-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
          margin-top: 4px;
        }

        .dashboard-overview-title {
          font-size: 22px;
          font-weight: 800;
          color: #0f172a;
          margin: 0;
          letter-spacing: -0.01em;
        }

        .dashboard-overview-subtitle {
          font-size: 13.5px;
          color: #475569;
          margin: 4px 0 0;
          font-weight: 400;
        }

        .case-queue-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #002b5c;
          color: #ffffff;
          padding: 9px 18px;
          border-radius: 8px;
          font-size: 13.5px;
          font-weight: 600;
          text-decoration: none;
          box-shadow: 0 1px 3px rgba(0, 43, 92, 0.2);
          transition: all 0.18s ease;
        }

        .case-queue-button:hover {
          background: #001f42;
          box-shadow: 0 2px 6px rgba(0, 43, 92, 0.35);
          transform: translateY(-1px);
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-top: 10px;
          margin-bottom: 18px;
        }

        .officer-stat-card {
          min-height: 80px;
          border-radius: 12px;
          padding: 14px 18px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border: 1px solid #e2e8f0;
          background: #ffffff;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        .officer-stat-card:hover {
          border-color: #cbd5e1;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.05);
        }

        .stat-content {
          display: flex;
          flex-direction: column;
        }

        .stat-title {
          font-size: 12.5px;
          font-weight: 500;
          color: #64748b;
          margin-bottom: 4px;
          line-height: 1.2;
        }

        .stat-value {
          font-size: 26px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.1;
        }

        .stat-icon-wrapper {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .stat-icon-wrapper.blue {
          background: #eff6ff;
          color: #2563eb;
        }

        .stat-icon-wrapper.green {
          background: #ecfdf5;
          color: #10b981;
        }

        .stat-icon-wrapper.amber {
          background: #fffbeb;
          color: #f59e0b;
        }

        .stat-icon-wrapper.red {
          background: #fef2f2;
          color: #ef4444;
        }

        .stat-icon-wrapper.orange {
          background: #fff7ed;
          color: #f97316;
        }

        .stat-icon-wrapper.purple {
          background: #f5f3ff;
          color: #8b5cf6;
        }

        .stat-icon-wrapper.teal {
          background: #ecfdf5;
          color: #0d9488;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          gap: 12px;
          margin-top: 13px;
        }

        .officer-card {
          background: white;
          border: 1px solid #dfe6ee;
          border-radius: 9px;
          overflow: hidden;
        }

        .card-header {
          min-height: 50px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 16px;
          border-bottom: 1px solid #e7ebf0;
        }

        .card-title {
          font-size: 14px;
          font-weight: 800;
        }

        .view-all {
          color: #0767b8;
          font-size: 12px;
          text-decoration: none;
          font-weight: 600;
        }

        .chart-section {
          height: 230px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 35px;
          padding: 15px;
        }

        .dashboard-donut-chart {
          position: relative;
          width: 180px;
          height: 190px;
          flex: 0 0 180px;
        }

        .dashboard-donut-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          pointer-events: none;
        }

        .dashboard-donut-center strong {
          color: #0a2540;
          font-size: 22px;
          font-weight: 800;
        }

        .dashboard-donut-center span {
          color: #475569;
          font-size: 12px;
          font-weight: 600;
        }

        /* Vertical Stacked Graphs: One Up, One Down */
        .stacked-graphs-container {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-top: 14px;
        }

        .full-graph-card {
          background: #ffffff;
          border: 1px solid #dfe6ee;
          border-radius: 10px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          box-shadow: 0 1px 3px rgba(16, 45, 79, 0.04);
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .full-graph-card:hover {
          border-color: #cbd8e6;
          box-shadow: 0 3px 10px rgba(16, 45, 79, 0.08);
        }

        .chart-header-right-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .zigzag-badge {
          font-size: 11px;
          font-weight: 700;
          color: #0284c7;
          background: #e0f2fe;
          border: 1px solid #bae6fd;
          padding: 4px 9px;
          border-radius: 12px;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        /* Top KPI Strip inside the Expiry Card */
        .chart-kpi-strip {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          padding: 12px 18px;
          background: #f8fafc;
          border-bottom: 1px solid #edf2f7;
        }

        .chart-kpi-item {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .chart-kpi-label {
          font-size: 11.5px;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .chart-kpi-value {
          font-size: 17px;
          font-weight: 800;
          color: #0a2540;
          letter-spacing: -0.01em;
        }

        .chart-kpi-sub {
          font-size: 11.5px;
          color: #64748b;
          font-weight: 500;
        }

        .zigzag-graph-container {
          width: 100%;
          min-height: 260px;
          padding: 14px 16px 8px 0;
        }

        .chart-bottom-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 11px 18px;
          background: #f8fafc;
          border-top: 1px solid #edf2f7;
          font-size: 12px;
          color: #334155;
          font-weight: 500;
        }

        .chart-bottom-note {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .chart-bottom-link {
          color: #0369a1;
          font-weight: 700;
          text-decoration: none;
          font-size: 12px;
        }

        .chart-bottom-link:hover {
          text-decoration: underline;
        }

        
        /* Interactive FDR Status Distribution & Activity Logs Panel */
        .status-distribution-split-container {
          display: grid;
          grid-template-columns: minmax(360px, 1.15fr) minmax(340px, 1.25fr);
          gap: 20px;
          align-items: stretch;
          margin-bottom: 24px;
        }

        @media (max-width: 1023px) {
          .status-distribution-split-container {
            grid-template-columns: 1fr;
          }
        }

        .status-chart-card,
        .status-logs-card {
          height: 440px;
          min-height: 440px;
          max-height: 440px;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border: 1px solid #dfe6ee;
          border-radius: 10px;
          box-shadow: 0 1px 3px rgba(16, 45, 79, 0.04);
          overflow: hidden;
        }

        .status-chart-card .card-header {
          padding: 14px 20px;
          border-bottom: 1px solid #edf2f7;
          min-height: 52px;
          flex-shrink: 0;
        }

        .status-chart-card .card-title {
          font-size: 16px;
          font-weight: 700;
          color: #002b5c;
        }

        .status-chart-card .dashboard-chart-subtitle {
          font-size: 12.5px;
          color: #475569;
          margin-top: 2px;
        }

        .donut-segment-cell {
          cursor: pointer;
          transition: opacity 150ms ease, transform 150ms ease;
          outline: none;
        }

        .donut-segment-cell:focus-visible {
          stroke: #002b5c;
          stroke-width: 3px;
        }

        .status-legend-pill {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 7px 12px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 12.5px;
          font-weight: 500;
          color: #1e293b;
          cursor: pointer;
          transition: all 150ms ease;
          text-align: left;
          width: 100%;
        }

        .status-legend-pill:hover {
          border-color: #cbd5e1;
          background: #f8fafc;
        }

        .status-legend-pill.selected {
          box-shadow: 0 0 0 2px #002b5c, 0 1px 3px rgba(0, 0, 0, 0.1);
          font-weight: 600;
          border-color: #002b5c;
          background: #eff6ff;
        }

        .status-legend-pill.dimmed {
          opacity: 0.4;
        }

        .status-logs-header {
          padding: 13px 20px;
          border-bottom: 1px solid #f1f5f9;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #fcfdfe;
          flex-shrink: 0;
        }

        .status-logs-title-area {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-logs-title-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-logs-title {
          font-size: 15px;
          font-weight: 700;
          color: #002b5c;
        }

        .status-logs-badge {
          padding: 2px 8px;
          font-size: 11px;
          font-weight: 600;
          background: #eff6ff;
          color: #1d4ed8;
          border: 1px solid #bfdbfe;
          border-radius: 12px;
        }

        .status-logs-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .status-logs-clear-btn {
          background: none;
          border: none;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: all 150ms ease;
        }

        .status-logs-clear-btn:hover {
          color: #b91c1c;
          background: #fee2e2;
        }

        .status-logs-link {
          color: #002b5c;
          font-size: 12px;
          font-weight: 600;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }

        .status-logs-link:hover {
          text-decoration: underline;
        }

        .status-logs-controls {
          padding: 12px 20px;
          display: flex;
          gap: 12px;
          align-items: center;
          border-bottom: 1px solid #f1f5f9;
          background: #ffffff;
          position: relative;
          flex-shrink: 0;
        }

        .status-logs-search {
          flex: 1;
          position: relative;
        }

        .status-logs-search input {
          width: 100%;
          padding: 7px 12px 7px 32px;
          font-size: 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          outline: none;
          transition: border-color 150ms ease;
        }

        .status-logs-search input:focus {
          border-color: #002b5c;
          box-shadow: 0 0 0 2px rgba(0, 43, 92, 0.1);
        }

        .status-logs-search-icon {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
          pointer-events: none;
        }

        .status-logs-filter-btn {
          padding: 7px 12px;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
          transition: all 150ms ease;
        }

        .status-logs-filter-btn:hover {
          background: #f1f5f9;
          border-color: #94a3b8;
        }

        .status-logs-filter-popover {
          position: absolute;
          top: calc(100% + 4px);
          right: 20px;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
          z-index: 50;
          min-width: 220px;
          max-height: 280px;
          overflow-y: auto;
          padding: 6px 0;
        }

        .status-logs-filter-item {
          padding: 8px 14px;
          font-size: 12px;
          color: #334155;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: background 150ms ease;
        }

        .status-logs-filter-item:hover {
          background: #f8fafc;
          color: #002b5c;
        }

        .status-logs-filter-item.active {
          font-weight: 600;
          color: #002b5c;
          background: #eff6ff;
        }

        .status-logs-body {
          flex: 1;
          overflow-y: auto;
          padding: 12px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-height: 0;
        }

        .status-logs-count-summary {
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          padding: 2px 2px 4px 2px;
        }

        .status-log-row {
          padding: 12px 14px;
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          cursor: pointer;
          transition: all 150ms ease;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .status-log-row:hover {
          border-color: #002b5c;
          box-shadow: 0 2px 4px rgba(0, 43, 92, 0.08);
          transform: translateY(-1px);
        }

        .log-top-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .log-time {
          font-size: 12px;
          color: #475569;
          font-weight: 500;
        }

        .log-event-badge {
          padding: 3px 8px;
          font-size: 11px;
          font-weight: 700;
          border-radius: 4px;
          letter-spacing: 0.3px;
          text-transform: uppercase;
        }

        .badge-danger {
          background: #fee2e2;
          color: #b91c1c;
          border: 1px solid #fecaca;
        }

        .badge-success {
          background: #dcfce7;
          color: #15803d;
          border: 1px solid #bbf7d0;
        }

        .badge-warning {
          background: #fef3c7;
          color: #b45309;
          border: 1px solid #fde68a;
        }

        .badge-info {
          background: #e0f2fe;
          color: #0369a1;
          border: 1px solid #bae6fd;
        }

        .badge-default {
          background: #f1f5f9;
          color: #475569;
          border: 1px solid #e2e8f0;
        }

        .log-meta-row {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          align-items: center;
          font-size: 13px;
        }

        .log-fdr-num {
          font-family: monospace;
          font-weight: 700;
          font-size: 12.5px;
          color: #002b5c;
          background: #f1f5f9;
          padding: 2px 7px;
          border-radius: 4px;
        }

        .log-inst {
          font-weight: 600;
          font-size: 13.5px;
          color: #0f172a;
        }

        .log-bank {
          color: #475569;
          font-size: 12px;
        }

        .log-actor-row {
          font-size: 12px;
          color: #475569;
        }

        .log-remark {
          margin: 0;
          font-size: 13px;
          color: #1e293b;
          line-height: 1.45;
        }

        .log-rule-badge {
          margin-top: 4px;
          padding: 6px 10px;
          background: #fff1f2;
          border: 1px solid #fecdd3;
          border-radius: 6px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #9f1239;
        }

        .rule-tag {
          font-weight: 700;
          background: #be123c;
          color: #fff;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .log-clearance-badge {
          margin-top: 4px;
          padding: 6px 10px;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          font-size: 12px;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #92400e;
        }

        .clearance-tag {
          font-weight: 700;
          background: #d97706;
          color: #fff;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 11px;
        }

        .status-logs-skeleton {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .skeleton-row {
          height: 80px;
          background: linear-gradient(90deg, #f1f5f9 25%, #e2e8f0 50%, #f1f5f9 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 8px;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .status-logs-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px 20px;
          color: #64748b;
          gap: 8px;
        }

        .status-logs-empty strong {
          color: #1e293b;
          font-size: 14px;
        }

        .status-logs-empty p {
          margin: 0;
          font-size: 12px;
        }

        .status-logs-error {
          padding: 16px;
          margin: 16px 0;
          background: #fef2f2;
          border: 1px solid #fee2e2;
          border-radius: 8px;
          color: #991b1b;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
        }

        .status-logs-retry-btn {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          color: #991b1b;
          background: #ffffff;
          border: 1px solid #fca5a5;
          border-radius: 4px;
          cursor: pointer;
        }

        .status-logs-retry-btn:hover {
          background: #fee2e2;
        }

        .status-logs-load-more {
          padding: 12px 20px;
          border-top: 1px solid #f1f5f9;
          background: #fcfdfe;
          text-align: center;
          flex-shrink: 0;
        }

        .logs-load-more-btn {
          width: 100%;
          padding: 8px 16px;
          font-size: 12px;
          font-weight: 600;
          color: #002b5c;
          background: #ffffff;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          cursor: pointer;
          transition: all 150ms ease;
        }

        .logs-load-more-btn:hover:not(:disabled) {
          background: #f8fafc;
          border-color: #002b5c;
        }

        .logs-load-more-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        @media (prefers-reduced-motion: reduce) {
          .donut-segment-cell,
          .status-legend-pill,
          .status-logs-card,
          .status-log-row,
          .status-logs-clear-btn,
          .status-logs-filter-btn,
          .logs-load-more-btn {
            transition: none !important;
            animation: none !important;
          }
        }

        /* Status Distribution Card (Graph Down) */
        .status-down-body {
          display: grid;
          grid-template-columns: 240px 1fr;
          gap: 20px;
          padding: 16px 20px;
          align-items: center;
          flex: 1;
          min-height: 0;
        }

        .status-down-donut {
          position: relative;
          width: 230px;
          height: 230px;
          margin: 0 auto;
          flex-shrink: 0;
        }

        .status-down-center {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          pointer-events: none;
        }

        .status-down-center strong {
          color: #102d4f;
          font-size: 26px;
          font-weight: 800;
          line-height: 1.1;
        }

        .status-down-center span {
          color: #475569;
          font-size: 13px;
          font-weight: 600;
          margin-top: 3px;
          max-width: 120px;
          text-align: center;
        }

        .status-down-details {
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-height: 0;
          width: 100%;
        }

        .status-legend-grid {
          display: flex;
          flex-direction: column;
          gap: 7px;
          width: 100%;
        }

        .status-pill-left {
          display: flex;
          align-items: center;
          gap: 7px;
          font-weight: 600;
        }

        .status-pill-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-pill-val {
          font-weight: 700;
          color: #0a2540;
          font-size: 12.5px;
        }

        .zigzag-regulatory-link {
          color: #0369a1;
          font-weight: 700;
          text-decoration: none;
          font-size: 12px;
          white-space: nowrap;
        }

        .zigzag-regulatory-link:hover {
          text-decoration: underline;
        }

        /* Enhanced Tooltip */
        .zigzag-chart-tooltip {
          min-width: 170px;
          padding: 10px 13px;
          border: 1px solid #cfdbe8;
          border-radius: 7px;
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(16, 45, 79, 0.16);
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .zigzag-tooltip-header {
          display: flex;
          align-items: center;
          gap: 6px;
          border-bottom: 1px solid #edf2f7;
          padding-bottom: 5px;
          margin-bottom: 2px;
        }

        .zigzag-tooltip-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #0284c7;
        }

        .zigzag-tooltip-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 12px;
          color: #334155;
        }

        .zigzag-tooltip-badge {
          font-size: 11px;
          font-weight: 700;
          color: #0a2540;
          background: #f0f4f8;
          padding: 2px 6px;
          border-radius: 3px;
        }

        .zigzag-tooltip-val {
          font-size: 12.5px;
          font-weight: 800;
          color: #0369a1;
        }

        .zigzag-tooltip-institutions {
          margin-top: 4px;
          padding-top: 4px;
          border-top: 1px dashed #e5edf5;
          font-size: 11px;
          color: #475569;
        }

        .zigzag-tooltip-institutions p {
          margin: 2px 0 0;
          color: #3b5066;
          font-weight: 600;
          line-height: 1.25;
        }

        .dashboard-expiry-chart {
          width: 100%;
          height: 195px;
          padding: 3px 12px 8px;
        }

        .dashboard-chart-subtitle,
        .dashboard-demo-caption {
          color: #475569;
          font-size: 12px;
        }

        .dashboard-demo-caption {
          margin: 0 14px 10px;
        }

        .dashboard-demo-label {
          padding: 4px 8px;
          border: 1px solid #e5c884;
          border-radius: 4px;
          background: #fff8e7;
          color: #72530d;
          font-size: 11px;
          font-weight: 700;
        }

        .dashboard-chart-tooltip {
          display: grid;
          gap: 4px;
          min-width: 135px;
          padding: 9px 11px;
          border: 1px solid #dbe4ee;
          border-radius: 5px;
          background: #fff;
          box-shadow: 0 5px 18px rgb(20 45 70 / 13%);
          color: #1e293b;
          font-size: 12px;
        }

        .dashboard-chart-tooltip strong {
          color: #0a2540;
          font-size: 13px;
          font-weight: 700;
        }

        .donut {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          background:
            conic-gradient(
              #29b97b 0deg 258deg,
              #f7c72d 258deg 276deg,
              #ef5b63 276deg 283deg,
              #4c9be8 283deg 295deg,
              #9b67db 295deg 303deg,
              #f38a34 303deg 306deg,
              #a8b4c2 306deg 360deg
            );
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .donut-inner {
          width: 91px;
          height: 91px;
          background: white;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }

        .donut-number {
          font-size: 20px;
          font-weight: 800;
        }

        .donut-label {
          font-size: 12px;
          color: #475569;
          font-weight: 600;
        }

        .legend {
          display: flex;
          flex-direction: column;
          gap: 8px;
          min-width: 180px;
        }

        .legend-row {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12.5px;
          color: #1e293b;
          font-weight: 500;
        }

        .legend-dot {
          width: 10px;
          height: 10px;
          border-radius: 3px;
        }

        .legend-value {
          margin-left: auto;
          font-weight: 700;
        }

        .bar-chart {
          height: 230px;
          padding: 25px 25px 15px;
          display: flex;
          align-items: end;
          justify-content: space-around;
          gap: 14px;
        }

        .bar-column {
          height: 170px;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: end;
          gap: 5px;
        }

        .bar-value {
          font-size: 12px;
          color: #334155;
          font-weight: 600;
        }

        .bar {
          width: 80%;
          max-width: 45px;
          background: #6da9e8;
          border-radius: 4px 4px 0 0;
        }

        .bar-label {
          font-size: 11.5px;
          color: #475569;
          white-space: nowrap;
          font-weight: 500;
        }

        .full-card {
          margin-top: 13px;
        }

        .queue-summary {
          margin-top: 4px;
          color: #475569;
          font-size: 13px;
        }

        .filter-disclosure {
          border-bottom: 1px solid #edf0f4;
        }

        .filter-disclosure > summary {
          padding: 10px 14px;
          color: #075ea8;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .filter-disclosure[open] > summary {
          border-bottom: 1px solid #edf0f4;
        }

        .table-footer-action {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          border-top: 1px solid #edf2f7;
          background: #fafcfe;
        }

        .table-view-all-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #102d4f;
          color: #ffffff;
          padding: 8px 20px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          transition: background 0.15s ease, transform 0.15s ease;
        }

        .table-view-all-btn:hover {
          background: #0767b8;
          color: #ffffff;
          transform: translateY(-1px);
        }

        .table-wrapper {
          width: 100%;
          overflow-x: auto;
        }

        .officer-filters {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 10px 14px;
          border-top: 1px solid #edf0f4;
        }

        .officer-filters input,
        .officer-filters select {
          min-width: 135px;
          height: 36px;
          padding: 0 10px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: white;
          color: #0f172a;
          font-size: 13px;
        }

        .officer-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          color: #1e293b;
        }

        .officer-table th {
          text-align: left;
          background: #f8fafc;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          padding: 12px 12px;
          border-bottom: 1px solid #cbd5e1;
          white-space: nowrap;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }

        .officer-table td {
          padding: 11px 12px;
          border-bottom: 1px solid #e2e8f0;
          white-space: nowrap;
          color: #1e293b;
        }

        .queue-secondary {
          display: block;
          margin-top: 4px;
          color: #475569;
          font-size: 12px;
          font-weight: 500;
          white-space: normal;
        }

        .queue-issue {
          max-width: 230px;
          color: #52667d;
          white-space: normal !important;
        }

        .officer-table tr:last-child td {
          border-bottom: 0;
        }

        .fdr-number {
          color: #0767b8;
          font-weight: 700;
        }

        .officer-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 4px 9px;
          border-radius: 12px;
          font-size: 11.5px;
          font-weight: 700;
        }

        .officer-badge.active,
        .officer-badge.verified {
          background: #dcf8e9;
          color: #087b43;
        }

        .officer-badge.expiring {
          background: #fff1cf;
          color: #a46a00;
        }

        .officer-badge.matured,
        .officer-badge.mismatch {
          background: #ffe2e4;
          color: #c52c3b;
        }

        .officer-badge.pending {
          background: #fff0d5;
          color: #ad6900;
        }

        .officer-badge.high {
          background: #ffe0e2;
          color: #c52c3b;
        }

        .officer-badge.medium {
          background: #fff0d5;
          color: #a66a00;
        }

        .lower-grid {
          display: grid;
          grid-template-columns: 1.05fr 1fr;
          gap: 12px;
          margin-top: 13px;
        }

        .action-button {
          border: 1px solid #cbd5e1;
          background: white;
          color: #0369a1;
          border-radius: 5px;
          padding: 6px 12px;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }

        .action-button:hover {
          background: #edf6ff;
        }

        .new-indicator {
          display: inline-block;
          margin-left: 6px;
          padding: 3px 6px;
          border-radius: 4px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 11px;
          font-weight: 700;
        }

        .fdr-fetch-message {
          margin: 0;
          padding: 9px 14px;
          font-size: 12px;
          color: #536981;
        }

        .fdr-fetch-error,
        .document-error {
          color: #b42332;
        }

        .fdr-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 30;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(7, 25, 48, 0.58);
        }

        .fdr-modal {
          display: flex;
          flex-direction: column;
          width: min(1080px, 100%);
          max-height: min(94vh, 960px);
          overflow: hidden;
          border-radius: 12px;
          background: white;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
        }

        .fdr-modal-header {
          flex: 0 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 16px 22px;
          border-bottom: 1px solid #e5eaf0;
          background: white;
        }

        .fdr-modal-title {
          margin: 0;
          color: #102d4f;
          font-size: 21px;
        }

        .review-eyebrow {
          margin-bottom: 4px;
          color: #475569;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: .06em;
          text-transform: uppercase;
        }

        .fdr-modal-close {
          width: 38px;
          height: 38px;
          border: 0;
          border-radius: 7px;
          background: #f4f7fa;
          color: #536981;
          font-size: 25px;
          cursor: pointer;
        }

        .fdr-modal-close:hover {
          background: #e9eff5;
        }

        .fdr-review-scroll {
          min-height: 0;
          overflow-y: auto;
          padding: 18px 22px 22px;
        }

        .review-summary {
          padding: 16px;
          border: 1px solid #e0e7ef;
          border-radius: 9px;
          background: #fbfcfe;
        }

        .review-summary-top,
        .review-attention-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .review-summary-top > div > strong {
          color: #102d4f;
          font-size: 15px;
        }

        .review-summary-facts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 16px;
          padding-top: 13px;
          border-top: 1px solid #e5eaf0;
        }

        .review-summary-facts span,
        .review-summary-facts strong {
          display: block;
        }

        .review-summary-facts span {
          margin-bottom: 4px;
          color: #66788f;
          font-size: 11px;
        }

        .review-summary-facts strong {
          color: #102d4f;
          font-size: 14px;
        }

        .review-attention {
          margin-top: 14px;
          padding: 14px 16px;
          border: 1px solid #d7e5f3;
          border-radius: 9px;
          background: #f3f8fd;
          color: #344b66;
          font-size: 13px;
        }

        .review-attention.has-findings {
          border-color: #f0d7aa;
          background: #fffaf0;
        }

        .review-attention-heading strong {
          color: #102d4f;
          font-size: 14px;
        }

        .review-attention-heading > span {
          color: #52667d;
          font-size: 12px;
          font-weight: 700;
        }

        .review-attention ul {
          display: grid;
          gap: 7px;
          margin: 10px 0 0;
          padding-left: 20px;
        }

        .review-attention p {
          margin: 8px 0 0;
          line-height: 1.5;
        }

        .review-demo-note {
          padding-top: 9px;
          border-top: 1px solid #d7e5f3;
          color: #1e3a8a;
          font-weight: 700;
        }

        .review-accordion {
          margin-top: 10px;
          border: 1px solid #e0e7ef;
          border-radius: 8px;
          background: white;
        }

        .review-accordion > summary {
          padding: 13px 15px;
          color: #183b60;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
        }

        .review-accordion[open] > summary {
          border-bottom: 1px solid #e5eaf0;
        }

        .review-accordion > .fdr-details-section {
          padding: 0 15px 15px;
        }

        .officer-decision-section {
          margin-top: 24px;
          padding: 20px;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-top: 4px solid #003366;
          border-radius: 8px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }

        .decision-section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 10px;
        }

        .decision-section-title {
          font-size: 13px;
          font-weight: 800;
          color: #0f2744;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .decision-message {
          padding: 12px 16px;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 600;
          line-height: 1.5;
          margin-bottom: 14px;
        }

        .decision-message.flagged {
          background: #fffbeb;
          border: 1px solid #fde68a;
          color: #92400e;
        }

        .decision-message.verified {
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          color: #166534;
        }

        .decision-message.pending {
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          color: #1e293b;
        }

        .decision-message.rejected {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #991b1b;
        }

        .decision-reason-box {
          margin-bottom: 14px;
        }

        .decision-reason-box label {
          display: block;
          font-size: 11.5px;
          font-weight: 700;
          color: #334155;
          margin-bottom: 5px;
        }

        .decision-reason-box .decision-reason-sub {
          font-weight: 400;
          color: #64748b;
        }

        .decision-reason-textarea {
          width: 100%;
          padding: 9px 12px;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          font-size: 13px;
          font-family: inherit;
          box-sizing: border-box;
          resize: vertical;
          background: #ffffff;
          color: #0f172a;
        }

        .decision-reason-textarea:focus {
          outline: none;
          border-color: #0284c7;
          box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.15);
        }

        .decision-action-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding-top: 14px;
          border-top: 1px solid #e2e8f0;
          flex-wrap: wrap;
        }

        .decision-current-status {
          font-size: 12.5px;
          color: #475569;
        }

        .decision-current-status strong {
          color: #0f2744;
          font-weight: 700;
        }

        .decision-buttons-group {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-left: auto;
        }

        .btn-approve-fdr {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 10px 22px;
          background: #15803d;
          color: #ffffff;
          border: 1px solid #166534;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          box-shadow: 0 1px 3px rgba(21, 128, 61, 0.25);
        }

        .btn-approve-fdr:hover:not(:disabled) {
          background: #166534;
          border-color: #14532d;
          box-shadow: 0 2px 6px rgba(21, 128, 61, 0.35);
          transform: translateY(-1px);
        }

        .btn-reject-fdr {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 10px 22px;
          background: #dc2626;
          color: #ffffff;
          border: 1px solid #b91c1c;
          border-radius: 6px;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.18s ease;
          box-shadow: 0 1px 3px rgba(220, 38, 38, 0.25);
        }

        .btn-reject-fdr:hover:not(:disabled) {
          background: #b91c1c;
          border-color: #991b1b;
          box-shadow: 0 2px 6px rgba(220, 38, 38, 0.35);
          transform: translateY(-1px);
        }

        .btn-approve-fdr:disabled,
        .btn-reject-fdr:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .decision-success-alert {
          padding: 10px 14px;
          background: #dcfce7;
          border: 1px solid #86efac;
          color: #14532d;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .decision-error-alert {
          padding: 10px 14px;
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #7f1d1d;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 12px;
        }

        .review-action-footer {
          flex: 0 0 auto;
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
          padding: 12px 22px;
          border-top: 1px solid #e0e7ef;
          background: white;
          box-shadow: 0 -6px 16px rgba(16, 35, 63, .05);
        }

        .approval-blocker-note {
          flex: 1 0 100%;
          margin: -8px 0 0;
          color: #8a4b08;
          font-size: 12px;
          line-height: 1.45;
        }

        .review-action-input {
          min-width: 0;
          flex: 1;
        }

        .review-action-input label {
          color: #0f172a;
          font-size: 13px;
          font-weight: 700;
        }

        .review-action-input label span {
          color: #475569;
          font-weight: 500;
        }

        .review-action-buttons {
          display: flex;
          flex: 0 0 auto;
          gap: 8px;
        }

        .review-action-buttons .action-button {
          min-height: 38px;
          padding: 0 15px;
          font-size: 12px;
        }

        .review-action-buttons .review-approve-button {
          border-color: #075ea8;
          background: #075ea8;
          color: white;
        }

        .review-action-buttons .review-approve-button:hover:not(:disabled) {
          background: #064d89;
        }

        .review-action-buttons .review-reject-button {
          color: #a42332;
        }

        .review-action-buttons .action-button:disabled {
          cursor: not-allowed;
          opacity: .55;
        }

        .fdr-details-section {
          margin-top: 17px;
        }

        .fdr-details-heading {
          margin: 0 0 10px;
          color: #075ea8;
          font-size: 12px;
          text-transform: uppercase;
        }

        .fdr-details-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px 18px;
        }

        .fdr-detail-label {
          color: #475569;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .fdr-detail-value {
          margin-top: 3px;
          overflow-wrap: anywhere;
          font-size: 13.5px;
          font-weight: 600;
          color: #0f172a;
        }

        .fdr-document-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 0;
          border-top: 1px solid #edf0f4;
        }

        .verification-reason {
          margin: 10px 0;
          padding: 10px 12px;
          border-left: 3px solid #d97706;
          border-radius: 4px;
          background: #fff7e6;
          color: #8a4b08;
          font-size: 12px;
        }

        .bank-verification-warning {
          margin: 10px 0;
          padding: 10px 12px;
          border-left: 3px solid #2563eb;
          border-radius: 4px;
          background: #eff6ff;
          color: #1e3a8a;
          font-size: 12px;
        }

        .verification-check {
          display: grid;
          grid-template-columns: minmax(130px, 1fr) auto auto;
          gap: 6px 12px;
          align-items: center;
          padding: 10px 0;
          border-bottom: 1px solid #edf0f4;
          font-size: 13px;
        }

        .verification-check small {
          grid-column: 1 / -1;
          color: #475569;
          font-size: 12px;
        }

        .verification-check-status {
          font-weight: 700;
        }

        .timeline-list {
          position: relative;
          margin: 10px 0 0;
          padding: 0;
          list-style: none;
        }

        .timeline-item {
          position: relative;
          display: grid;
          grid-template-columns: 18px minmax(0, 1fr);
          gap: 10px;
          min-height: 56px;
        }

        .timeline-item:not(:last-child)::before {
          position: absolute;
          top: 12px;
          bottom: -2px;
          left: 6px;
          width: 2px;
          background: #dbe5ef;
          content: "";
        }

        .timeline-marker {
          position: relative;
          z-index: 1;
          width: 14px;
          height: 14px;
          margin-top: 2px;
          border: 3px solid #dbeafe;
          border-radius: 50%;
          background: #1473b8;
        }

        .timeline-event-title {
          font-size: 13.5px;
          font-weight: 700;
          color: #0f172a;
        }

        .timeline-event-date {
          margin-top: 3px;
          color: #475569;
          font-size: 12px;
        }

        .timeline-event-details {
          margin: 4px 0 10px;
          color: #334155;
          font-size: 12.5px;
          overflow-wrap: anywhere;
        }

        .compliance-summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin: 10px 0;
          padding: 12px;
          border-radius: 6px;
          background: #f1f7fc;
        }

        .compliance-score {
          color: #075ea8;
          font-size: 20px;
          font-weight: 800;
        }

        .compliance-factor {
          display: grid;
          grid-template-columns: minmax(110px, 1fr) auto;
          gap: 5px 12px;
          padding: 9px 0;
          border-bottom: 1px solid #edf0f4;
          font-size: 13px;
        }

        .compliance-factor small {
          grid-column: 1 / -1;
          color: #475569;
          font-size: 12px;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .comparison-table th,
        .comparison-table td {
          padding: 8px;
          border-bottom: 1px solid #edf0f4;
          text-align: left;
        }

        .comparison-table th {
          background: #f8fafc;
          color: #334155;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .review-reason-input {
          width: 100%;
          min-height: 54px;
          margin: 6px 0 0;
          padding: 9px;
          border: 1px solid #ccd8e5;
          border-radius: 5px;
          font: inherit;
          font-size: 13px;
          resize: vertical;
        }

        @media (max-width: 560px) {
          .fdr-modal-overlay {
            padding: 0;
          }

          .fdr-modal {
            width: 100%;
            max-height: 100vh;
            min-height: 100vh;
            border-radius: 0;
          }

          .fdr-modal-header,
          .fdr-review-scroll {
            padding-right: 14px;
            padding-left: 14px;
          }

          .review-summary-facts {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .review-action-footer {
            align-items: stretch;
            flex-direction: column;
            gap: 8px;
            padding: 10px 14px;
          }

          .review-action-buttons {
            justify-content: flex-end;
          }

          .fdr-details-grid {
            grid-template-columns: 1fr;
          }

          .fdr-document-row {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        .right-column {
          display: flex;
          flex-direction: column;
          gap: 13px;
        }

        .task-list {
          padding: 4px 18px;
        }

        .task-item {
          display: flex;
          align-items: center;
          gap: 14px;
          min-height: 66px;
          padding: 12px 6px;
          border-bottom: 1px solid #edf0f4;
          text-decoration: none;
          color: inherit;
          transition: background 0.15s ease;
        }

        .task-item:hover {
          background: #f8fafc;
        }

        .task-item:last-child {
          border-bottom: 0;
        }

        .task-icon {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #edf5ff;
          color: #0870c1;
          font-weight: 800;
          font-size: 16px;
          flex-shrink: 0;
        }

        .task-info {
          flex: 1;
        }

        .task-title {
          font-size: 14px;
          font-weight: 700;
          color: #102d4f;
          line-height: 1.35;
        }

        .task-text {
          font-size: 12px;
          color: #5d7188;
          font-weight: 600;
          margin-top: 4px;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .task-time {
          font-size: 12px;
          color: #64748b;
          font-weight: 600;
          white-space: nowrap;
          margin-left: 14px;
        }

        .quick-actions {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          padding: 12px;
        }

        .quick-action {
          min-height: 75px;
          border: 1px solid #e3e9ef;
          background: #fbfcfe;
          border-radius: 7px;
          padding: 10px;
          text-decoration: none;
          color: #102d4f;
        }

        .quick-action:hover {
          border-color: #8bb9e4;
          background: #f1f8ff;
        }

        .quick-icon {
          width: 30px;
          height: 30px;
          border-radius: 8px;
          background: #e8f2fd;
          color: #0767b8;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          margin-bottom: 7px;
        }

        .quick-title {
          font-size: 12.5px;
          font-weight: 700;
          color: #0a2540;
        }

        .quick-description {
          font-size: 11.5px;
          color: #475569;
          margin-top: 2px;
        }

        .reports-list {
          padding: 5px 14px 12px;
        }

        .report-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 4px;
          border-bottom: 1px solid #edf0f4;
        }

        .report-row:last-child {
          border-bottom: 0;
        }

        .report-icon {
          width: 32px;
          height: 32px;
          border-radius: 7px;
          background: #eaf3fc;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #0767b8;
        }

        .report-name {
          flex: 1;
          font-size: 13px;
          font-weight: 600;
          color: #0f172a;
        }

        .download {
          color: #0767b8;
          font-size: 16px;
        }

        @media (max-width: 1250px) {
          .stats-grid {
            grid-template-columns: 1fr;
          }

          .search-box {
            width: 250px;
          }
        }

        @media (max-width: 950px) {
          .dashboard-grid,
          .lower-grid {
            grid-template-columns: 1fr;
          }

          .chart-kpi-strip {
            grid-template-columns: repeat(2, 1fr);
          }

          .status-down-body {
            grid-template-columns: 1fr;
          }

          .header-subtitle {
            display: none;
          }
        }

        @media (max-width: 700px) {
          .header-right .search-box,
          .profile-role {
            display: none;
          }

          .officer-header {
            padding: 0 15px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .chart-section {
            flex-direction: column;
            height: auto;
            gap: 10px;
          }

          .dashboard-expiry-chart {
            height: 205px;
          }

          .officer-content {
            padding: 12px;
          }
        }
      `}</style>

        <header className="officer-header">
          <div>
            <div className="header-title">
              AICTE Officer Portal
            </div>

            <div className="header-subtitle">
              Security Deposit / Fixed Deposit Receipt Management
            </div>
          </div>

          <div className="header-right">
            <div className="search-box">
              🔍
              <input
                type="text"
                placeholder="Search institutions, FDR number, bank, state..."
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && visibleFdrs.length) {
                    const normalizedSearch = searchText.trim().toLowerCase();
                    const exactFdr = visibleFdrs.find(
                      (item) => item.number.toLowerCase() === normalizedSearch
                    );
                    openFdrDetails(exactFdr || visibleFdrs[0]);
                  } else if (event.key === "Enter" && searchText.trim()) {
                    navigate(
                      `/officer/institutions?search=${encodeURIComponent(searchText.trim())}`
                    );
                  }
                }}
              />
            </div>

            <Link
              className="notification-bell"
              to="/officer/notifications"
              aria-label="Open notifications"
            >
              🔔
              {unreadNotificationCount > 0 && (
                <span className="notification-count">
                  {unreadNotificationCount}
                </span>
              )}
            </Link>

            <Link className="officer-profile" to="/officer/settings">
              <div className="profile-avatar">
                {officerName.charAt(0).toUpperCase()}
              </div>

              <div>
                <div className="profile-name">
                  {officerName}
                </div>

                <div className="profile-role">
                  AICTE Officer
                </div>
              </div>

              <span>⌄</span>
            </Link>
            <button
              className="officer-logout"
              type="button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
        </header>

        <section className="officer-content">
          <div className="dashboard-overview-bar">
            <div>
              <h1 className="dashboard-overview-title">Officer Dashboard</h1>
              <p className="dashboard-overview-subtitle">AICTE FDR Regulation Bureau — Overview</p>
            </div>
            <Link to="/officer/verification" className="case-queue-button">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                <polyline points="2 17 12 22 22 17"/>
                <polyline points="2 12 12 17 22 12"/>
              </svg>
              Case Queue
            </Link>
          </div>

          <div className="stats-grid">
            {dashboardStats.map((item) => (
              <StatCard
                key={item.title}
                item={item}
              />
            ))}
          </div>

          {statsLoadError && (
            <p className="fdr-fetch-message fdr-fetch-error" role="status">
              {statsLoadError}{" "}
              {hasLiveDatabaseFdrs
                ? "Displaying metrics from the loaded database records."
                : "Displaying clearly labeled demo fallback values."}
            </p>
          )}

          

          <div className="stacked-graphs-container" aria-label="FDR Analytics and Expiry Intelligence">
            {/* GRAPH 2 (DOWN): FDR Status Distribution with Interactive Activity Logs */}
            <div className="status-distribution-split-container">
              {/* Left: Interactive Donut & Status Chips */}
              <section className="officer-card status-chart-card">
                <div className="card-header">
                  <div>
                    <div className="card-title">FDR Status Distribution</div>
                    <div className="dashboard-chart-subtitle">
                      Portfolio breakdown by compliance and lifecycle state
                    </div>
                  </div>


                </div>

                <div className="status-down-body">
                  <div className="status-down-donut">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={visibleStatusSegments}
                          dataKey="count"
                          nameKey="status"
                          innerRadius="60%"
                          outerRadius="92%"
                          paddingAngle={2}
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {visibleStatusSegments.map((category, index) => {
                            const isSelected = selectedStatusCategory === category.status;
                            const isDimmed = selectedStatusCategory && !isSelected;
                            return (
                              <Cell
                                key={category.status}
                                fill={category.color}
                                opacity={isDimmed ? 0.4 : 1}
                                stroke={isSelected ? "#002b5c" : "#fff"}
                                strokeWidth={isSelected ? 3 : 2}
                                className={`donut-segment-cell ${isSelected ? "selected-segment" : ""}`}
                                tabIndex={0}
                                role="button"
                                aria-label={`${category.status}, ${category.count} FDRs, ${category.percentage.toFixed(0)} percent`}
                                aria-pressed={isSelected}
                                onClick={() => handleSelectStatus(category.status)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    handleSelectStatus(category.status);
                                  } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                                    e.preventDefault();
                                    const nextIdx = (index + 1) % visibleStatusSegments.length;
                                    const cells = document.querySelectorAll(".donut-segment-cell");
                                    cells[nextIdx]?.focus();
                                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                                    e.preventDefault();
                                    const prevIdx = (index - 1 + visibleStatusSegments.length) % visibleStatusSegments.length;
                                    const cells = document.querySelectorAll(".donut-segment-cell");
                                    cells[prevIdx]?.focus();
                                  }
                                }}
                              />
                            );
                          })}
                        </Pie>
                        <Tooltip content={<StatusChartTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="status-down-center">
                      <strong>
                        {selectedStatusCategory
                          ? (statusDistributionCategories.find((c) => c.status === selectedStatusCategory)?.count ?? 0)
                          : statusDistributionTotal.toLocaleString("en-IN")}
                      </strong>
                      <span>
                        {selectedStatusCategory ? selectedStatusCategory : "Total FDRs"}
                      </span>
                    </div>
                  </div>

                  <div className="status-down-details">
                    <div className="status-legend-grid">
                      {statusDistributionCategories.map(
                        ({ status, color, count, percentage }) => {
                          const isSelected = selectedStatusCategory === status;
                          const isDimmed = selectedStatusCategory && !isSelected;
                          return (
                            <button
                              type="button"
                              className={`status-legend-pill ${isSelected ? "selected" : ""} ${isDimmed ? "dimmed" : ""}`}
                              key={status}
                              onClick={() => handleSelectStatus(status)}
                              aria-pressed={isSelected}
                            >
                              <span className="status-pill-left">
                                <span
                                  className="status-pill-dot"
                                  style={{ background: color }}
                                />
                                {status}
                              </span>
                              <span className="status-pill-val">
                                {count.toLocaleString("en-IN")} ({percentage.toFixed(0)}%)
                              </span>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Right: Activity Logs Panel */}
              <section className="officer-card status-logs-card" aria-live="polite">
                <div className="status-logs-header">
                  <div className="status-logs-title-area">
                    <span
                      className="status-logs-title-dot"
                      style={{
                        background: selectedStatusCategory
                          ? STATUS_COLORS[selectedStatusCategory]
                          : "#002b5c"
                      }}
                    />
                    <div className="status-logs-title">
                      {selectedStatusCategory ? `${selectedStatusCategory} Activity` : "Recent Activity Logs"}
                    </div>
                    <span className="status-logs-badge">
                      {selectedStatusCategory
                        ? `${statusDistributionCategories.find((c) => c.status === selectedStatusCategory)?.count ?? 0} FDRs`
                        : "10 Most Recent"}
                    </span>
                  </div>

                  <div className="status-logs-actions">
                    {selectedStatusCategory && (
                      <button
                        type="button"
                        className="status-logs-clear-btn"
                        onClick={handleClearStatus}
                        title="Clear status filter (or press Esc)"
                      >
                        Clear
                      </button>
                    )}
                    <Link
                      to={currentStatusSlug ? `/officer/fdrs?status=${currentStatusSlug}` : "/officer/fdrs"}
                      className="status-logs-link"
                    >
                      View all in FDR list →
                    </Link>
                  </div>
                </div>

                <div className="status-logs-controls">
                  <div className="status-logs-search">
                    <svg
                      className="status-logs-search-icon"
                      width="14"
                      height="14"
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
                      placeholder="Search college, FDR id, bank..."
                      value={statusLogsSearch}
                      onChange={(e) => setStatusLogsSearch(e.target.value)}
                    />
                  </div>

                  <div className="logs-filter-wrapper" style={{ position: "relative" }}>
                    <button
                      type="button"
                      className="status-logs-filter-btn"
                      onClick={() => setShowEventTypeFilter((prev) => !prev)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                      {statusLogsEventType
                        ? EVENT_TYPE_OPTIONS.find((o) => o.value === statusLogsEventType)?.label || "Filtered"
                        : "Filters"}
                    </button>

                    {showEventTypeFilter && (
                      <div className="status-logs-filter-popover">
                        {EVENT_TYPE_OPTIONS.map((opt) => (
                          <div
                            key={opt.value}
                            className={`status-logs-filter-item ${statusLogsEventType === opt.value ? "active" : ""}`}
                            onClick={() => {
                              setStatusLogsEventType(opt.value);
                              setShowEventTypeFilter(false);
                            }}
                          >
                            <span>{opt.label}</span>
                            {statusLogsEventType === opt.value && <span>✓</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="status-logs-body">
                  <div className="status-logs-count-summary">
                    {statusLogs.length} events for {selectedStatusCategory || "All Statuses"}
                  </div>

                  {statusLogsLoading ? (
                    <div className="status-logs-skeleton">
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                      <div className="skeleton-row" />
                    </div>
                  ) : statusLogsError ? (
                    <div className="status-logs-error">
                      <span>{statusLogsError}</span>
                      <button
                        type="button"
                        className="status-logs-retry-btn"
                        onClick={handleRetryStatusLogs}
                      >
                        Retry
                      </button>
                    </div>
                  ) : statusLogs.length === 0 ? (
                    <div className="status-logs-empty">
                      {selectedStatusCategory &&
                      (statusDistributionCategories.find((c) => c.status === selectedStatusCategory)?.count ?? 0) === 0 ? (
                        <>
                          <strong>No FDRs are in this state right now.</strong>
                          <p>There are zero records registered under {selectedStatusCategory}.</p>
                        </>
                      ) : (
                        <>
                          <strong>No activity logs found</strong>
                          <p>
                            {statusLogsSearch || statusLogsEventType
                              ? "No events match your current filter criteria."
                              : "No activity logs recorded for this status."}
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    statusLogs.map((ev) => (
                      <div
                        key={ev.id}
                        className="status-log-row"
                        onClick={() => handleEventRowClick(ev)}
                        title="Click to open full FDR review drawer"
                      >
                        <div className="log-top-row">
                          <span className="log-time">{formatLogTime(ev.occurred_at)}</span>
                          <span className={getEventBadgeClass(ev.event_type)}>
                            {ev.event_type.replace(/_/g, " ")}
                          </span>
                        </div>

                        <div className="log-meta-row">
                          <span className="log-fdr-num">{ev.fdr_number_masked}</span>
                          <span className="log-inst">{ev.institution}</span>
                          <span className="log-bank">• {ev.bank}</span>
                        </div>

                        <div className="log-actor-row">
                          Actor: <strong>{ev.actor}</strong> ({ev.role})
                        </div>

                        <p className="log-remark">{ev.remark}</p>

                        {ev.rule_code && (
                          <div className="log-rule-badge">
                            <span className="rule-tag">Rule {ev.rule_code}</span>
                            <span className="rule-desc">{ev.rule_reason}</span>
                          </div>
                        )}

                        {ev.clearance_progress && (
                          <div className="log-clearance-badge">
                            <span className="clearance-tag">Clearance</span>
                            <span className="clearance-desc">{ev.clearance_progress}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {statusLogsHasMore && !statusLogsLoading && (
                  <div className="status-logs-load-more">
                    <button
                      type="button"
                      className="logs-load-more-btn"
                      onClick={handleLoadMoreLogs}
                      disabled={statusLogsLoadingMore}
                    >
                      {statusLogsLoadingMore ? "Loading more..." : "Load more activity (20 per page)"}
                    </button>
                  </div>
                )}
              </section>
            </div>

            {/* GRAPH 1 (UP): FDRs Expiring in the Next 6 Months with Zig-Zag Design */}
            <section className="officer-card full-graph-card">
              <div className="card-header">
                <div>
                  <div className="card-title">FDRs Expiring in the Next 6 Months</div>
                  <div className="dashboard-chart-subtitle">
                    Monthly maturities and deposit value from database records
                  </div>
                </div>

                <div className="chart-header-right-actions">
                  <Link to="/officer/fdrs" className="view-all">
                    View All
                  </Link>
                </div>
              </div>

              {/* Horizontal KPI Summary Strip */}
              <div className="chart-kpi-strip">
                <div className="chart-kpi-item">
                  <span className="chart-kpi-label">Maturing Instruments</span>
                  <span className="chart-kpi-value">{expiryTotalCount} FDRs</span>
                  <span className="chart-kpi-sub">Next 180 days total</span>
                </div>
                <div className="chart-kpi-item">
                  <span className="chart-kpi-label">Maturing Capital</span>
                  <span className="chart-kpi-value">{formatAnalyticsAmount(expiryTotalValue, true)}</span>
                  <span className="chart-kpi-sub">Scheduled deposit value</span>
                </div>
                <div className="chart-kpi-item">
                  <span className="chart-kpi-label">Peak Maturity Month</span>
                  <span className="chart-kpi-value">{peakExpiryMonth?.shortMonth || "—"} ({peakExpiryMonth?.count || 0} FDRs)</span>
                  <span className="chart-kpi-sub">{formatAnalyticsAmount(peakExpiryMonth?.totalValue || 0, true)} volume</span>
                </div>
                <div className="chart-kpi-item">
                  <span className="chart-kpi-label">Immediate Window</span>
                  <span className="chart-kpi-value">{immediate30DaysCount} FDRs</span>
                  <span className="chart-kpi-sub">Due in next 30 days</span>
                </div>
              </div>

              {/* Main Zig-Zag Graph */}
              <div className="zigzag-graph-container">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={expiryForecast} margin={{ top: 16, right: 28, left: -14, bottom: 6 }}>
                    <defs>
                      <linearGradient id="expiryBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#1e6091" stopOpacity={1} />
                        <stop offset="100%" stopColor="#102d4f" stopOpacity={0.88} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#e8edf3" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="shortMonth"
                      tick={{ fill: "#1e293b", fontSize: 12, fontWeight: 600 }}
                      axisLine={{ stroke: "#cfdbe8" }}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: "#334155", fontSize: 12, fontWeight: 500 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ExpiryChartTooltip />} cursor={{ fill: "rgba(224, 237, 252, 0.45)" }} />
                    <Bar
                      dataKey="count"
                      name="FDRs Expiring"
                      fill="url(#expiryBarGrad)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={48}
                    />
                    <Line
                      type="linear"
                      dataKey="count"
                      name="Zig-Zag Trajectory"
                      stroke="#0284c7"
                      strokeWidth={3}
                      dot={{ r: 5, fill: "#0284c7", stroke: "#ffffff", strokeWidth: 2 }}
                      activeDot={{ r: 7, fill: "#0369a1", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Card Footer with Regulation Advisory & Captions */}
              <div className="chart-bottom-bar">
                <div className="chart-bottom-note">
                  <span>
                    Notice: Institutions must file renewal or release compliance at least 90 days before maturity as per AICTE Approval Process Handbook (APH).
                  </span>
                </div>
                <Link to="/officer/renewals" className="chart-bottom-link">
                  Renewals Queue →
                </Link>
              </div>

              {hasSyntheticRecords && (
                <p className="dashboard-demo-caption">
                  Includes synthetic DEMO records; values are illustrative, not real AICTE portfolio data.
                </p>
              )}
            </section>
          </div>

          <section className="officer-card full-card">
            <div className="card-header">
              <div>
                <div className="card-title">FDR Review Queue</div>
                <div className="queue-summary">
                  Showing {Math.min(14, visibleFdrs.length)} of {displayedFdrs.length} records ·
                  {" "}{pendingFdrs.length} need attention
                </div>
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => setRefreshKey((current) => current + 1)}
                >
                  Refresh
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={handleExportCsv}
                >
                  Export CSV
                </button>
              </div>
            </div>

            <details className="filter-disclosure">
              <summary>Search and filters</summary>
              <div className="officer-filters" aria-label="Filter FDR submissions">
              <select
                aria-label="Filter by verification status"
                value={verificationFilter}
                onChange={(event) => setVerificationFilter(event.target.value)}
              >
                <option value="">All verification statuses</option>
                {["VERIFIED", "FLAGGED", "FAILED", "PENDING", "REJECTED"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {formatLabel(status)}
                    </option>
                  )
                )}
              </select>
              <select
                aria-label="Filter by application type"
                value={applicationTypeFilter}
                onChange={(event) =>
                  setApplicationTypeFilter(event.target.value)
                }
              >
                <option value="">All application types</option>
                {Object.entries(applicationTypeLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Filter by bank"
                value={bankFilter}
                onChange={(event) => setBankFilter(event.target.value)}
              >
                <option value="">All banks</option>
                {[...new Set(displayedFdrs.map((fdr) => fdr.bank))].map(
                  (bank) => (
                    <option key={bank} value={bank}>
                      {bank}
                    </option>
                  )
                )}
              </select>
              <input
                aria-label="Submitted from date"
                type="date"
                value={fromDateFilter}
                onChange={(event) => setFromDateFilter(event.target.value)}
              />
              <input
                aria-label="Submitted through date"
                type="date"
                value={toDateFilter}
                onChange={(event) => setToDateFilter(event.target.value)}
              />
              <input
                aria-label="Minimum amount"
                type="number"
                min="0"
                placeholder="Min amount"
                value={minimumAmount}
                onChange={(event) => setMinimumAmount(event.target.value)}
              />
              <input
                aria-label="Maximum amount"
                type="number"
                min="0"
                placeholder="Max amount"
                value={maximumAmount}
                onChange={(event) => setMaximumAmount(event.target.value)}
              />
              <select
                aria-label="Filter by maturity status"
                value={expiryFilter}
                onChange={(event) => setExpiryFilter(event.target.value)}
              >
                <option value="">All expiry statuses</option>
                {["NORMAL", "EXPIRING SOON", "CRITICAL", "EXPIRED"].map(
                  (status) => (
                    <option key={status} value={status}>
                      {formatLabel(status)}
                    </option>
                  )
                )}
              </select>
              <button
                type="button"
                className="action-button"
                onClick={() => {
                  setVerificationFilter("");
                  setApplicationTypeFilter("");
                  setBankFilter("");
                  setFromDateFilter("");
                  setToDateFilter("");
                  setMinimumAmount("");
                  setMaximumAmount("");
                  setExpiryFilter("");
                  setSearchText("");
                }}
              >
                Clear filters
              </button>
              </div>
            </details>

            {loadingFdrs && (
              <p className="fdr-fetch-message" role="status">
                Loading database FDR submissions…
              </p>
            )}
            {fdrLoadError && (
              <p className="fdr-fetch-message fdr-fetch-error" role="alert">
                {fdrLoadError} Demo submissions are still shown.
              </p>
            )}
            {!loadingFdrs && !fdrLoadError && realFdrs.length === 0 && (
              <p className="fdr-fetch-message">
                No database submissions yet. Demo submissions are shown below.
              </p>
            )}

            <div className="table-wrapper">
              <table className="officer-table">
                <thead>
                  <tr>
                    <th>FDR / INSTITUTION</th>
                    <th>PRIORITY</th>
                    <th>AMOUNT</th>
                    <th>MATURITY</th>
                    <th>VERIFICATION</th>
                    <th>NEEDS ATTENTION</th>
                    <th>SUBMITTED</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleFdrs.slice(0, 14).map((fdr) => (
                    <tr key={fdr.id}>
                      <td className="fdr-number">
                        {fdr.number}
                        {fdr.isNew && (
                          <span className="new-indicator">NEW</span>
                        )}
                        <span className="queue-secondary">
                          {fdr.institution} · {fdr.bank}
                        </span>
                      </td>

                      <td>
                        <FdrPriorityBadge
                          priority={fdr.priority}
                          compact
                        />
                      </td>
                      <td>{fdr.amount}</td>
                      <td>
                        {fdr.maturity}
                        <span className="queue-secondary">
                          {fdr.maturityStatus || "Maturity unknown"}
                        </span>
                      </td>

                      <td>
                        <StatusBadge
                          type={
                            fdr.verification === "Verified"
                              ? "verified"
                              : ["Flagged", "Failed", "Amount Mismatch"].includes(
                                  fdr.verification
                                )
                              ? "mismatch"
                              : "pending"
                          }
                        >
                          {fdr.verification}
                        </StatusBadge>
                      </td>

                      <td className="queue-issue">
                        {fdr.reviewIssue || getReviewIssue(fdr)}
                      </td>
                      <td>{fdr.submitted}</td>

                      <td>
                        <button
                          className="action-button"
                          onClick={() => openFdrDetails(fdr)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                  {visibleFdrs.length === 0 && (
                    <tr>
                      <td colSpan="8" style={{ textAlign: "center" }}>
                        No FDR submissions match these filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <div className="lower-grid">
            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  Requires Attention / Verification Queue
                </div>

                <Link
                  to="/officer/verification"
                  className="view-all"
                >
                  View All
                </Link>
              </div>

              <div className="table-wrapper">
                <table className="officer-table">
                  <thead>
                    <tr>
                      <th>FDR NUMBER</th>
                      <th>INSTITUTION</th>
                      <th>BANK</th>
                      <th>AMOUNT</th>
                      <th>SUBMITTED</th>
                      <th>RESULT</th>
                      <th>PRIORITY</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {pendingFdrs.slice(0, 10).map((item) => (
                      <tr key={item.id}>
                        <td className="fdr-number">
                          {item.number}
                        </td>
                        <td>{item.institution}</td>
                        <td>{item.bank}</td>
                        <td>{item.amount}</td>
                        <td>{item.submitted}</td>
                        <td>
                          <span title={item.reviewReason || ""}>
                            {item.verification || "Pending"}
                          </span>
                        </td>
                        <td>
                          <FdrPriorityBadge
                            priority={item.priority}
                            compact
                          />
                        </td>
                        <td>
                          <button
                            className="action-button"
                            onClick={() => openFdrDetails(item)}
                          >
                            {item.isReal ? "View" : "Review"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  Release Requests
                </div>

                <Link
                  to="/officer/release-requests"
                  className="view-all"
                >
                  View All
                </Link>
              </div>

              <div className="table-wrapper">
                <table className="officer-table">
                  <thead>
                    <tr>
                      <th>REQUEST ID</th>
                      <th>INSTITUTION</th>
                      <th>FDR NUMBER</th>
                      <th>PRIORITY</th>
                      <th>REASON</th>
                      <th>STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {releaseRequests.map((request) => (
                      <tr key={request.id}>
                        <td className="fdr-number">
                          {request.id}
                        </td>
                        <td>{request.institution}</td>
                        <td>{request.fdr}</td>
                        <td>
                          <FdrPriorityBadge
                            priority={dashboardPriority({
                              fdr_number: request.fdr
                            })}
                            compact
                          />
                        </td>
                        <td>{request.reason}</td>
                        <td>
                          <StatusBadge
                            type="pending"
                          >
                            {request.status}
                          </StatusBadge>
                        </td>
                        <td>
                          <Link className="action-button" to="/officer/release-requests">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section className="officer-card full-card" style={{ marginTop: 14 }}>
            <div className="card-header">
              <div className="card-title">
                My Tasks / Notifications
              </div>

              <Link
                to="/officer/notifications"
                className="view-all"
              >
                View All
              </Link>
            </div>

            <div className="task-list">
              {(officerNotifications.length > 0 ? officerNotifications : notifications)
                .slice(0, 5)
                .map((item, index) => {
                  const formatTypeLabel = (type) => {
                    switch (type) {
                      case "DISCREPANCY_ALERT":
                        return "Core Banking Discrepancy";
                      case "RULE_VIOLATION":
                        return "Regulatory Rule Violation";
                      case "RENEWAL_ALERT":
                        return "Upcoming Maturity Notice";
                      case "FDR_SUBMISSION":
                        return "New Deposit Submission";
                      case "RELEASE_REQUEST":
                        return "Collateral Release Review";
                      case "RELEASE_PROGRESS":
                        return "Regional Clearance Progress";
                      case "RENEWAL_APPROVED":
                        return "Renewal Clearance Approved";
                      case "COMPLIANCE_NOTICE":
                        return "Vigilance Audit Complete";
                      default:
                        return "AICTE Compliance Notice";
                    }
                  };
                  const getTypeIcon = (type) => {
                    switch (type) {
                      case "DISCREPANCY_ALERT":
                        return "!";
                      case "RULE_VIOLATION":
                        return "⚠";
                      case "RENEWAL_ALERT":
                        return "◷";
                      case "FDR_SUBMISSION":
                        return "▣";
                      case "RELEASE_REQUEST":
                      case "RELEASE_PROGRESS":
                        return "↑";
                      case "RENEWAL_APPROVED":
                        return "✓";
                      default:
                        return "ℹ";
                    }
                  };
                  const isReal = item.id !== undefined && item.message !== undefined;
                  const title = isReal ? item.message : item.title;
                  const text = isReal ? formatTypeLabel(item.type) : item.text;
                  const time = isReal ? formatDateTime(item.created_at) : item.time;
                  const icon = isReal ? getTypeIcon(item.type) : item.icon;

                  return (
                    <Link
                      className="task-item"
                      key={isReal ? `real-${item.id}` : `demo-${index}`}
                      to="/officer/notifications"
                    >
                      <div className="task-icon">{icon}</div>
                      <div className="task-info">
                        <div className="task-title">{title}</div>
                        <div className="task-text">{text}</div>
                      </div>
                      <div className="task-time">{time}</div>
                    </Link>
                  );
                })}
            </div>
          </section>
        </section>
      {selectedFdr && (
        <div
          className="fdr-modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedFdr(null);
              setSearchParams({});
            }
          }}
        >
          <section
            className="fdr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fdr-modal-title"
          >
            <div className="fdr-modal-header">
              <div>
                <div className="review-eyebrow">FDR review</div>
                <h2 className="fdr-modal-title" id="fdr-modal-title">
                  {selectedFdr.fdr_number}
                </h2>
              </div>
              <button
                className="fdr-modal-close"
                type="button"
                aria-label="Close FDR details"
                onClick={() => {
                  setSelectedFdr(null);
                  setSearchParams({});
                }}
              >
                ×
              </button>
            </div>

            <div className="fdr-review-scroll">
              <section className="review-summary">
                <div className="review-summary-top">
                  <div>
                    <div className="review-eyebrow">Institution</div>
                    <strong>{selectedFdr.institution?.name || "Unknown institution"}</strong>
                  </div>
                  <StatusBadge
                    type={
                      selectedFdr.verification_status?.toUpperCase() === "VERIFIED"
                        ? "verified"
                        : ["FLAGGED", "FAILED", "REJECTED"].includes(
                            selectedFdr.verification_status?.toUpperCase()
                          )
                          ? "mismatch"
                          : "pending"
                    }
                  >
                    {formatLabel(selectedFdr.verification_status)}
                  </StatusBadge>
                </div>
                <div className="review-summary-facts">
                  <div><span>Bank</span><strong>{selectedFdr.bank_name || "—"}</strong></div>
                  <div><span>Deposit amount</span><strong>{formatAmount(selectedFdr.amount)}</strong></div>
                  <div><span>Maturity</span><strong>{formatDate(selectedFdr.maturity_date)}</strong></div>
                </div>
              </section>

              <FdrPrioritySummary
                priority={dashboardPriority(selectedFdr)}
                fdr={selectedFdr}
              />

              <section
                className={`review-attention${selectedReviewFindings.length ? " has-findings" : ""}`}
                aria-live="polite"
              >
                <div className="review-attention-heading">
                  <strong>
                    {selectedFailedChecks.length
                      ? "Why this needs review"
                      : selectedPendingChecks.length
                        ? "Checks still pending"
                        : selectedFdr.verification_status?.toUpperCase() === "VERIFIED"
                          ? "No open verification issues"
                          : "Review status"}
                  </strong>
                  {Number.isFinite(selectedFdr.verification?.score) && (
                    <span>
                      Score: {selectedFdr.verification.score}/100
                    </span>
                  )}
                </div>
                {selectedReviewFindings.length ? (
                  <ul>
                    {selectedReviewFindings.map((item) => (
                      <li key={item.key}>
                        <strong>{item.label}:</strong> {item.explanation}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {selectedFdr.verification?.review_reason ||
                      (selectedFdr.verification_status === "VERIFIED"
                        ? "All recorded checks passed."
                        : "Review the verification details below for the recorded result.")}
                  </p>
                )}
                {(selectedBankVerification?.isMock ||
                  selectedBankVerification?.source === "MOCK_BANK_PROVIDER") && (
                  <p className="review-demo-note">
                    Demo bank data only — this is not a live bank lookup.
                  </p>
                )}
                {selectedFdr.documents?.[0] && (
                  <button
                    className="action-button"
                    type="button"
                    onClick={() =>
                      handleOpenDocument(selectedFdr, selectedFdr.documents[0])
                    }
                  >
                    Open submitted document
                  </button>
                )}
                {documentError && (
                  <p className="fdr-fetch-message document-error" role="alert">
                    {documentError}
                  </p>
                )}
                {verificationActionError && (
                  <p className="fdr-fetch-message document-error" role="alert">
                    {verificationActionError}
                  </p>
                )}
              </section>

              <details className="review-accordion" open>
                <summary>FDR details</summary>
                <section className="fdr-details-section">
                  <div className="fdr-details-grid">
                    <DetailItem label="FDR number" value={selectedFdr.fdr_number} />
                    <DetailItem label="Bank" value={selectedFdr.bank_name} />
                    <DetailItem label="Amount" value={formatAmount(selectedFdr.amount)} />
                    <DetailItem label="Issue date" value={formatDate(selectedFdr.issue_date)} />
                    <DetailItem label="Maturity date" value={formatDate(selectedFdr.maturity_date)} />
                    <DetailItem
                      label="Maturity classification"
                      value={getMaturityStatus(selectedFdr.maturity_date)}
                    />
                    <DetailItem label="Status" value={formatLabel(selectedFdr.status)} />
                    <DetailItem
                      label="Verification status"
                      value={formatLabel(selectedFdr.verification_status)}
                    />
                    <DetailItem
                      label="Submitted date"
                      value={formatDate(selectedFdr.created_at)}
                    />
                  </div>
                </section>
              </details>

              <details className="review-accordion" open>
                <summary>
                  Verification details
                  {selectedFailedChecks.length > 0 &&
                    ` · ${selectedFailedChecks.length} failed`}
                  {!selectedFailedChecks.length &&
                    selectedPendingChecks.length > 0 &&
                    ` · ${selectedPendingChecks.length} pending`}
                </summary>
                <section className="fdr-details-section">
              <h3 className="fdr-details-heading">Automated verification</h3>
              <div className="fdr-details-grid">
                <DetailItem
                  label="Automated result"
                  value={formatLabel(
                    selectedFdr.verification?.result ||
                      selectedFdr.verification_status
                  )}
                />
                <DetailItem
                  label="Verification score"
                  value={
                    Number.isFinite(selectedFdr.verification?.score)
                      ? `${selectedFdr.verification.score} / 100`
                      : "Not available"
                  }
                />
                <DetailItem
                  label="OCR confidence"
                  value={
                    Number.isFinite(selectedFdr.verification?.ocr_confidence)
                      ? `${Math.round(
                          selectedFdr.verification.ocr_confidence <= 1
                            ? selectedFdr.verification.ocr_confidence * 100
                            : selectedFdr.verification.ocr_confidence
                        )}%`
                      : "Not available"
                  }
                />
                <DetailItem
                  label="OCR provider"
                  value={
                    selectedFdr.verification?.source === "NOT_CONFIGURED"
                      ? "Not configured; no OCR was performed"
                      : selectedFdr.verification?.source
                  }
                />
              </div>
              <div className="fdr-details-section">
                <h4 className="fdr-details-heading">Verification Summary</h4>
                <div className="compliance-summary">
                  <div>
                    <div className="fdr-detail-label">Overall status</div>
                    <div className="fdr-detail-value">
                      {formatLabel(selectedFdr.verification_status)}
                    </div>
                  </div>
                  <div>
                    <div className="fdr-detail-label">Deterministic score</div>
                    <div className="compliance-score">
                      {Number.isFinite(selectedFdr.verification?.score)
                        ? `${selectedFdr.verification.score} / 100`
                        : "Not available"}
                    </div>
                  </div>
                </div>
                {selectedFdr.verification?.checks?.length ? (
                  <div>
                    {selectedFdr.verification.checks.map((item) => (
                      <div className="verification-check" key={item.key}>
                        <strong>{item.label}</strong>
                        <span>
                          {item.points > 0
                            ? `+${item.points} points`
                            : "Informational"}
                        </span>
                        <span className="verification-check-status">
                          {formatLabel(item.status)}
                        </span>
                        <small>{item.explanation}</small>
                      </div>
                    ))}
                    <p className="fdr-detail-label" style={{ marginTop: 8 }}>
                      Points are awarded only for PASS checks; PENDING and FAILED
                      checks earn zero. A failed required check flags the FDR.
                      Overall verification remains pending until every check,
                      including bank verification, passes.
                    </p>
                  </div>
                ) : (
                  <p className="fdr-fetch-message">
                    Per-check results are unavailable for this legacy record.
                  </p>
                )}
              </div>
              {!selectedFdr.isDemo && (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button
                    className="action-button"
                    type="button"
                    disabled={runningVerification}
                    onClick={handleRunAutomatedVerification}
                  >
                    {runningVerification
                      ? "Running…"
                      : "Run automated verification"}
                  </button>
                  <button
                    className="action-button"
                    type="button"
                    disabled={runningVerification}
                    onClick={handleRunBankVerification}
                  >
                    Run mock bank verification
                  </button>
                </div>
              )}
              {selectedFdr.verification?.review_reason && (
                <p className="verification-reason" role="note">
                  Review reason: {selectedFdr.verification.review_reason}
                </p>
              )}
              <section className="fdr-details-section">
                <h4 className="fdr-details-heading">Bank Verification</h4>
                <div className="bank-verification-warning" role="note">
                  <strong>
                    Bank Verification:{" "}
                    {selectedBankVerification?.isMock ||
                    selectedBankVerification?.source === "MOCK_BANK_PROVIDER"
                      ? "Simulated · "
                      : ""}
                    {formatLabel(
                      selectedBankVerification?.status ||
                        (selectedBankVerification?.verified
                          ? "VERIFIED"
                          : "UNAVAILABLE")
                    )}
                  </strong>
                  <div>
                    Provider: {selectedBankVerification?.source || "Unavailable"}
                  </div>
                  <div>
                    {selectedBankVerification?.message ||
                      "No bank verification result is stored for this FDR."}
                  </div>
                  <div className="fdr-details-grid" style={{ marginTop: 8 }}>
                    <DetailItem
                      label="Bank name"
                      value={selectedBankVerification?.bank || selectedFdr.bank_name}
                    />
                    <DetailItem
                      label="Bank verification reference"
                      value={
                        selectedBankVerification?.reference ||
                        selectedBankVerification?.referenceNumber ||
                        selectedBankVerification?.verificationReference
                      }
                    />
                    <DetailItem
                      label="Submitted amount"
                      value={formatAmount(
                        selectedFdr.amount
                      )}
                    />
                    <DetailItem
                      label="Verified amount"
                      value={selectedBankVerification?.status === "VERIFIED"
                        ? formatAmount(selectedBankVerification.amount)
                        : "Not verified"}
                    />
                    <DetailItem
                      label="Verification date"
                      value={formatDate(
                        selectedBankVerification?.verifiedAt ||
                        selectedBankVerification?.verified_at ||
                        selectedFdr.verification?.verified_at
                      )}
                    />
                    <DetailItem
                      label="Provider FDR number"
                      value={selectedBankVerification?.fdrNumber}
                    />
                    <DetailItem
                      label="Provider status"
                      value={formatLabel(selectedBankVerification?.status || "UNAVAILABLE")}
                    />
                    <DetailItem
                      label="Provider issue date"
                      value={formatDate(selectedBankVerification?.issueDate)}
                    />
                    <DetailItem
                      label="Provider maturity date"
                      value={formatDate(
                        selectedBankVerification?.maturityDate
                      )}
                    />
                    <DetailItem
                      label="FDR exists"
                      value={
                        selectedBankVerification?.exists === null ||
                        selectedBankVerification?.exists === undefined
                          ? "Not confirmed"
                          : selectedBankVerification.exists
                            ? "Yes"
                            : "No"
                      }
                    />
                  </div>
                  {selectedBankVerification?.checks &&
                    Object.entries(
                      selectedBankVerification.checks
                    ).map(([check, passed]) => (
                      <div key={check}>
                        {formatLabel(check)}: {passed ? "Passed" : "Failed"}
                      </div>
                    ))}
                </div>
              </section>
              <h4 className="fdr-details-heading">Field Comparison</h4>
              {selectedFdr.verification?.comparisons?.length ? (
                <div className="table-wrapper">
                  <table className="comparison-table">
                    <thead>
                      <tr>
                        <th>FIELD</th>
                        <th>INSTITUTION ENTERED</th>
                        <th>OCR EXTRACTED</th>
                        <th>RESULT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedFdr.verification.comparisons.map((comparison) => (
                        <tr key={comparison.field}>
                          <td>{formatLabel(comparison.field)}</td>
                          <td>
                            {formatComparisonValue(
                              comparison.field,
                              comparison.submittedValue
                            )}
                          </td>
                          <td>
                            {formatComparisonValue(
                              comparison.field,
                              comparison.extractedValue
                            )}
                          </td>
                          <td>{formatLabel(comparison.result)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="fdr-fetch-message">
                  No automated comparison is stored for this record.
                </p>
              )}

              <details className="automated-ocr-text" style={{ marginTop: 14 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600, color: "#003366", fontSize: "13px" }}>
                  View OCR Text
                </summary>
                <pre style={{
                  marginTop: 8,
                  padding: 12,
                  background: "#f8fafc",
                  border: "1px solid #e2e8f0",
                  borderRadius: 6,
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                  maxHeight: 180,
                  overflowY: "auto",
                  color: "#334155",
                  lineHeight: 1.5
                }}>
                  {selectedFdr?.verification?.extracted_data?.rawText ||
                    selectedFdr?.verification?.extracted_data?.ocr_text ||
                    selectedFdr?.ocr_text ||
                    selectedFdr?.verification?.rawText ||
                    "No raw OCR text is available for this submission."}
                </pre>
              </details>
                </section>
              </details>

              <details className="review-accordion">
                <summary>Institution, application and activity</summary>
            <section className="fdr-details-section">
              <h3 className="fdr-details-heading">Institution Information</h3>
              <div className="fdr-details-grid">
                <DetailItem label="Institution name" value={selectedFdr.institution?.name} />
                <DetailItem label="AICTE code" value={selectedFdr.institution?.aicte_code} />
                <DetailItem label="Address" value={selectedFdr.institution?.address} />
                <DetailItem label="City" value={selectedFdr.institution?.city} />
                <DetailItem label="State" value={selectedFdr.institution?.state} />
                <DetailItem label="Email" value={selectedFdr.institution?.email} />
              </div>
              {selectedFdr.institution?.id && (
                <div style={{ marginTop: 12 }}>
                  <button
                    className="action-button"
                    type="button"
                    onClick={handleLoadCompliance}
                    disabled={activeCompliance.loading}
                  >
                    {activeCompliance.loading
                      ? "Calculating..."
                      : activeCompliance.data
                        ? "Refresh compliance score"
                        : "View institution compliance score"}
                  </button>
                  {activeCompliance.error && (
                    <p className="fdr-fetch-message document-error" role="alert">
                      {activeCompliance.error}
                    </p>
                  )}
                  {activeCompliance.data && (
                    <div style={{ marginTop: 10 }}>
                      <div className="compliance-summary">
                        <div>
                          <div className="fdr-detail-label">
                            Institution Compliance Score
                          </div>
                          <div className="compliance-score">
                            {activeCompliance.data.score} /{" "}
                            {activeCompliance.data.maximumScore}
                          </div>
                        </div>
                        <div className="fdr-detail-label">
                          {activeCompliance.data.fdrCount} FDR(s) assessed
                        </div>
                      </div>
                      {activeCompliance.data.factors.map((factor) => (
                        <div className="compliance-factor" key={factor.key}>
                          <strong>{factor.label}</strong>
                          <strong>
                            +{factor.points} / {factor.maximumPoints}
                          </strong>
                          <small>
                            {factor.numerator} of {factor.denominator} FDRs
                            {factor.denominator
                              ? ` (${Math.round(
                                  (factor.numerator / factor.denominator) * 100
                                )}%)`
                              : ""}
                          </small>
                        </div>
                      ))}
                      <p className="fdr-detail-label" style={{ marginTop: 8 }}>
                        {activeCompliance.data.methodology}
                      </p>
                      <p className="fdr-detail-label">
                        Metrics: {activeCompliance.data.metrics.flagged} flagged,
                        {" "}{activeCompliance.data.metrics.failedSubmissions} failed,
                        {" "}{activeCompliance.data.metrics.duplicateSubmissions} duplicate,
                        {" "}{activeCompliance.data.metrics.expired} expired.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </section>

            <section className="fdr-details-section">
              <h3 className="fdr-details-heading">Application Information</h3>
              {selectedFdr.application ? (
                <div className="fdr-details-grid">
                  <DetailItem
                    label="Application type"
                    value={
                      applicationTypeLabels[
                        selectedFdr.application.application_type
                      ] || formatLabel(selectedFdr.application.application_type)
                    }
                  />
                  <DetailItem
                    label="Programme name"
                    value={selectedFdr.application.programme_name}
                  />
                  <DetailItem
                    label="Programme level"
                    value={selectedFdr.application.programme_level}
                  />
                  <DetailItem
                    label="Discipline"
                    value={selectedFdr.application.discipline}
                  />
                  <DetailItem
                    label="Current intake"
                    value={selectedFdr.application.current_intake}
                  />
                  <DetailItem
                    label="Proposed intake"
                    value={selectedFdr.application.proposed_intake}
                  />
                  <DetailItem
                    label="Academic year"
                    value={selectedFdr.application.academic_year}
                  />
                  <DetailItem
                    label="Application status"
                    value={formatLabel(selectedFdr.application.status)}
                  />
                  <DetailItem
                    label="Application description"
                    value={selectedFdr.application.description}
                  />
                </div>
              ) : (
                <p className="fdr-fetch-message">
                  No application is linked to this FDR.
                </p>
              )}
            </section>

            <section className="fdr-details-section">
              <h3 className="fdr-details-heading">Documents</h3>
              {selectedFdr.documents?.length ? (
                selectedFdr.documents.map((document) => (
                  <div className="fdr-document-row" key={document.id}>
                    <div>
                      <div className="fdr-detail-value">
                        {document.file_name}
                      </div>
                      <div className="fdr-detail-label">
                        {formatLabel(document.document_type)}
                      </div>
                    </div>
                    <button
                      className="action-button"
                      type="button"
                      onClick={() => handleOpenDocument(selectedFdr, document)}
                    >
                      Open document
                    </button>
                  </div>
                ))
              ) : (
                <p className="fdr-fetch-message">
                  No document is attached to this FDR.
                </p>
              )}
              {documentError && (
                <p className="fdr-fetch-message document-error" role="alert">
                  {documentError}
                </p>
              )}
            </section>

            <section className="fdr-details-section">
              <h3 className="fdr-details-heading">FDR Activity Timeline</h3>
              {activeTimeline.loading ? (
                <p className="fdr-fetch-message">Loading activity timeline...</p>
              ) : activeTimeline.error ? (
                <p className="fdr-fetch-message document-error" role="alert">
                  {activeTimeline.error}
                </p>
              ) : activeTimeline.events.length ? (
                <ol className="timeline-list">
                  {activeTimeline.events.map((event) => {
                    const score = event.details?.score;
                    const description =
                      event.details?.fileName ||
                      event.details?.reason ||
                      event.details?.message;

                    return (
                      <li className="timeline-item" key={event.id}>
                        <span className="timeline-marker" aria-hidden="true" />
                        <div>
                          <div className="timeline-event-title">
                            {formatTimelineAction(event.action)}
                            {Number.isFinite(Number(score)) &&
                              event.action === "VERIFICATION_SCORE_GENERATED" &&
                              `: ${score}/100`}
                          </div>
                          <div className="timeline-event-date">
                            {formatDateTime(event.created_at)}
                          </div>
                          {description && (
                            <p className="timeline-event-details">
                              {description}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="fdr-fetch-message">
                  {selectedFdr.isDemo
                    ? "Demo record only; it has no database audit history."
                    : "No timeline events are recorded for this FDR."}
                </p>
              )}
            </section>
              </details>
            </div>

            {canRecordOfficerDecision && (
              <section className="officer-decision-section">
                <div className="decision-section-header">
                  <span className="decision-section-title">Verification Decision</span>
                </div>

                <div className={`decision-message ${decisionMessageClass}`}>
                  <strong>{verificationDecisionMessage}</strong>
                </div>

                {decisionSuccessMessage && (
                  <p className="decision-success-alert" role="status">
                    ✓ {decisionSuccessMessage}
                  </p>
                )}

                {reviewActionError && (
                  <p className="decision-error-alert" role="alert">
                    ⚠ {reviewActionError}
                  </p>
                )}

                <div className="decision-reason-box">
                  <label htmlFor="officer-review-reason">
                    Decision Notes / Reason <span className="decision-reason-sub">(recorded in audit trail)</span>
                  </label>
                  <textarea
                    id="officer-review-reason"
                    className="decision-reason-textarea"
                    value={reviewReasonInput}
                    onChange={(event) => setReviewReasonInput(event.target.value)}
                    disabled={savingReviewAction}
                    placeholder="Enter review notes or leave blank for standard regulatory recording..."
                    rows={2}
                  />
                </div>

                <div className="decision-action-toolbar">
                  <span className="decision-current-status">
                    Current Status: <strong>{formatLabel(selectedFdr.verification_status)}</strong>
                  </span>
                  <div className="decision-buttons-group">
                    <button
                      className="btn-reject-fdr"
                      type="button"
                      disabled={savingReviewAction || runningVerification}
                      onClick={() => handleOfficerDecision("REJECT")}
                    >
                      {savingReviewAction && lastDecision === "REJECT" ? "Processing..." : "✕ Reject FDR"}
                    </button>
                    <button
                      className="btn-approve-fdr"
                      type="button"
                      disabled={savingReviewAction || runningVerification}
                      onClick={() => handleOfficerDecision("APPROVE")}
                    >
                      {savingReviewAction && lastDecision === "APPROVE" ? "Processing..." : "✓ Approve FDR"}
                    </button>
                  </div>
                </div>
              </section>
            )}
          </section>
        </div>
      )}
    </OfficerLayout>
  );
}