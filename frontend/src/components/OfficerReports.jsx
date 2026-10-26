import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  buildBankDistribution,
  buildExpiryForecast,
  buildMaturityRisk,
  buildPortfolioSummary,
  buildStatusDistribution,
  formatAnalyticsAmount,
  getUpcomingFdrs
} from "../utils/officerAnalytics";
import "./OfficerReports.css";

function StatusTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="oa-tooltip">
      <strong>{item.status}</strong>
      <span>FDRs: {item.count}</span>
      <span>Percentage: {item.percentage.toFixed(1)}%</span>
    </div>
  );
}

function ExpiryTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="oa-tooltip">
      <strong>{item.month}</strong>
      <span>{item.count} FDRs expiring</span>
      <span>Total value: {formatAnalyticsAmount(item.totalValue, true)}</span>
      {item.institutions.length > 0 && (
        <span>Institutions: {item.institutions.join(", ")}</span>
      )}
    </div>
  );
}

function BankTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const item = payload[0].payload;
  return (
    <div className="oa-tooltip">
      <strong>{item.bank}</strong>
      <span>FDRs: {item.count}</span>
      <span>Portfolio: {formatAnalyticsAmount(item.totalValue, true)}</span>
    </div>
  );
}

function maturityLabel(fdr) {
  const status = String(fdr.status || "").toUpperCase();
  if (status === "RELEASE_REQUESTED") return "Release requested";
  if (fdr.daysRemaining < 0) return "Overdue";
  if (fdr.daysRemaining <= 30) return "Critical";
  if (fdr.daysRemaining <= 90) return "Approaching maturity";
  return "Active";
}

