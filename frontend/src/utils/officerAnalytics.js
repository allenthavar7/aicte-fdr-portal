import { getFdrPriority } from "./fdrPriority.js";

export const STATUS_COLORS = {
  Active: "#1d8b68",
  Submitted: "#5686bf",
  "Under Review": "#df9a28",
  "Discrepancy Found": "#c54852",
  "Approaching Maturity": "#805db5",
  Matured: "#64748b",
  "Release Requested": "#d47735"
};

function parseDate(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function formatAnalyticsAmount(value, compact = false) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "₹0";
  if (compact && amount >= 100000) {
    return `₹${new Intl.NumberFormat("en-IN", {
      maximumFractionDigits: 1
    }).format(amount / 100000)} L`;
  }
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);
}

export function getDaysRemaining(maturityDate, now = new Date()) {
  const maturity = parseDate(maturityDate);
  if (!maturity) return null;
  return Math.ceil(
    (startOfDay(maturity).getTime() - startOfDay(now).getTime()) /
      (24 * 60 * 60 * 1000)
  );
}

function getFdrDistributionStatus(fdr, now) {
  const status = String(fdr.status || "").toUpperCase();
  const verificationStatus = String(fdr.verification_status || "").toUpperCase();
  const hasDiscrepancy =
    ["FLAGGED", "FAILED", "REJECTED"].includes(verificationStatus) ||
    fdr.verification?.checks?.some((check) => check.status === "FAILED") ||
    fdr.verification?.comparisons?.some((item) => item.result === "MISMATCH");

  if (status === "RELEASE_REQUESTED") return "Release Requested";
  const daysRemaining = getDaysRemaining(fdr.maturity_date, now);
  if (["MATURED", "EXPIRED"].includes(status) || daysRemaining < 0) {
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

export function buildStatusDistribution(fdrs, now = new Date()) {
  const labels = Object.keys(STATUS_COLORS);
  const counts = new Map(labels.map((status) => [status, 0]));
  for (const fdr of fdrs) {
    const status = getFdrDistributionStatus(fdr, now);
    counts.set(status, (counts.get(status) || 0) + 1);
  }
  const total = fdrs.length;
  return labels.map((status) => ({
    status,
    count: counts.get(status),
    percentage: total ? (counts.get(status) / total) * 100 : 0,
    color: STATUS_COLORS[status]
  }));
}

export function buildExpiryForecast(fdrs, now = new Date()) {
  const firstMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Array.from({ length: 6 }, (_, index) => {
    const monthDate = new Date(
      firstMonth.getFullYear(),
      firstMonth.getMonth() + index,
      1
    );
    const nextMonth = new Date(
      monthDate.getFullYear(),
      monthDate.getMonth() + 1,
      1
    );
    const monthRecords = fdrs.filter((fdr) => {
      const maturityDate = parseDate(fdr.maturity_date);
      return maturityDate &&
        maturityDate >= monthDate &&
        maturityDate < nextMonth;
    });
    return {
      month: monthDate.toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric"
      }),
      shortMonth: monthDate.toLocaleDateString("en-IN", {
        month: "short"
      }),
      count: monthRecords.length,
      totalValue: monthRecords.reduce(
        (sum, fdr) => sum + Number(fdr.amount || 0),
        0
      ),
      institutions: [...new Set(
        monthRecords.map((fdr) => fdr.institution?.name).filter(Boolean)
      )]
    };
  });
}

export function buildPortfolioSummary(fdrs, now = new Date()) {
  const today = startOfDay(now);
  const totalValue = fdrs.reduce(
    (sum, fdr) => sum + Number(fdr.amount || 0),
    0
  );
  const overdue = fdrs.filter((fdr) => {
    const days = getDaysRemaining(fdr.maturity_date, now);
    return days !== null && days < 0;
  }).length;
  const expiringIn30Days = fdrs.filter((fdr) => {
    const days = getDaysRemaining(fdr.maturity_date, now);
    return days !== null && days >= 0 && days <= 30;
  }).length;
  const active = fdrs.filter((fdr) => {
    const maturity = parseDate(fdr.maturity_date);
    return String(fdr.status || "").toUpperCase() === "ACTIVE" &&
      (!maturity || startOfDay(maturity) >= today);
  }).length;
  return {
    totalFdrs: fdrs.length,
    totalValue,
    active,
    expiringIn30Days,
    overdue
  };
}

export function buildMaturityRisk(fdrs) {
  const counts = { Critical: 0, High: 0, Normal: 0 };
  for (const fdr of fdrs) {
    const priority = getFdrPriority(fdr);
    if (priority.level === "Critical") {
      counts.Critical += 1;
    } else if (priority.level === "High" || priority.level === "Medium") {
      counts.High += 1;
    } else {
      counts.Normal += 1;
    }
  }
  return [
    { level: "Critical", count: counts.Critical, color: "#b8323e" },
    { level: "High", count: counts.High, color: "#d68124" },
    { level: "Normal", count: counts.Normal, color: "#218260" }
  ];
}

export function buildBankDistribution(fdrs) {
  const banks = new Map();
  for (const fdr of fdrs) {
    const bank = fdr.bank_name || "Unspecified";
    const current = banks.get(bank) || { bank, count: 0, totalValue: 0 };
    current.count += 1;
    current.totalValue += Number(fdr.amount || 0);
    banks.set(bank, current);
  }
  return [...banks.values()].sort((left, right) =>
    right.count - left.count || left.bank.localeCompare(right.bank)
  );
}

export function getUpcomingFdrs(fdrs, now = new Date(), limit = 3) {
  return fdrs
    .map((fdr) => ({
      ...fdr,
      daysRemaining: getDaysRemaining(fdr.maturity_date, now)
    }))
    .filter((fdr) => fdr.daysRemaining !== null && fdr.daysRemaining >= 0)
    .sort((left, right) =>
      left.daysRemaining - right.daysRemaining ||
      String(left.fdr_number).localeCompare(String(right.fdr_number))
    )
    .slice(0, limit);
}
