import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  getInstitutionCompliance,
  getOfficerFdrDocument,
  getOfficerFdrs,
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

const statusDistributionCategories = [
  {
    key: "active",
    label: "Active",
    count: 1120,
    percentage: "71.8%",
    color: "#29b97b"
  },
  {
    key: "expiring_soon",
    label: "Expiring Soon",
    count: 62,
    percentage: "5.0%",
    color: "#f7c72d"
  },
  {
    key: "matured",
    label: "Matured",
    count: 18,
    percentage: "1.4%",
    color: "#ef5b63"
  },
  {
    key: "pending_verification",
    label: "Pending Verification",
    count: 43,
    percentage: "3.4%",
    color: "#4c9be8"
  },
  {
    key: "renewal_pending",
    label: "Renewal Pending",
    count: 27,
    percentage: "2.2%",
    color: "#9b67db"
  },
  {
    key: "release_requested",
    label: "Release Requested",
    count: 8,
    percentage: "0.6%",
    color: "#f38a34"
  },
  {
    key: "inactive",
    label: "Inactive",
    count: 70,
    percentage: "5.6%",
    color: "#a8b4c2"
  }
];

const statusDistributionTotal = 1248;

function buildDonutGradient() {
  const categoryCountTotal = statusDistributionCategories.reduce(
    (total, category) => total + category.count,
    0
  );
  let accumulated = 0;
  const segments = statusDistributionCategories.map(({ count, color }) => {
    const start = (accumulated / categoryCountTotal) * 100;
    accumulated += count;
    const end = (accumulated / categoryCountTotal) * 100;
    return `${color} ${start}% ${end}%`;
  });

  return `conic-gradient(${segments.join(", ")})`;
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

const stats = [
  {
    title: "Total FDRs",
    key: "total_fdrs",
    value: "—",
    change: "4%",
    color: "blue",
    icon: "▣",
  },
  {
    title: "Automatically Verified",
    key: "verified",
    value: "—",
    change: "6%",
    color: "green",
    icon: "₹",
  },
  {
    title: "Flagged for Review",
    key: "flagged",
    value: "—",
    change: "2%",
    color: "yellow",
    icon: "◷",
  },
  {
    title: "Failed Checks",
    key: "failed",
    value: "—",
    change: "18%",
    color: "red",
    icon: "!",
  },
  {
    title: "Institutions",
    key: "institutions",
    value: "—",
    change: "5%",
    color: "purple",
    icon: "↻",
  },
  {
    title: "Total Deposit Amount",
    key: "total_deposit_amount",
    value: "—",
    change: "14%",
    color: "blue",
    icon: "↑",
  },
];

const recentFdrs = [
  {
    number: "FDR125678",
    institution: "ABC Engineering College",
    bank: "SBI",
    amount: "₹10,00,000",
    maturity: "31 Dec 2027",
    status: "Active",
    verification: "Verified",
    submitted: "24 Oct 2026",
  },
  {
    number: "FDR125679",
    institution: "XYZ Institute",
    bank: "HDFC",
    amount: "₹5,00,000",
    maturity: "15 Dec 2026",
    status: "Expiring Soon",
    verification: "Verified",
    submitted: "24 Oct 2026",
  },
  {
    number: "FDR125680",
    institution: "PQR College",
    bank: "ICICI",
    amount: "₹8,00,000",
    maturity: "01 Jan 2026",
    status: "Matured",
    verification: "Verified",
    submitted: "23 Oct 2026",
  },
  {
    number: "FDR125681",
    institution: "LMN Technical Institute",
    bank: "Axis Bank",
    amount: "₹10,00,000",
    maturity: "10 Feb 2027",
    status: "Active",
    verification: "Amount Mismatch",
    submitted: "23 Oct 2026",
  },
  {
    number: "FDR125682",
    institution: "RST Engineering College",
    bank: "Punjab National Bank",
    amount: "₹5,00,000",
    maturity: "20 Jul 2027",
    status: "Active",
    verification: "Pending",
    submitted: "22 Oct 2026",
  },
];

const verificationQueue = [
  {
    number: "FDR125690",
    institution: "GHI College",
    bank: "HDFC",
    amount: "₹10,00,000",
    submitted: "24 Oct 2026",
    priority: "High",
  },
  {
    number: "FDR125691",
    institution: "JKL Institute",
    bank: "SBI",
    amount: "₹5,00,000",
    submitted: "24 Oct 2026",
    priority: "High",
  },
  {
    number: "FDR125692",
    institution: "MNO College",
    bank: "ICICI",
    amount: "₹8,00,000",
    submitted: "23 Oct 2026",
    priority: "Medium",
  },
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

function StatCard({ item }) {
  return (
    <div className={`officer-stat-card ${item.color}`}>
      <div className="stat-icon">{item.icon}</div>

      <div className="stat-content">
        <div className="stat-title">{item.title}</div>

        <div className="stat-value">
          {item.value}
        </div>

        <div className="stat-change">
          {item.caption}
        </div>
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
  const [officerNotifications, setOfficerNotifications] = useState([]);
  const [releaseRequestCount, setReleaseRequestCount] = useState(0);
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
    const reason = reviewReasonInput.trim();

    if (!reason) {
      setReviewActionError("Enter a reason before recording this decision.");
      return;
    }

    const token = localStorage.getItem("token");

    if (!token || !selectedFdr) {
      setReviewActionError("An officer login is required to record a decision.");
      return;
    }

    setSavingReviewAction(true);
    setReviewActionError("");

    try {
      const result = await postOfficerFdrOverride(
        token,
        selectedFdr.id,
        decision,
        reason
      );

      setRealFdrs((current) =>
        current.map((fdr) =>
          fdr.id === selectedFdr.id
            ? {
                ...fdr,
                verification_status: result.verificationStatus,
                verification: {
                  ...fdr.verification,
                  result: result.verificationStatus,
                  source: "OFFICER_OVERRIDE",
                  review_reason: reason
                }
              }
            : fdr
        )
      );
      setSelectedFdr(null);
      setReviewReasonInput("");

      getOfficerStats(token)
        .then(setOfficerStats)
        .catch((error) => {
          setStatsLoadError(
            error.message || "Unable to refresh officer statistics."
          );
        });
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

  const realFdrNumbers = new Set(
    realFdrs.map((fdr) => String(fdr.fdr_number).trim().toLocaleLowerCase("en-IN"))
  );
  const displayedFdrs = [
    ...realFdrs.map((fdr) => ({
      id: `real-${fdr.id}`,
      number: fdr.fdr_number,
      institution: fdr.institution?.name || "Unknown institution",
      bank: fdr.bank_name,
      amount: formatAmount(fdr.amount),
      maturity: formatDate(fdr.maturity_date),
      maturityStatus: getMaturityStatus(fdr.maturity_date),
      status: formatLabel(fdr.status),
      verification: formatLabel(fdr.verification_status),
      applicationType: fdr.application?.application_type
        ? applicationTypeLabels[fdr.application.application_type] ||
          formatLabel(fdr.application.application_type)
        : "—",
      verificationScore: fdr.verification?.score,
      submitted: formatDate(fdr.created_at),
      isReal: true,
      isNew: isNewSubmission(fdr.created_at),
      record: fdr
    })),
    ...recentFdrs
      .filter(
        (fdr) =>
          !realFdrNumbers.has(
            String(fdr.number).trim().toLocaleLowerCase("en-IN")
          )
      )
      .map((fdr) => ({
      ...fdr,
      id: `demo-${fdr.number}`,
      isReal: false,
      isNew: false,
      verificationScore: null,
      record: fdr
    }))
  ];

  function openFdrDetails(fdr) {
    setDocumentError("");
    setReviewActionError("");
    setReviewReasonInput("");
    if (fdr.isReal) {
      setSelectedFdr(fdr.record);
      setSearchParams({});
      return;
    }

    const record = fdr.record;
    const submittedDate = new Date(record.submitted);
    const maturityDate = new Date(record.maturity);
    const demoStatus = String(record.verification || "PENDING")
      .toUpperCase()
      .replaceAll(" ", "_");
    setSelectedFdr({
      id: fdr.id,
      isDemo: true,
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
        score: null,
        checks: [],
        comparisons: [],
        bank_verification: null,
        review_reason: "Demonstration record; no live verification is stored."
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
        priority:
          ["FLAGGED", "FAILED"].includes(
            fdr.verification_status?.toUpperCase()
          ) ||
          fdr.verification?.checks?.some((item) => item.status === "FAILED") ||
          fdr.verification?.comparisons?.some(
            (item) => item.result === "MISMATCH"
          ) ||
          fdr.verification?.bank_verification?.status?.toUpperCase() ===
            "FAILED" ||
          (Number.isFinite(fdr.verification?.score) &&
            fdr.verification.score < 70)
            ? "High"
            : "Medium",
        verification: formatLabel(fdr.verification_status),
        reviewReason: fdr.verification?.review_reason,
        isReal: true,
        record: fdr
      })),
    ...verificationQueue
      .filter(
        (item) =>
          !realFdrNumbers.has(
            String(item.number).trim().toLocaleLowerCase("en-IN")
          )
      )
      .map((item) => ({
        ...item,
        id: `demo-${item.number}`,
        isReal: false,
        record: item
      }))
  ];

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
  const demoDisplayedFdrs = displayedFdrs.filter((fdr) => !fdr.isReal);
  const demoFallbackStats = {
    total_fdrs: demoDisplayedFdrs.length,
    verified: demoDisplayedFdrs.filter(
      (fdr) => String(fdr.verification).toUpperCase() === "VERIFIED"
    ).length,
    flagged: demoDisplayedFdrs.filter((fdr) =>
      ["FLAGGED", "AMOUNT MISMATCH"].includes(
        String(fdr.verification).toUpperCase()
      )
    ).length,
    failed: demoDisplayedFdrs.filter(
      (fdr) => String(fdr.verification).toUpperCase() === "FAILED"
    ).length,
    total_deposit_amount: demoDisplayedFdrs.reduce(
      (total, fdr) => total + Number(amountValue(fdr.amount)),
      0
    ),
    institutions: new Set(
      demoDisplayedFdrs.map((fdr) =>
        String(fdr.institution || "").trim().toLocaleLowerCase("en-IN")
      )
    ).size,
    recent_submissions: demoDisplayedFdrs.filter((fdr) =>
      submittedWithinLastWeek(fdr.submitted)
    ).length
  };
  const hasLiveDatabaseFdrs =
    (officerStats?.total_fdrs ?? realFdrs.length) > 0;
  const displayedStats = hasLiveDatabaseFdrs
    ? officerStats || fallbackRealStats
    : demoFallbackStats;
  const statsSourceCaption = hasLiveDatabaseFdrs
    ? "Live SQLite data"
    : "Demo fallback (no live FDR records)";
  const dashboardStats = stats.map((item) => ({
    ...item,
    value:
      item.key === "total_deposit_amount"
        ? formatAmount(displayedStats[item.key])
        : String(displayedStats[item.key] ?? 0),
    caption:
      item.key === "total_fdrs"
        ? `${displayedStats.recent_submissions ?? 0} submitted in the last 7 days · ${statsSourceCaption}`
        : statsSourceCaption
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
  const selectedBankVerification =
    selectedFdr?.verification?.bank_verification || null;

  return (
    <div className="officer-layout">
      <style>{`
        * {
          box-sizing: border-box;
        }

        .officer-layout {
          min-height: 100vh;
          display: flex;
          background: #f3f6fa;
          color: #10233f;
          font-family: Arial, Helvetica, sans-serif;
        }

        .officer-sidebar {
          width: 220px;
          min-height: 100vh;
          background: #06264d;
          color: white;
          position: fixed;
          left: 0;
          top: 0;
          bottom: 0;
          overflow-y: auto;
        }

        .officer-brand {
          height: 82px;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          background: #ffffff;
          color: #09284e;
        }

        .brand-logo {
          width: 45px;
          height: 45px;
          border-radius: 50%;
          background: #f4c542;
          color: #08294e;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 12px;
          border: 3px solid #e4b12c;
        }

        .brand-text {
          font-size: 13px;
          font-weight: 700;
          line-height: 1.25;
        }

        .brand-subtitle {
          display: block;
          margin-top: 4px;
          font-weight: 400;
          color: #53657d;
        }

        .officer-nav {
          padding: 18px 0;
        }

        .nav-link {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 13px 20px;
          color: #dbe8f7;
          text-decoration: none;
          font-size: 14px;
          border-left: 3px solid transparent;
        }

        .nav-link:hover,
        .nav-link.active {
          background: #0d4b91;
          color: white;
          border-left-color: #4ba3ff;
        }

        .nav-icon {
          width: 20px;
          text-align: center;
          font-size: 17px;
        }

        .nav-count {
          margin-left: auto;
          min-width: 22px;
          height: 22px;
          padding: 0 6px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: white;
          font-size: 11px;
          font-weight: 700;
        }

        .officer-main {
          margin-left: 220px;
          width: calc(100% - 220px);
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
          font-size: 19px;
          font-weight: 700;
        }

        .header-subtitle {
          color: #60738e;
          font-size: 12px;
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
          border: 1px solid #d6dee9;
          border-radius: 7px;
          display: flex;
          align-items: center;
          padding: 0 13px;
          color: #8190a5;
          background: #fbfcfe;
        }

        .search-box input {
          border: 0;
          outline: 0;
          width: 100%;
          margin-left: 8px;
          background: transparent;
          font-size: 13px;
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
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #e11d48;
          color: white;
          font-size: 10px;
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
          padding: 0 13px;
          border: 1px solid #cbd7e5;
          border-radius: 6px;
          background: #fff;
          color: #ad2533;
          font-size: 12px;
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
          font-size: 13px;
          font-weight: 700;
        }

        .profile-role {
          color: #66788f;
          font-size: 11px;
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
          color: #526b87;
          font-size: 13px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 10px;
          margin-top: 13px;
        }

        .officer-stat-card {
          min-height: 112px;
          border-radius: 9px;
          padding: 15px;
          display: flex;
          gap: 11px;
          border: 1px solid #e0e7ef;
          background: white;
        }

        .officer-stat-card.blue {
          background: #edf6ff;
        }

        .officer-stat-card.green {
          background: #ebfbf2;
        }

        .officer-stat-card.yellow {
          background: #fff9e8;
        }

        .officer-stat-card.red {
          background: #fff0f1;
        }

        .officer-stat-card.purple {
          background: #f4f0ff;
        }

        .stat-icon {
          width: 38px;
          height: 38px;
          border-radius: 9px;
          background: rgba(255,255,255,.75);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 19px;
        }

        .stat-title {
          font-size: 11px;
          color: #536981;
          margin-bottom: 6px;
        }

        .stat-value {
          font-size: 23px;
          font-weight: 800;
          color: #102d4f;
        }

        .stat-change {
          color: #149447;
          font-size: 10px;
          margin-top: 7px;
          font-weight: 700;
        }

        .stat-change span {
          color: #73859a;
          font-weight: 400;
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
          font-size: 10px;
          color: #60738e;
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
          gap: 7px;
          font-size: 11px;
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
          font-size: 10px;
          color: #455b75;
        }

        .bar {
          width: 80%;
          max-width: 45px;
          background: #6da9e8;
          border-radius: 4px 4px 0 0;
        }

        .bar-label {
          font-size: 9px;
          color: #65778c;
          white-space: nowrap;
        }

        .full-card {
          margin-top: 13px;
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
          min-width: 125px;
          height: 32px;
          padding: 0 8px;
          border: 1px solid #d6dee9;
          border-radius: 5px;
          background: white;
          color: #304d70;
          font-size: 11px;
        }

        .officer-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .officer-table th {
          text-align: left;
          background: #f8fafc;
          color: #596d84;
          font-size: 9px;
          font-weight: 700;
          padding: 11px 9px;
          border-bottom: 1px solid #e4e9ef;
          white-space: nowrap;
        }

        .officer-table td {
          padding: 10px 9px;
          border-bottom: 1px solid #edf0f4;
          white-space: nowrap;
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
          padding: 4px 8px;
          border-radius: 12px;
          font-size: 9px;
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
          border: 1px solid #ccd8e5;
          background: white;
          color: #075ea8;
          border-radius: 5px;
          padding: 5px 9px;
          font-size: 10px;
          font-weight: 700;
          cursor: pointer;
        }

        .action-button:hover {
          background: #edf6ff;
        }

        .new-indicator {
          display: inline-block;
          margin-left: 6px;
          padding: 3px 5px;
          border-radius: 4px;
          background: #e0f2fe;
          color: #0369a1;
          font-size: 8px;
          font-weight: 800;
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
          padding: 20px;
          background: rgba(7, 25, 48, 0.58);
        }

        .fdr-modal {
          width: min(760px, 100%);
          max-height: min(90vh, 850px);
          overflow-y: auto;
          padding: 22px;
          border-radius: 10px;
          background: white;
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.25);
        }

        .fdr-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 18px;
        }

        .fdr-modal-title {
          margin: 0;
          font-size: 19px;
        }

        .fdr-modal-close {
          border: 0;
          background: transparent;
          color: #536981;
          font-size: 24px;
          cursor: pointer;
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
          color: #718196;
          font-size: 10px;
        }

        .fdr-detail-value {
          margin-top: 3px;
          overflow-wrap: anywhere;
          font-size: 12px;
          font-weight: 700;
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
          gap: 5px 12px;
          align-items: center;
          padding: 9px 0;
          border-bottom: 1px solid #edf0f4;
          font-size: 11px;
        }

        .verification-check small {
          grid-column: 1 / -1;
          color: #718196;
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
          font-size: 12px;
          font-weight: 700;
        }

        .timeline-event-date {
          margin-top: 3px;
          color: #718196;
          font-size: 10px;
        }

        .timeline-event-details {
          margin: 4px 0 10px;
          color: #52667d;
          font-size: 11px;
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
          gap: 4px 12px;
          padding: 8px 0;
          border-bottom: 1px solid #edf0f4;
          font-size: 11px;
        }

        .compliance-factor small {
          grid-column: 1 / -1;
          color: #718196;
        }

        .comparison-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }

        .comparison-table th,
        .comparison-table td {
          padding: 8px;
          border-bottom: 1px solid #edf0f4;
          text-align: left;
        }

        .comparison-table th {
          background: #f8fafc;
          color: #596d84;
          font-size: 9px;
        }

        .review-reason-input {
          width: 100%;
          min-height: 70px;
          margin: 8px 0;
          padding: 9px;
          border: 1px solid #ccd8e5;
          border-radius: 5px;
          font: inherit;
          font-size: 12px;
          resize: vertical;
        }

        @media (max-width: 560px) {
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
          padding: 0 15px;
        }

        .task-item {
          display: flex;
          align-items: center;
          gap: 10px;
          min-height: 61px;
          border-bottom: 1px solid #edf0f4;
        }

        .task-item:last-child {
          border-bottom: 0;
        }

        .task-icon {
          width: 35px;
          height: 35px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #edf5ff;
          color: #0870c1;
          font-weight: 800;
        }

        .task-info {
          flex: 1;
        }

        .task-title {
          font-size: 11px;
          font-weight: 700;
        }

        .task-text {
          font-size: 10px;
          color: #6a7b90;
          margin-top: 3px;
        }

        .task-time {
          font-size: 9px;
          color: #8b98a9;
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
          font-size: 10px;
          font-weight: 800;
        }

        .quick-description {
          font-size: 9px;
          color: #718196;
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
          font-size: 11px;
          font-weight: 700;
        }

        .download {
          color: #0767b8;
          font-size: 16px;
        }

        @media (max-width: 1250px) {
          .stats-grid {
            grid-template-columns: repeat(3, 1fr);
          }

          .search-box {
            width: 250px;
          }
        }

        @media (max-width: 950px) {
          .officer-sidebar {
            width: 75px;
          }

          .officer-main {
            margin-left: 75px;
            width: calc(100% - 75px);
          }

          .brand-text,
          .nav-link span:not(.nav-icon),
          .nav-count {
            display: none;
          }

          .officer-brand {
            justify-content: center;
          }

          .nav-link {
            justify-content: center;
            padding: 14px;
          }

          .dashboard-grid,
          .lower-grid {
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
          }

          .officer-content {
            padding: 12px;
          }
        }
      `}</style>

      <aside className="officer-sidebar">
        <div className="officer-brand">
          <div className="brand-logo">AICTE</div>

          <div className="brand-text">
            All India Council for Technical Education
            <span className="brand-subtitle">
              Security Deposit / FDR Portal
            </span>
          </div>
        </div>

        <nav className="officer-nav">
          <Link className="nav-link active" to="/officer">
            <span className="nav-icon">⌂</span>
            <span>Dashboard</span>
          </Link>

          <Link className="nav-link" to="/officer/institutions">
            <span className="nav-icon">▦</span>
            <span>Institutions</span>
          </Link>

          <Link className="nav-link" to="/officer/fdrs">
            <span className="nav-icon">▤</span>
            <span>FDRs</span>
          </Link>

          <Link className="nav-link" to="/officer/renewals">
            <span className="nav-icon">↻</span>
            <span>Renewals</span>
          </Link>

          <Link className="nav-link" to="/officer/verification">
            <span className="nav-icon">✓</span>
            <span>Verification Queue</span>
            <span className="nav-count">{pendingFdrs.length}</span>
          </Link>

          <Link className="nav-link" to="/officer/release-requests">
            <span className="nav-icon">↑</span>
            <span>Release Requests</span>
            {releaseRequestCount > 0 && (
              <span className="nav-count">{releaseRequestCount}</span>
            )}
          </Link>

          <Link className="nav-link" to="/officer/reports">
            <span className="nav-icon">▥</span>
            <span>Reports & Analytics</span>
          </Link>

          <Link className="nav-link" to="/officer/audit-log">
            <span className="nav-icon">◴</span>
            <span>Audit Log</span>
          </Link>

          <Link className="nav-link" to="/officer/users">
            <span className="nav-icon">♙</span>
            <span>Manage Users</span>
          </Link>

          <Link className="nav-link" to="/officer/master-data">
            <span className="nav-icon">▤</span>
            <span>Master Data</span>
          </Link>

          <Link className="nav-link" to="/officer/settings">
            <span className="nav-icon">⚙</span>
            <span>Settings</span>
          </Link>

          <Link className="nav-link" to="/officer/help">
            <span className="nav-icon">?</span>
            <span>Help & Support</span>
          </Link>
        </nav>
      </aside>

      <main className="officer-main">
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
          <div className="welcome-panel">
            <div>
              <div className="welcome-small">
                Welcome back,
              </div>

              <div className="welcome-name">
                {officerName}
              </div>

              <div className="welcome-description">
                "Ensuring transparent and compliant technical education"
              </div>
            </div>
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

          <section
            className="officer-card full-card"
            aria-label="Automated verification summary"
            style={{ marginTop: 13, padding: "14px 18px" }}
          >
            <strong>AUTOMATED VERIFICATION</strong>
            <span style={{ marginLeft: 8 }}>
              {liveStats.verified +
                liveStats.flagged +
                liveStats.failed}{" "}
              automated result(s) recorded from {liveStats.total_fdrs} real
              FDR submission(s)
            </span>
            <span style={{ marginLeft: 12, color: "#087b43" }}>
              {liveStats.verified} verified
            </span>
            <span style={{ marginLeft: 12, color: "#a46a00" }}>
              {liveStats.flagged} flagged
            </span>
            <span style={{ marginLeft: 12, color: "#c52c3b" }}>
              {liveStats.failed} failed
            </span>
            <div className="fdr-detail-label" style={{ marginTop: 6 }}>
              This verification breakdown shows database records only. Demo
              rows remain visible in the submissions list but are not counted.
            </div>
          </section>

          <div className="dashboard-grid">
            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  FDR Status Distribution
                </div>
              </div>

              <div className="chart-section">
                <div
                  className="donut"
                  style={{
                    background: buildDonutGradient()
                  }}
                >
                  <div className="donut-inner">
                    <div className="donut-number">
                      {statusDistributionTotal.toLocaleString("en-IN")}
                    </div>

                    <div className="donut-label">
                      Total FDRs
                    </div>
                  </div>
                </div>

                <div className="legend">
                  {statusDistributionCategories.map(
                    ({ key, label, color, count, percentage }) => (
                      <div className="legend-row" key={key}>
                        <span
                          className="legend-dot"
                          style={{ background: color }}
                        />
                        {label}
                        <span className="legend-value">
                          {count.toLocaleString("en-IN")} ({percentage})
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>
            </section>

            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  Sample FDRs Expiring in Next 6 Months
                </div>

                <Link to="/officer/fdrs?expiry=NORMAL" className="view-all">
                  View All
                </Link>
              </div>

              <div className="bar-chart">
                {[
                  ["Nov 2026", 12, 55],
                  ["Dec 2026", 28, 105],
                  ["Jan 2027", 34, 125],
                  ["Feb 2027", 26, 95],
                  ["Mar 2027", 18, 72],
                  ["Apr 2027", 9, 42],
                ].map(([month, value, height]) => (
                  <div className="bar-column" key={month}>
                    <div className="bar-value">
                      {value}
                    </div>

                    <div
                      className="bar"
                      style={{ height: `${height}px` }}
                    />

                    <div className="bar-label">
                      {month}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="officer-card full-card">
            <div className="card-header">
              <div className="card-title">
                Recent FDR Submissions
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
                    <th>FDR NUMBER</th>
                    <th>INSTITUTION NAME</th>
                    <th>BANK</th>
                    <th>AMOUNT</th>
                    <th>APPLICATION TYPE</th>
                    <th>MATURITY DATE</th>
                    <th>MATURITY STATUS</th>
                    <th>STATUS</th>
                    <th>VERIFICATION</th>
                    <th>SCORE</th>
                    <th>SUBMITTED ON</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {visibleFdrs.map((fdr) => (
                    <tr key={fdr.id}>
                      <td className="fdr-number">
                        {fdr.number}
                        {fdr.isNew && (
                          <span className="new-indicator">NEW</span>
                        )}
                      </td>

                      <td>{fdr.institution}</td>
                      <td>{fdr.bank}</td>
                      <td>{fdr.amount}</td>
                      <td>{fdr.applicationType}</td>
                      <td>{fdr.maturity}</td>
                      <td>{fdr.maturityStatus || "—"}</td>

                      <td>
                        <StatusBadge
                          type={
                            fdr.status === "Active"
                              ? "active"
                              : fdr.status === "Expiring Soon"
                              ? "expiring"
                              : "matured"
                          }
                        >
                          {fdr.status}
                        </StatusBadge>
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

                      <td>
                        {Number.isFinite(fdr.verificationScore)
                          ? `${fdr.verificationScore} / 100`
                          : "—"}
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
                      <td colSpan="12" style={{ textAlign: "center" }}>
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
                    {pendingFdrs.map((item) => (
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
                          <StatusBadge
                            type={
                              item.priority === "High"
                                ? "high"
                                : "medium"
                            }
                          >
                            {item.priority}
                          </StatusBadge>
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

          <div className="dashboard-grid">
            <section className="officer-card">
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
                {officerNotifications.slice(0, 5).map((notification) => (
                  <Link
                    className="task-item"
                    key={`real-${notification.id}`}
                    to="/officer/notifications"
                  >
                    <div className="task-icon">!</div>
                    <div className="task-info">
                      <div className="task-title">{notification.message}</div>
                      <div className="task-text">{notification.type}</div>
                    </div>
                    <div className="task-time">{formatDateTime(notification.created_at)}</div>
                  </Link>
                ))}
                {notifications.map((notification, index) => (
                  <Link
                    className="task-item"
                    key={index}
                    to={
                      notification.title.toLowerCase().includes("release")
                        ? "/officer/release-requests"
                        : notification.title.toLowerCase().includes("expir")
                          ? "/officer/fdrs?expiry=EXPIRING%20SOON"
                          : "/officer/verification"
                    }
                  >
                    <div className="task-icon">
                      {notification.icon}
                    </div>

                    <div className="task-info">
                      <div className="task-title">
                        {notification.title}
                      </div>

                      <div className="task-text">
                        {notification.text}
                      </div>
                    </div>

                    <div className="task-time">
                      {notification.time}
                    </div>
                  </Link>
                ))}
              </div>
            </section>

            <div className="right-column">
              <section className="officer-card">
                <div className="card-header">
                  <div className="card-title">
                    Quick Actions
                  </div>
                </div>

                <div className="quick-actions">
                  <Link
                    to="/officer/verification"
                    className="quick-action"
                  >
                    <div className="quick-icon">
                      ✓
                    </div>

                    <div className="quick-title">
                      Verify FDR
                    </div>

                    <div className="quick-description">
                      Check bank details
                    </div>
                  </Link>

                  <Link
                    to="/officer/release-requests"
                    className="quick-action"
                  >
                    <div className="quick-icon">
                      ↻
                    </div>

                    <div className="quick-title">
                      Process Release
                    </div>

                    <div className="quick-description">
                      Review requests
                    </div>
                  </Link>

                  <Link
                    to="/officer/institutions"
                    className="quick-action"
                  >
                    <div className="quick-icon">
                      ↑
                    </div>

                    <div className="quick-title">
                      Search Institution
                    </div>

                    <div className="quick-description">
                      View institution details
                    </div>
                  </Link>

                  <Link
                    to="/officer/reports"
                    className="quick-action"
                  >
                    <div className="quick-icon">
                      ▥
                    </div>

                    <div className="quick-title">
                      Generate Reports
                    </div>

                    <div className="quick-description">
                      Compliance & analytics
                    </div>
                  </Link>
                </div>
              </section>

              <section className="officer-card">
                <div className="card-header">
                  <div className="card-title">
                    Reports & Insights
                  </div>

                  <Link
                    to="/officer/reports"
                    className="view-all"
                  >
                    View All
                  </Link>
                </div>

                <div className="reports-list">
                  {[
                    "FDR Compliance Report (PDF)",
                    "Expiring FDRs (Excel)",
                    "Institution-wise Summary",
                    "Bank-wise Analysis",
                  ].map((report) => (
                    <div
                      className="report-row"
                      key={report}
                    >
                      <div className="report-icon">
                        ▣
                      </div>

                      <div className="report-name">
                        {report}
                      </div>

                      <Link
                        className="download"
                        to="/officer/reports"
                        aria-label={`Open ${report}`}
                      >
                        ↗
                      </Link>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </main>

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
              <h2 className="fdr-modal-title" id="fdr-modal-title">
                FDR Details — {selectedFdr.fdr_number}
              </h2>
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

            <section className="fdr-details-section">
              <h3 className="fdr-details-heading">FDR Information</h3>
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

            <section className="fdr-details-section">
              <h3 className="fdr-details-heading">Automated Verification</h3>
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
              {verificationActionError && (
                <p className="fdr-fetch-message document-error" role="alert">
                  {verificationActionError}
                </p>
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
              {!selectedFdr.isDemo &&
                ["FLAGGED", "FAILED", "PENDING"].includes(
                selectedFdr.verification_status?.toUpperCase()
              ) && (
                <div className="fdr-details-section">
                  <h4 className="fdr-details-heading">Officer Decision</h4>
                  <label className="fdr-detail-label" htmlFor="officer-review-reason">
                    Required reason (recorded in the audit log)
                  </label>
                  <textarea
                    id="officer-review-reason"
                    className="review-reason-input"
                    value={reviewReasonInput}
                    onChange={(event) => setReviewReasonInput(event.target.value)}
                    disabled={savingReviewAction}
                  />
                  {reviewActionError && (
                    <p className="fdr-fetch-message document-error" role="alert">
                      {reviewActionError}
                    </p>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="action-button"
                      type="button"
                      disabled={
                        savingReviewAction ||
                        runningVerification ||
                        selectedFdr.verification?.checks?.some(
                          (item) => item.status !== "PASS"
                        ) ||
                        selectedFdr.verification?.bank_verification?.status !==
                          "VERIFIED"
                      }
                      onClick={() => handleOfficerDecision("APPROVE")}
                    >
                      {savingReviewAction ? "Saving…" : "Approve override"}
                    </button>
                    <button
                      className="action-button"
                      type="button"
                      disabled={savingReviewAction}
                      onClick={() => handleOfficerDecision("REJECT")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              )}
            </section>

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
          </section>
        </div>
      )}
    </div>
  );
}