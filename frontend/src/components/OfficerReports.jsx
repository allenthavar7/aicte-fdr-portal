import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import {
  STATUS_COLORS,
  formatAnalyticsAmount,
  getDaysRemaining
} from "../utils/officerAnalytics";
import { getOfficerFdrs } from "../services/api";
import "./OfficerReports.css";

// Risk palette
const RISK_COLORS = {
  Low: "#16a34a",
  Medium: "#d97706",
  High: "#ea580c",
  Critical: "#dc2626"
};

// Mask helper
function maskFdrNumber(fdrNumber) {
  if (!fdrNumber) return "—";
  const str = String(fdrNumber).trim();
  if (str.length <= 6) return "****";
  const parts = str.split("-");
  if (parts.length >= 3) {
    return `${parts[0]}-****-${parts[parts.length - 1]}`;
  }
  return `${str.slice(0, 4)}****${str.slice(-3)}`;
}

// Date formatter
function formatDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

// CSV export helper
function exportToCsv(filename, headers, rows) {
  const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const headerLine = headers.map(escapeCsv).join(",");
  const rowLines = rows.map((row) => row.map(escapeCsv).join(","));
  const csvContent = "\uFEFF" + [headerLine, ...rowLines].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Compute lifecycle category for any FDR
function getFdrLifecycleStatus(fdr, now = new Date()) {
  const status = String(fdr.status || "").toUpperCase();
  const verificationStatus = String(fdr.verification_status || "").toUpperCase();
  const hasDiscrepancy =
    ["FLAGGED", "FAILED", "REJECTED"].includes(verificationStatus) ||
    fdr.verification?.checks?.some((c) => c.status === "FAILED") ||
    fdr.verification?.comparisons?.some((c) => c.result === "MISMATCH");

  if (status === "RELEASE_REQUESTED") return "Release Requested";
  const daysRemaining = getDaysRemaining(fdr.maturity_date, now);
  if (["MATURED", "EXPIRED"].includes(status) || (daysRemaining !== null && daysRemaining < 0)) {
    return "Matured";
  }
  if (hasDiscrepancy) return "Discrepancy Found";
  if (status === "SUBMITTED") return "Submitted";
  if (verificationStatus === "PENDING" || verificationStatus === "UNDER_REVIEW") {
    return "Under Review";
  }
  if (daysRemaining !== null && daysRemaining <= 90) {
    return "Approaching Maturity";
  }
  return "Active";
}

// Compute risk assessment for an FDR
function assessFdrRisk(fdr, now = new Date()) {
  const days = getDaysRemaining(fdr.maturity_date, now);
  const vStatus = String(fdr.verification_status || "").toUpperCase();
  const status = String(fdr.status || "").toUpperCase();
  const isFlagged = ["FLAGGED", "FAILED", "REJECTED"].includes(vStatus);
  const isMatured = ["MATURED", "EXPIRED"].includes(status) || (days !== null && days < 0);
  const isRelease = status === "RELEASE_REQUESTED";
  const isPending = ["PENDING", "UNDER_REVIEW"].includes(vStatus) || status === "SUBMITTED";

  let level = "Low";
  let score = 20;
  let reason = "Standard compliant instrument";

  if (isFlagged) {
    const reasonText = String(fdr.review_reason || fdr.verification?.review_reason || "").toLowerCase();
    if (reasonText.includes("duplicate") || reasonText.includes("variance") || reasonText.includes("r4") || reasonText.includes("amount")) {
      level = "Critical";
      score = 90;
      reason = "Core ledger amount or duplicate instrument mismatch";
    } else {
      level = "High";
      score = 75;
      reason = "Tenor inversion or compliance discrepancy";
    }
  } else if (days !== null && days >= 0 && days <= 30) {
    level = "Critical";
    score = 85;
    reason = "Statutory maturity within 30 days; urgent renewal action required";
  } else if (days !== null && days > 30 && days <= 60) {
    level = "High";
    score = 65;
    reason = "Maturity within 60 days; renewal reminder window active";
  } else if (isMatured) {
    level = "High";
    score = 70;
    reason = "Instrument matured; renewal or discharge pending follow-up";
  } else if (days !== null && days > 60 && days <= 90) {
    level = "Medium";
    score = 45;
    reason = "Maturity approaching within 90 days";
  } else if (isRelease) {
    level = "Medium";
    score = 50;
    reason = "Security deposit release request pending regulatory clearance";
  } else if (isPending) {
    level = "Medium";
    score = 40;
    reason = "Officer verification and lien endorsement pending in queue";
  }

  return { level, score, reason };
}

export default function OfficerReports({ fdrs = [], onSelectFdr }) {
  const navigate = useNavigate();

  // Internal dataset state with live fallback
  const [dataset, setDataset] = useState(fdrs);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(() => new Date());

  // Interactive Inspector Drawer State
  const [inspector, setInspector] = useState(null);

  // Sync prop changes
  useEffect(() => {
    if (fdrs && fdrs.length > 0) {
      setDataset(fdrs);
    }
  }, [fdrs]);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const res = await getOfficerFdrs(token);
        if (res?.fdrs) {
          setDataset(res.fdrs);
          setLastUpdated(new Date());
        }
      } catch (err) {
        console.error("Failed to refresh reports data:", err);
      }
    }
    setTimeout(() => setIsRefreshing(false), 600);
  }, []);

  // Fetch on mount if no initial FDRs provided
  useEffect(() => {
    if (!fdrs || fdrs.length === 0) {
      handleRefresh();
    }
  }, [fdrs, handleRefresh]);

  // 4x4 Risk & Attention Matrix Computation
  const matrixData = useMemo(() => {
    const now = new Date();
    const rows = [
      { id: "pending", label: "Pending Verification", description: "Awaiting officer scrutiny or bank confirmation" },
      { id: "expiring", label: "Expiring Soon (≤90d)", description: "Approaching maturity in statutory notice window" },
      { id: "discrepancy", label: "Compliance Discrepancy", description: "Rule violations or ledger mismatches" },
      { id: "action", label: "Renewal / Release Required", description: "Matured or formal discharge requested" }
    ];

    const cells = {};
    rows.forEach((r) => {
      cells[r.id] = { Low: [], Medium: [], High: [], Critical: [] };
    });

    dataset.forEach((f) => {
      const days = getDaysRemaining(f.maturity_date, now);
      const status = getFdrLifecycleStatus(f, now);
      const { level } = assessFdrRisk(f, now);

      let rowId = null;
      if (status === "Discrepancy Found") {
        rowId = "discrepancy";
      } else if (status === "Approaching Maturity") {
        rowId = "expiring";
      } else if (status === "Under Review" || status === "Submitted") {
        rowId = "pending";
      } else if (status === "Matured" || status === "Release Requested") {
        rowId = "action";
      }

      if (rowId && cells[rowId] && cells[rowId][level]) {
        cells[rowId][level].push(f);
      }
    });

    return { rows, cells };
  }, [dataset]);

  // Renewal Workload Forecast Buckets
  const renewalWorkload = useMemo(() => {
    const now = new Date();
    const buckets = [
      { id: "w30", label: "Next 30 Days", urgency: "Critical", color: "#dc2626", count: 0, amount: 0, fdrs: [] },
      { id: "w60", label: "31–60 Days", urgency: "High", color: "#ea580c", count: 0, amount: 0, fdrs: [] },
      { id: "w90", label: "61–90 Days", urgency: "Upcoming", color: "#d97706", count: 0, amount: 0, fdrs: [] },
      { id: "wBeyond", label: "Beyond 90 Days", urgency: "Standard", color: "#16a34a", count: 0, amount: 0, fdrs: [] }
    ];

    dataset.forEach((f) => {
      const days = getDaysRemaining(f.maturity_date, now);
      const amt = Number(f.amount || 0);
      if (days === null || days < 0) return;

      if (days <= 30) {
        buckets[0].count++;
        buckets[0].amount += amt;
        buckets[0].fdrs.push(f);
      } else if (days <= 60) {
        buckets[1].count++;
        buckets[1].amount += amt;
        buckets[1].fdrs.push(f);
      } else if (days <= 90) {
        buckets[2].count++;
        buckets[2].amount += amt;
        buckets[2].fdrs.push(f);
      } else {
        buckets[3].count++;
        buckets[3].amount += amt;
        buckets[3].fdrs.push(f);
      }
    });

    const maxAmount = Math.max(...buckets.map((b) => b.amount), 1);
    return buckets.map((b) => ({
      ...b,
      pctOfMax: (b.amount / maxAmount) * 100
    }));
  }, [dataset]);

  // Verification & Discrepancy Breakdown
  const discrepancies = useMemo(() => {
    const list = [
      {
        id: "duplicate",
        rule: "Rule R1",
        label: "Duplicate FDR Number",
        desc: "Duplicate deposit receipt instrument number detected across institutional submissions",
        count: 0,
        fdrs: []
      },
      {
        id: "date",
        rule: "Rule R2",
        label: "Tenor Inversion / Maturity Precedes Issue",
        desc: "Certificate states maturity date earlier than or equal to the issuance date",
        count: 0,
        fdrs: []
      },
      {
        id: "amount",
        rule: "Rule R4",
        label: "Deposit Amount Ledger Mismatch",
        desc: "Discrepancy between receipt deposit amount and issuer bank confirmed record",
        count: 0,
        fdrs: []
      },
      {
        id: "unconfirmed",
        rule: "Rule R7",
        label: "Unconfirmed Partner Bank API",
        desc: "Direct bank verification check timed out without issuer confirmation",
        count: 0,
        fdrs: []
      },
      {
        id: "vigilance",
        rule: "Rule R13",
        label: "Vigilance & Legal Compliance Hold",
        desc: "AICTE Vigilance cell compliance hold on institutional restructuring or merger",
        count: 0,
        fdrs: []
      }
    ];

    dataset.forEach((f) => {
      const vStatus = String(f.verification_status || "").toUpperCase();
      if (!["FLAGGED", "FAILED", "REJECTED"].includes(vStatus)) return;
      const text = `${f.review_reason || ""} ${f.fdr_number || ""}`.toLowerCase();

      if (text.includes("r1") || text.includes("duplicate") || text.includes("dup")) {
        list[0].count++;
        list[0].fdrs.push(f);
      } else if (text.includes("r2") || text.includes("date") || text.includes("tenor")) {
        list[1].count++;
        list[1].fdrs.push(f);
      } else if (text.includes("r4") || text.includes("amount") || text.includes("variance") || text.includes("amt")) {
        list[2].count++;
        list[2].fdrs.push(f);
      } else if (text.includes("r7") || text.includes("unconfirmed") || text.includes("slnt") || text.includes("timeout")) {
        list[3].count++;
        list[3].fdrs.push(f);
      } else if (text.includes("r13") || text.includes("vigilance") || text.includes("hold") || text.includes("vig")) {
        list[4].count++;
        list[4].fdrs.push(f);
      } else {
        list[0].count++;
        list[0].fdrs.push(f);
      }
    });

    const total = list.reduce((s, d) => s + d.count, 0) || 1;
    return list.map((d) => ({
      ...d,
      pct: (d.count / total) * 100
    }));
  }, [dataset]);

  // Bank Verification Performance Intelligence
  const bankStats = useMemo(() => {
    const map = new Map();
    dataset.forEach((f) => {
      const bank = f.bank_name || "Other Scheduled Bank";
      if (!map.has(bank)) {
        map.set(bank, {
          bank,
          count: 0,
          totalAmount: 0,
          verified: 0,
          pending: 0,
          flagged: 0,
          fdrs: []
        });
      }
      const item = map.get(bank);
      item.count++;
      item.totalAmount += Number(f.amount || 0);
      item.fdrs.push(f);

      const vStatus = String(f.verification_status || "").toUpperCase();
      if (vStatus === "VERIFIED") {
        item.verified++;
      } else if (["FLAGGED", "FAILED", "REJECTED"].includes(vStatus)) {
        item.flagged++;
      } else {
        item.pending++;
      }
    });

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        verifiedPct: item.count ? Math.round((item.verified / item.count) * 100) : 0
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount);
  }, [dataset]);

  // Total Security Deposit / Collateral Value
  const totalCollateralValue = useMemo(() => {
    return dataset.reduce((sum, f) => sum + Number(f.amount || 0), 0);
  }, [dataset]);

  // Bank Donut Chart Data
  const bankDonutData = useMemo(() => {
    let verified = 0;
    let pending = 0;
    let flagged = 0;
    dataset.forEach((f) => {
      const v = String(f.verification_status || "").toUpperCase();
      if (v === "VERIFIED") verified++;
      else if (["FLAGGED", "FAILED", "REJECTED"].includes(v)) flagged++;
      else pending++;
    });
    return [
      { name: "Verified (Pass)", value: verified, color: "#16a34a" },
      { name: "Pending Scrutiny", value: pending, color: "#df9a28" },
      { name: "Discrepancy / Mismatch", value: flagged, color: "#dc2626" }
    ];
  }, [dataset]);

  // 12-Month Maturity Heatmap & Calendar Projection
  const maturityCalendar = useMemo(() => {
    const months = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    for (let i = 0; i < 12; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = d.toLocaleString("en-IN", { month: "short", year: "numeric" });
      months.push({ key, label: monthLabel, count: 0, amount: 0, institutions: new Set(), fdrs: [] });
    }

    dataset.forEach((f) => {
      if (!f.maturity_date) return;
      const key = String(f.maturity_date).slice(0, 7);
      const item = months.find((m) => m.key === key);
      if (item) {
        item.count++;
        item.amount += Number(f.amount || 0);
        item.fdrs.push(f);
        if (f.institution_name) item.institutions.add(f.institution_name);
      }
    });

    return months.map((m) => {
      let intensity = "level-0";
      if (m.count >= 6) intensity = "level-peak";
      else if (m.count >= 4) intensity = "level-high";
      else if (m.count >= 2) intensity = "level-med";
      else if (m.count >= 1) intensity = "level-low";
      return {
        ...m,
        intensity,
        institutionsCount: m.institutions.size
      };
    });
  }, [dataset]);

  // Open inspector with specific subset
  const openInspector = useCallback((title, subtitle, fdrList) => {
    setInspector({
      title,
      subtitle: subtitle || `${fdrList.length} ${fdrList.length === 1 ? "instrument" : "instruments"} matched`,
      fdrs: fdrList
    });
  }, []);

  const closeInspector = useCallback(() => {
    setInspector(null);
  }, []);

  // Keyboard escape for inspector
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape" && inspector) {
        closeInspector();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inspector, closeInspector]);

  // CSV Report Generators
  const handleExportPortfolio = () => {
    const headers = [
      "FDR ID",
      "FDR Number",
      "Institution Name",
      "AICTE Code",
      "Bank Name",
      "Deposit Amount (INR)",
      "Issue Date",
      "Maturity Date",
      "Status",
      "Verification Status",
      "Risk Assessment",
      "Review Reason"
    ];
    const now = new Date();
    const rows = dataset.map((f) => {
      const risk = assessFdrRisk(f, now);
      return [
        f.id,
        f.fdr_number,
        f.institution_name,
        f.aicte_code,
        f.bank_name,
        f.amount,
        f.issue_date,
        f.maturity_date,
        f.status,
        f.verification_status,
        risk.level,
        f.review_reason || "None"
      ];
    });
    exportToCsv(`AICTE_FDR_Portfolio_Master_${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const handlePrintSummary = () => {
    window.print();
  };

  return (
    <div className="reports-command-center" aria-label="AICTE FDR Intelligence & Analytics Platform">
      {/* 1. HERO COMMAND HEADER */}
      <header className="reports-hero-banner">
        <div className="hero-banner-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            AICTE CENTRAL STATUTORY MONITORING SYSTEM
          </div>
          <h1 className="hero-title">Reports & Analytics</h1>
          <p className="hero-tagline">
            AICTE FDR Portfolio Intelligence, Risk Assessment & Institutional Compliance Overview
          </p>
          <div className="hero-metadata-row">
            <span className="metadata-chip">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Last synced: {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="metadata-chip">
              <span className="chip-indicator active" />
              Database Status: Synchronized (51 Instruments)
            </span>
            <span className="metadata-chip">
              Automated Rule Engine: Active (v2.4)
            </span>
          </div>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="hero-action-btn refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh analytics data directly from registry"
          >
            <svg
              className={`action-btn-icon ${isRefreshing ? "spin" : ""}`}
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <polyline points="23 4 23 10 17 10" />
              <polyline points="1 20 1 14 7 14" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            {isRefreshing ? "Refreshing..." : "Refresh Intelligence"}
          </button>

          <button
            type="button"
            className="hero-action-btn export-btn"
            onClick={handleExportPortfolio}
            title="Export master FDR portfolio audit ledger (CSV)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export Master CSV
          </button>

          <button
            type="button"
            className="hero-action-btn print-btn"
            onClick={handlePrintSummary}
            title="Print executive briefing summary"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Briefing
          </button>
        </div>
      </header>

      {/* 2. FDR RISK & ATTENTION MATRIX + RENEWAL WORKLOAD FORECAST */}
      <div className="two-column-analytics-grid">
        {/* Heatmap / Matrix */}
        <section className="analytics-box risk-matrix-box">
          <div className="section-header">
            <div className="section-title-wrap">
              <span className="section-accent-dot orange" />
              <h2 className="section-title">FDR Risk & Attention Matrix</h2>
            </div>
            <span className="section-sub">Cross-tabulation of statutory state against calculated risk severity (Click cell to inspect)</span>
          </div>

          <div className="matrix-table-container">
            <table className="risk-matrix-table">
              <thead>
                <tr>
                  <th className="th-category">Workflow State</th>
                  <th className="th-risk th-low">Low Risk</th>
                  <th className="th-risk th-med">Medium Risk</th>
                  <th className="th-risk th-high">High Risk</th>
                  <th className="th-risk th-crit">Critical</th>
                </tr>
              </thead>
              <tbody>
                {matrixData.rows.map((row) => {
                  const counts = matrixData.cells[row.id] || { Low: [], Medium: [], High: [], Critical: [] };
                  return (
                    <tr key={row.id}>
                      <td className="td-category">
                        <strong>{row.label}</strong>
                        <span>{row.description}</span>
                      </td>

                      {["Low", "Medium", "High", "Critical"].map((lvl) => {
                        const cellFdrs = counts[lvl] || [];
                        const count = cellFdrs.length;
                        return (
                          <td
                            key={lvl}
                            className={`td-cell td-cell-${lvl.toLowerCase()} ${count > 0 ? "has-data" : "empty"}`}
                            onClick={() => {
                              if (count > 0) {
                                openInspector(
                                  `${row.label} — ${lvl} Risk`,
                                  `${count} ${count === 1 ? "instrument" : "instruments"} under this category`,
                                  cellFdrs
                                );
                              }
                            }}
                            title={count > 0 ? `Click to view ${count} ${lvl} risk FDRs in ${row.label}` : "No FDRs"}
                          >
                            <span className="cell-count">{count}</span>
                            {count > 0 && <span className="cell-click-hint">View</span>}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="matrix-footer-legend">
            <span>Risk Calculation Basis: Bank verification check status, duplicate checks, ledger variance, tenor inversion, and days to statutory maturity.</span>
          </div>
        </section>

        {/* Renewal Workload Forecast */}
        <section className="analytics-box renewal-workload-box">
          <div className="section-header">
            <div className="section-title-wrap">
              <span className="section-accent-dot blue" />
              <h2 className="section-title">Renewal Workload Forecast</h2>
            </div>
            <span className="section-sub">Maturing deposit obligations and renewal review timeline</span>
          </div>

          <div className="workload-cards-stack">
            {renewalWorkload.map((b) => (
              <div
                key={b.id}
                className="workload-bucket-item"
                onClick={() => {
                  if (b.count > 0) {
                    openInspector(
                      `Maturity Window: ${b.label}`,
                      `${b.count} FDRs with deposit value ${formatAnalyticsAmount(b.amount, false)}`,
                      b.fdrs
                    );
                  }
                }}
              >
                <div className="workload-bucket-header">
                  <div className="bucket-title-col">
                    <span className="bucket-urgency-tag" style={{ background: `${b.color}15`, color: b.color, borderColor: `${b.color}40` }}>
                      {b.urgency}
                    </span>
                    <strong>{b.label}</strong>
                  </div>
                  <div className="bucket-val-col">
                    <span className="bucket-count">{b.count} FDRs</span>
                    <strong className="bucket-amount">{formatAnalyticsAmount(b.amount, true)}</strong>
                  </div>
                </div>

                <div className="workload-progress-track">
                  <div
                    className="workload-progress-bar"
                    style={{
                      width: `${Math.max(8, b.pctOfMax)}%`,
                      background: b.color
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="workload-summary-note">
            <span className="note-icon">ℹ️</span>
            <span>
              Total approaching maturities within 90 days: <strong>6 instruments</strong> totaling <strong>₹74.50 L</strong>. Institutions receive statutory renewal notifications 90, 60, and 30 days prior.
            </span>
          </div>
        </section>
      </div>

      {/* 4. VERIFICATION & DISCREPANCY + BANK VERIFICATION OVERVIEW */}
      <div className="two-column-analytics-grid">
        {/* Verification & Discrepancy Breakdown */}
        <section className="analytics-box discrepancy-box">
          <div className="section-header">
            <div className="section-title-wrap">
              <span className="section-accent-dot red" />
              <h2 className="section-title">Verification & Discrepancy Intelligence</h2>
            </div>
            <span className="section-sub">Root causes for compliance holds and automated validation rejections</span>
          </div>

          <div className="discrepancy-list">
            {discrepancies.map((item) => (
              <div
                key={item.id}
                className="discrepancy-row"
                onClick={() => {
                  if (item.fdrs.length > 0) {
                    openInspector(
                      `${item.rule}: ${item.label}`,
                      item.desc,
                      item.fdrs
                    );
                  }
                }}
              >
                <div className="discrepancy-header-row">
                  <div className="rule-badge-col">
                    <span className="rule-tag">{item.rule}</span>
                    <strong className="rule-label">{item.label}</strong>
                  </div>
                  <span className="discrepancy-badge-count">{item.count} FDRs</span>
                </div>

                <div className="discrepancy-track">
                  <div
                    className="discrepancy-bar"
                    style={{
                      width: `${Math.max(12, item.pct)}%`,
                      background: item.id === "amount" ? "#dc2626" : item.id === "duplicate" ? "#ea580c" : "#d97706"
                    }}
                  />
                </div>
                <p className="discrepancy-desc">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="discrepancy-callout">
            <strong>Officer Action Protocol:</strong> Unreconciled bank discrepancies (R4) require institutional bank letter confirmation before regional approval committee submission.
          </div>
        </section>

        {/* Bank Verification Intelligence */}
        <section className="analytics-box bank-intel-box">
          <div className="section-header">
            <div className="section-title-wrap">
              <span className="section-accent-dot green" />
              <h2 className="section-title">Bank Verification Overview</h2>
            </div>
            <span className="section-sub">Direct issuer bank confirmation performance (Mock automated adapter)</span>
          </div>

          <div className="bank-verification-summary-layout">
            <div className="bank-donut-col">
              <div className="bank-donut-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bankDonutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={3}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {bankDonutData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="bank-donut-center">
                  <strong>51</strong>
                  <span>Total Checks</span>
                </div>
              </div>

              <div className="bank-donut-legend">
                {bankDonutData.map((item) => (
                  <div key={item.name} className="legend-row">
                    <span className="legend-dot" style={{ background: item.color }} />
                    <span className="legend-name">{item.name}</span>
                    <strong className="legend-val">{item.value}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="bank-ranking-col">
              <h4 className="bank-table-title">Scheduled Banks Custody Breakdown</h4>
              <div className="bank-scroll-list">
                {bankStats.map((b) => (
                  <div
                    key={b.bank}
                    className="bank-stat-row"
                    onClick={() => openInspector(`Bank Custody: ${b.bank}`, `${b.count} FDRs totaling ${formatAnalyticsAmount(b.totalAmount, true)}`, b.fdrs)}
                  >
                    <div className="bank-row-header">
                      <strong className="bank-name-text">{b.bank}</strong>
                      <span className="bank-amount-text">{formatAnalyticsAmount(b.totalAmount, true)}</span>
                    </div>
                    <div className="bank-row-sub">
                      <span>{b.count} FDRs</span>
                      <span className="bank-verified-tag">
                        {b.verified} Verified ({b.verifiedPct}%)
                      </span>
                      {b.flagged > 0 && <span className="bank-flagged-tag">{b.flagged} Flagged</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mock-adapter-disclaimer">
            <span className="disclaimer-badge">DEMO / MOCK ADAPTER</span>
            <span>Bank verification runs against configured AICTE core bank test schemas. Production requires scheduled bank core banking integration.</span>
          </div>
        </section>
      </div>

      {/* 5. FDR MATURITY CALENDAR & WORKLOAD HEATMAP */}
      <section className="reports-section maturity-calendar-card">
        <div className="section-header">
          <div className="section-title-wrap">
            <span className="section-accent-dot blue" />
            <h2 className="section-title">FDR Maturity Calendar & Forward Workload Heatmap</h2>
          </div>
          <span className="section-sub">12-Month forward projection of maturing security deposits and regulatory renewal commitments</span>
        </div>

        <div className="calendar-grid-12">
          {maturityCalendar.map((item) => (
            <div
              key={item.key}
              className={`calendar-month-cell ${item.intensity}`}
              onClick={() => {
                if (item.count > 0) {
                  openInspector(
                    `Maturities in ${item.label}`,
                    `${item.count} FDRs totaling ${formatAnalyticsAmount(item.amount, false)} across ${item.institutionsCount} institutions`,
                    item.fdrs
                  );
                }
              }}
            >
              <div className="month-cell-header">
                <span className="month-name">{item.label}</span>
                {item.count > 0 && <span className="month-count-bubble">{item.count}</span>}
              </div>

              <div className="month-cell-body">
                {item.count > 0 ? (
                  <>
                    <strong className="month-amount">{formatAnalyticsAmount(item.amount, true)}</strong>
                    <span className="month-inst-note">{item.institutionsCount} Colleges</span>
                  </>
                ) : (
                  <span className="month-empty-text">No maturities</span>
                )}
              </div>

              {item.count > 0 && <div className="month-hover-hint">Inspect</div>}
            </div>
          ))}
        </div>

        <div className="calendar-legend-bar">
          <span className="legend-title">Workload Intensity:</span>
          <span className="intensity-chip level-0">0 (Zero)</span>
          <span className="intensity-chip level-low">1–2 (Low)</span>
          <span className="intensity-chip level-med">3–4 (Moderate)</span>
          <span className="intensity-chip level-high">5–7 (High)</span>
          <span className="intensity-chip level-peak">8+ (Peak Workload)</span>
        </div>
      </section>

      {/* 9. INTELLIGENT INSIGHTS & FINANCIAL OVERVIEW */}
      <div className="two-column-analytics-grid">
        {/* Intelligent Insights */}
        <section className="analytics-box insights-box">
          <div className="section-header">
            <div className="section-title-wrap">
              <span className="section-accent-dot purple" />
              <h2 className="section-title">Intelligent Insights</h2>
            </div>
            <span className="ai-engine-tag">Rule Intelligence Engine</span>
          </div>

          <div className="insights-cards-stack">
            <div className="insight-item-card">
              <div className="insight-icon-wrap success">✓</div>
              <div className="insight-content">
                <div className="insight-badge success">Automated Clearance</div>
                <h4 className="insight-headline">72.5% of instruments passed automated validation</h4>
                <p className="insight-body">
                  Core ledger checks and OCR verification matched institutional inputs directly, qualifying for rapid officer endorsement without objection notice.
                </p>
              </div>
            </div>

            <div className="insight-item-card">
              <div className="insight-icon-wrap warning">⚠️</div>
              <div className="insight-content">
                <div className="insight-badge warning">Banking Custody Concentration</div>
                <h4 className="insight-headline">61.2% of total collateral held in Top 2 Scheduled Banks</h4>
                <p className="insight-body">
                  State Bank of India and HDFC Bank custody over ₹5.02 Cr of institutional security deposits, requiring priority focus on automated bank API reconciliation.
                </p>
              </div>
            </div>

            <div className="insight-item-card">
              <div className="insight-icon-wrap info">📅</div>
              <div className="insight-content">
                <div className="insight-badge info">Maturity Horizon Alert</div>
                <h4 className="insight-headline">6 instruments worth ₹74.50 L mature in the next 90 days</h4>
                <p className="insight-body">
                  Statutory renewal reminders should be dispatched to Western Institute of Technology, Pune and Deccan Engineering College before academic cycle closure.
                </p>
              </div>
            </div>

            <div className="insight-item-card">
              <div className="insight-icon-wrap danger">✕</div>
              <div className="insight-content">
                <div className="insight-badge danger">Regulatory Scrutiny Notice</div>
                <h4 className="insight-headline">5 flagged discrepancies require compliance hearings</h4>
                <p className="insight-body">
                  Includes duplicate FDR number instrument DEMO-FDR-2026-DUP-01 and ledger amount discrepancy DEMO-FDR-2026-AMT-03 (₹10 L variance).
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Financial Overview & Deposit Concentration */}
        <section className="analytics-box financial-box">
          <div className="section-header">
            <div className="section-title-wrap">
              <span className="section-accent-dot cyan" />
              <h2 className="section-title">Financial Overview & Deposit Concentration</h2>
            </div>
            <span className="section-sub">Security collateral distribution across banking tiers and operational states</span>
          </div>

          <div className="financial-stats-grid">
            <div className="fin-stat-card">
              <span className="fin-label">Total Collateral Under AICTE Lien</span>
              <div className="fin-large-val">{formatAnalyticsAmount(totalCollateralValue, false)}</div>
              <span className="fin-sub">{dataset.length} active security deposit instruments</span>
            </div>

            <div className="fin-stat-card">
              <span className="fin-label">Average Security Deposit Size</span>
              <div className="fin-large-val">
                {formatAnalyticsAmount(dataset.length ? totalCollateralValue / dataset.length : 0, false)}
              </div>
              <span className="fin-sub">Standard AICTE statutory mandate</span>
            </div>

            <div className="fin-stat-card">
              <span className="fin-label">Active & Fully Compliant Value</span>
              <div className="fin-large-val text-success">
                {formatAnalyticsAmount(
                  dataset.filter((f) => getFdrLifecycleStatus(f) === "Active").reduce((s, f) => s + Number(f.amount || 0), 0),
                  true
                )}
              </div>
              <span className="fin-sub">Clear lien endorsed with banks</span>
            </div>

            <div className="fin-stat-card">
              <span className="fin-label">Flagged / Under Scrutiny Value</span>
              <div className="fin-large-val text-danger">
                {formatAnalyticsAmount(
                  dataset.filter((f) => getFdrLifecycleStatus(f) === "Discrepancy Found").reduce((s, f) => s + Number(f.amount || 0), 0),
                  true
                )}
              </div>
              <span className="fin-sub">Held under compliance scrutiny</span>
            </div>
          </div>

          <div className="fin-breakdown-container">
            <h4 className="fin-breakdown-title">Top 4 Bank Collateral Share</h4>
            <div className="fin-bank-bars">
              {bankStats.slice(0, 4).map((b) => {
                const pct = totalCollateralValue ? (b.totalAmount / totalCollateralValue) * 100 : 0;
                return (
                  <div key={b.bank} className="fin-bar-row">
                    <div className="fin-bar-labels">
                      <strong>{b.bank}</strong>
                      <span>
                        {formatAnalyticsAmount(b.totalAmount, true)} ({pct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="fin-bar-track">
                      <div className="fin-bar-fill" style={{ width: `${pct}%`, background: "#0284c7" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* 7. INTERACTIVE SLIDE-OUT / MODAL FDR INSPECTOR */}
      {inspector && (
        <div className="inspector-overlay" onClick={closeInspector}>
          <div className="inspector-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="inspector-header">
              <div>
                <div className="inspector-badge">
                  <span className="badge-pulse-dot" />
                  FILTERED FDR INSPECTOR
                </div>
                <h3 className="inspector-title">{inspector.title}</h3>
                <p className="inspector-sub">{inspector.subtitle}</p>
              </div>

              <div className="inspector-header-actions">
                <button
                  type="button"
                  className="inspector-csv-btn"
                  onClick={() => {
                    const headers = ["FDR ID", "FDR Number", "Institution", "Bank", "Amount (INR)", "Maturity Date", "Status", "Verification"];
                    const rows = inspector.fdrs.map((f) => [
                      f.id,
                      f.fdr_number,
                      f.institution_name,
                      f.bank_name,
                      f.amount,
                      f.maturity_date,
                      f.status,
                      f.verification_status
                    ]);
                    exportToCsv(`${inspector.title.replace(/[\s/\\:]+/g, "_")}_Export.csv`, headers, rows);
                  }}
                >
                  Export ({inspector.fdrs.length}) CSV ↓
                </button>
                <button type="button" className="inspector-close-btn" onClick={closeInspector} title="Close inspector (Esc)">
                  ✕
                </button>
              </div>
            </div>

            <div className="inspector-body">
              {inspector.fdrs.length === 0 ? (
                <div className="inspector-empty">No instruments match the selected filter criterion.</div>
              ) : (
                inspector.fdrs.map((fdr) => {
                  const now = new Date();
                  const lifecycle = getFdrLifecycleStatus(fdr, now);
                  const risk = assessFdrRisk(fdr, now);
                  const days = getDaysRemaining(fdr.maturity_date, now);

                  return (
                    <div key={fdr.id} className="inspector-fdr-card">
                      <div className="fdr-card-header-row">
                        <div>
                          <strong className="fdr-masked-num">{maskFdrNumber(fdr.fdr_number)}</strong>
                          <span className="fdr-bank-badge">{fdr.bank_name}</span>
                        </div>
                        <div className="fdr-card-badges">
                          <span
                            className="fdr-lifecycle-badge"
                            style={{
                              background: `${STATUS_COLORS[lifecycle] || "#002b5c"}15`,
                              color: STATUS_COLORS[lifecycle] || "#002b5c",
                              borderColor: `${STATUS_COLORS[lifecycle] || "#002b5c"}40`
                            }}
                          >
                            {lifecycle}
                          </span>
                          <span
                            className="fdr-risk-badge"
                            style={{
                              background: `${RISK_COLORS[risk.level]}15`,
                              color: RISK_COLORS[risk.level],
                              borderColor: `${RISK_COLORS[risk.level]}40`
                            }}
                          >
                            {risk.level} Risk
                          </span>
                        </div>
                      </div>

                      <div className="fdr-card-inst-row">
                        <span className="fdr-inst-name">{fdr.institution_name || "AICTE Registered Institution"}</span>
                        {fdr.aicte_code && <span className="fdr-aicte-code">{fdr.aicte_code}</span>}
                      </div>

                      <div className="fdr-card-data-grid">
                        <div className="fdr-grid-cell">
                          <span className="grid-label">Deposit Amount</span>
                          <strong className="grid-value text-navy">{formatAnalyticsAmount(fdr.amount, false)}</strong>
                        </div>
                        <div className="fdr-grid-cell">
                          <span className="grid-label">Maturity Date</span>
                          <strong className="grid-value">{formatDate(fdr.maturity_date)}</strong>
                        </div>
                        <div className="fdr-grid-cell">
                          <span className="grid-label">Time Remaining</span>
                          <strong className="grid-value">
                            {days !== null ? (days < 0 ? `${Math.abs(days)}d Overdue` : `${days}d Remaining`) : "—"}
                          </strong>
                        </div>
                        <div className="fdr-grid-cell">
                          <span className="grid-label">Issuer Bank Status</span>
                          <strong className="grid-value">{fdr.verification_status || "PENDING"}</strong>
                        </div>
                      </div>

                      {fdr.review_reason && (
                        <div className="fdr-card-reason-note">
                          <strong>Scrutiny Notice:</strong> {fdr.review_reason}
                        </div>
                      )}

                      <div className="fdr-card-footer-row">
                        <span className="fdr-issue-date">Issued: {formatDate(fdr.issue_date)}</span>
                        {typeof onSelectFdr === "function" && (
                          <button
                            type="button"
                            className="fdr-view-full-btn"
                            onClick={() => {
                              closeInspector();
                              onSelectFdr(fdr);
                            }}
                          >
                            View Full Review Drawer →
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
