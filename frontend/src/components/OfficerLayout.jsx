import { Link, useLocation } from "react-router-dom";
import "./OfficerLayout.css";

const navigationItems = [
  ["Dashboard", "/officer", "⌂"],
  ["Institutions", "/officer/institutions", "▦"],
  ["FDRs", "/officer/fdrs", "▤"],
  ["Renewals", "/officer/renewals", "↻"],
  ["Verification Queue", "/officer/verification", "✓"],
  ["Release Requests", "/officer/release-requests", "↑"],
  ["Reports & Analytics", "/officer/reports", "▥"],
  ["Audit Log", "/officer/audit-log", "◴"],
  ["Settings", "/officer/settings", "⚙"]
];

function OfficerSidebar({ releaseCount = 0, notificationCount = 0 }) {
  const { pathname } = useLocation();

  return (
    <aside className="officer-sidebar">
      <div className="officer-brand">
        <div className="brand-logo">AICTE</div>
        <div className="brand-text">
          All India Council for Technical Education
          <span className="brand-subtitle">Security Deposit / FDR Portal</span>
        </div>
      </div>
      <nav className="officer-nav" aria-label="Officer navigation">
        {navigationItems.map(([label, href, icon]) => {
          const active = pathname === href;
          const count =
            href === "/officer/release-requests" ? releaseCount : href === "/officer/notifications" ? notificationCount : 0;

          return (
            <Link
              key={href}
              className={`nav-link${active ? " active" : ""}`}
              to={href}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{icon}</span>
              <span>{label}</span>
              {count > 0 && <span className="nav-count">{count}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export default function OfficerLayout({
  children,
  releaseCount = 0,
  notificationCount = 0
}) {
  return (
    <div className="officer-layout">
      <OfficerSidebar releaseCount={releaseCount} notificationCount={notificationCount} />
      <main className="officer-main">{children}</main>
    </div>
  );
}