function daysLabel(days) {
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Due today";
  return `${days} days`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export default function OfficerReports({ fdrs }) {
  const safeFdrs = Array.isArray(fdrs) ? fdrs : [];
  const portfolio = buildPortfolioSummary(safeFdrs);
  const statusData = buildStatusDistribution(safeFdrs);
  const expiryData = buildExpiryForecast(safeFdrs);
  const riskData = buildMaturityRisk(safeFdrs);
  const bankData = buildBankDistribution(safeFdrs);
  const upcomingFdrs = getUpcomingFdrs(safeFdrs);

  return (
    <div className="oa-workspace">
      <header className="oa-heading">
        <div>
          <p className="oa-eyebrow">OFFICER INTELLIGENCE</p>
          <p className="oa-page-subtitle">Portfolio intelligence and FDR lifecycle insights</p>
        </div>
        <span className="oa-demo-badge">Demo data included</span>
      </header>

      <p className="oa-data-note">
        Dashboard records marked <strong>DEMO</strong> are synthetic examples for
        demonstration only. Totals below are calculated from the FDR records
        available to this officer account.
      </p>

      <section className="oa-kpi-grid" aria-label="Portfolio overview">
        {[
          ["Total FDRs", portfolio.totalFdrs, "All listed records"],
          ["Portfolio value", formatAnalyticsAmount(portfolio.totalValue), "Combined deposit amount"],
          ["Active FDRs", portfolio.active, "Not matured"],
          ["Expiring in 30 days", portfolio.expiringIn30Days, "From today"],
          ["Overdue", portfolio.overdue, "Past maturity date"]
        ].map(([label, value, description]) => (
          <article className="oa-kpi" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{description}</small>
          </article>
        ))}
      </section>

      <div className="oa-primary-grid">
        <section className="oa-card">
          <header className="oa-section-heading">
            <div>
              <h3>FDR Status Distribution</h3>
              <p>One status category per FDR</p>
            </div>
            <span>{portfolio.totalFdrs} records</span>
          </header>
          <div className="oa-status-layout">
            <div className="oa-donut-chart" role="img" aria-label="Interactive FDR status distribution chart">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData.filter((item) => item.count > 0)}
                    dataKey="count"
                    nameKey="status"
                    innerRadius="62%"
                    outerRadius="92%"
                    paddingAngle={2}
                    stroke="#ffffff"
                    strokeWidth={2}
                  >
                    {statusData.filter((item) => item.count > 0).map((item) => (
                      <Cell key={item.status} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<StatusTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="oa-donut-center">
                <strong>{portfolio.totalFdrs}</strong>
                <span>Total FDRs</span>
              </div>
            </div>
            <ul className="oa-status-legend">
              {statusData.map((item) => (
                <li key={item.status}>
                  <span className="oa-legend-label">
                    <i style={{ backgroundColor: item.color }} />
                    {item.status}
                  </span>
                  <strong>{item.count}</strong>
                  <small>{portfolio.totalFdrs ? `${item.percentage.toFixed(0)}%` : "0%"}</small>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="oa-card">
          <header className="oa-section-heading">
            <div>
              <h3>FDR Expiry Forecast</h3>
              <p>FDRs scheduled to mature over the next six months</p>
            </div>
            <span>Next 6 months</span>
          </header>
          <div className="oa-expiry-chart" role="img" aria-label="Interactive six-month FDR maturity forecast chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expiryData} margin={{ top: 12, right: 12, left: -16, bottom: 2 }}>
                <CartesianGrid stroke="#e9eef4" vertical={false} />
                <XAxis
                  dataKey="shortMonth"
                  tick={{ fill: "#65778d", fontSize: 11 }}
                  axisLine={{ stroke: "#dbe3ec" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#65778d", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<ExpiryTooltip />} cursor={{ fill: "#eff5fb" }} />
                <Bar dataKey="count" name="FDRs Expiring" fill="#1c5d91" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="oa-chart-summary">
            {expiryData.reduce((sum, month) => sum + month.count, 0)} FDRs mature in this period ·
            {" "}{formatAnalyticsAmount(expiryData.reduce((sum, month) => sum + month.totalValue, 0), true)} total value
          </div>
        </section>
      </div>

      <div className="oa-secondary-grid">
        <section className="oa-card">
          <header className="oa-section-heading">
            <div>
              <h3>Maturity Risk</h3>
              <p>Uses the portal’s shared FDR priority score</p>
            </div>
          </header>
          <div className="oa-risk-list">
            {riskData.map((risk) => (
              <div className="oa-risk-row" key={risk.level}>
                <span><i style={{ backgroundColor: risk.color }} />{risk.level}</span>
                <strong>{risk.count}</strong>
              </div>
            ))}
          </div>
          <p className="oa-helper">
            Critical priority is critical risk; High and Medium are grouped as
            high risk; Low priority is normal. Select a record for its detailed
            priority reasons.
          </p>
        </section>

        <section className="oa-card">
          <header className="oa-section-heading">
            <div>
              <h3>Bank Distribution</h3>
              <p>FDR count and portfolio value by bank</p>
            </div>
          </header>
          <div className="oa-bank-chart" role="img" aria-label="Interactive FDR distribution by bank">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bankData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
              >
                <CartesianGrid stroke="#e9eef4" horizontal={false} />
                <XAxis type="number" allowDecimals={false} hide />
                <YAxis
                  type="category"
                  dataKey="bank"
                  width={138}
                  tick={{ fill: "#465d75", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<BankTooltip />} cursor={{ fill: "#eff5fb" }} />
                <Bar dataKey="count" name="FDRs" fill="#4b89bb" radius={[0, 4, 4, 0]} maxBarSize={20}>
                  {bankData.map((item, index) => (
                    <Cell key={item.bank} fill={index === 0 ? "#174f7d" : "#4b89bb"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="oa-bank-total">
            <span>Records by bank</span>
            <strong>{bankData.reduce((sum, bank) => sum + bank.count, 0)}</strong>
          </div>
        </section>
      </div>

      <section className="oa-card oa-expiry-register">
        <header className="oa-section-heading">
          <div>
            <h3>Upcoming Maturity Register</h3>
            <p>Nearest maturity dates first · showing up to three records</p>
          </div>
          <span>Sorted by maturity</span>
        </header>
        <div className="oa-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Institution</th>
                <th>FDR Number</th>
                <th>Bank</th>
                <th>Amount</th>
                <th>Maturity Date</th>
                <th>Days Remaining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {upcomingFdrs.length ? upcomingFdrs.map((fdr) => {
                const status = maturityLabel(fdr);
                return (
                  <tr key={fdr.id}>
                    <td>{fdr.institution?.name || "—"}</td>
                    <td>
                      {fdr.fdr_number}
                      {String(fdr.fdr_number).startsWith("DEMO-") && (
                        <small className="oa-row-demo">SYNTHETIC</small>
                      )}
                    </td>
                    <td>{fdr.bank_name || "—"}</td>
                    <td>{formatAnalyticsAmount(fdr.amount)}</td>
                    <td>{formatDate(fdr.maturity_date)}</td>
                    <td>{daysLabel(fdr.daysRemaining)}</td>
                    <td><span className={`oa-status-pill oa-status-${status.toLowerCase().replaceAll(" ", "-")}`}>{status}</span></td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="7" className="oa-empty">No upcoming maturity dates are available.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="oa-helper">
          Synthetic records use a DEMO prefix and fictional .invalid contact
          addresses; they do not represent real AICTE or bank records.
        </p>
      </section>
    </div>
  );
}
