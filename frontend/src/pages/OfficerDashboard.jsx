import React from "react";
import { Link } from "react-router-dom";

const stats = [
  {
    title: "Total Institutions",
    value: "1,248",
    change: "4%",
    color: "blue",
    icon: "▣",
  },
  {
    title: "Active FDRs",
    value: "1,120",
    change: "6%",
    color: "green",
    icon: "₹",
  },
  {
    title: "Expiring Soon",
    value: "62",
    change: "2%",
    color: "yellow",
    icon: "◷",
  },
  {
    title: "Pending Verification",
    value: "43",
    change: "18%",
    color: "red",
    icon: "!",
  },
  {
    title: "Renewal Pending",
    value: "27",
    change: "5%",
    color: "purple",
    icon: "↻",
  },
  {
    title: "Release Requests",
    value: "8",
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
          ↑ {item.change}
          <span> vs last month</span>
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

export default function OfficerDashboard() {
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

          <Link className="nav-link" to="/officer/verification">
            <span className="nav-icon">✓</span>
            <span>Verification Queue</span>
            <span className="nav-count">43</span>
          </Link>

          <Link className="nav-link" to="/officer/release-requests">
            <span className="nav-icon">↑</span>
            <span>Release Requests</span>
            <span className="nav-count">8</span>
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
              />
            </div>

            <div className="notification-bell">
              🔔
              <span className="notification-count">
                7
              </span>
            </div>

            <div className="officer-profile">
              <div className="profile-avatar">
                R
              </div>

              <div>
                <div className="profile-name">
                  Rohit Sharma
                </div>

                <div className="profile-role">
                  AICTE Officer
                </div>
              </div>

              <span>⌄</span>
            </div>
          </div>
        </header>

        <section className="officer-content">
          <div className="welcome-panel">
            <div>
              <div className="welcome-small">
                Welcome back,
              </div>

              <div className="welcome-name">
                Rohit Sharma
              </div>

              <div className="welcome-description">
                "Ensuring transparent and compliant technical education"
              </div>
            </div>
          </div>

          <div className="stats-grid">
            {stats.map((item) => (
              <StatCard
                key={item.title}
                item={item}
              />
            ))}
          </div>

          <div className="dashboard-grid">
            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  FDR Status Distribution
                </div>
              </div>

              <div className="chart-section">
                <div className="donut">
                  <div className="donut-inner">
                    <div className="donut-number">
                      1,248
                    </div>

                    <div className="donut-label">
                      Total FDRs
                    </div>
                  </div>
                </div>

                <div className="legend">
                  <div className="legend-row">
                    <span
                      className="legend-dot"
                      style={{ background: "#29b97b" }}
                    />
                    Active
                    <span className="legend-value">
                      1,120 (71.8%)
                    </span>
                  </div>

                  <div className="legend-row">
                    <span
                      className="legend-dot"
                      style={{ background: "#f7c72d" }}
                    />
                    Expiring Soon
                    <span className="legend-value">
                      62 (5.0%)
                    </span>
                  </div>

                  <div className="legend-row">
                    <span
                      className="legend-dot"
                      style={{ background: "#ef5b63" }}
                    />
                    Matured
                    <span className="legend-value">
                      18 (1.4%)
                    </span>
                  </div>

                  <div className="legend-row">
                    <span
                      className="legend-dot"
                      style={{ background: "#4c9be8" }}
                    />
                    Pending Verification
                    <span className="legend-value">
                      43 (3.4%)
                    </span>
                  </div>

                  <div className="legend-row">
                    <span
                      className="legend-dot"
                      style={{ background: "#9b67db" }}
                    />
                    Renewal Pending
                    <span className="legend-value">
                      27 (2.2%)
                    </span>
                  </div>

                  <div className="legend-row">
                    <span
                      className="legend-dot"
                      style={{ background: "#f38a34" }}
                    />
                    Release Requested
                    <span className="legend-value">
                      8 (0.6%)
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  FDRs Expiring in Next 6 Months
                </div>

                <a href="#expiring" className="view-all">
                  View All
                </a>
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

              <a href="#fdrs" className="view-all">
                View All
              </a>
            </div>

            <div className="table-wrapper">
              <table className="officer-table">
                <thead>
                  <tr>
                    <th>FDR NUMBER</th>
                    <th>INSTITUTION NAME</th>
                    <th>BANK</th>
                    <th>AMOUNT</th>
                    <th>MATURITY DATE</th>
                    <th>STATUS</th>
                    <th>VERIFICATION</th>
                    <th>SUBMITTED ON</th>
                    <th>ACTION</th>
                  </tr>
                </thead>

                <tbody>
                  {recentFdrs.map((fdr) => (
                    <tr key={fdr.number}>
                      <td className="fdr-number">
                        {fdr.number}
                      </td>

                      <td>{fdr.institution}</td>
                      <td>{fdr.bank}</td>
                      <td>{fdr.amount}</td>
                      <td>{fdr.maturity}</td>

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
                              : fdr.verification === "Amount Mismatch"
                              ? "mismatch"
                              : "pending"
                          }
                        >
                          {fdr.verification}
                        </StatusBadge>
                      </td>

                      <td>{fdr.submitted}</td>

                      <td>
                        <button className="action-button">
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="lower-grid">
            <section className="officer-card">
              <div className="card-header">
                <div className="card-title">
                  Pending Verification Queue
                </div>

                <a
                  href="#verification"
                  className="view-all"
                >
                  View All
                </a>
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
                      <th>PRIORITY</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>

                  <tbody>
                    {verificationQueue.map((item) => (
                      <tr key={item.number}>
                        <td className="fdr-number">
                          {item.number}
                        </td>
                        <td>{item.institution}</td>
                        <td>{item.bank}</td>
                        <td>{item.amount}</td>
                        <td>{item.submitted}</td>
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
                          <button className="action-button">
                            Review
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

                <a
                  href="#release"
                  className="view-all"
                >
                  View All
                </a>
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
                          <button className="action-button">
                            View
                          </button>
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

                <a
                  href="#notifications"
                  className="view-all"
                >
                  View All
                </a>
              </div>

              <div className="task-list">
                {notifications.map((notification, index) => (
                  <div
                    className="task-item"
                    key={index}
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
                  </div>
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

                  <a
                    href="#reports"
                    className="view-all"
                  >
                    View All
                  </a>
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

                      <div className="download">
                        ↓
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}