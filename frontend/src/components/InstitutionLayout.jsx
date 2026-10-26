import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstitutionNotifications } from "../api/api";

const institutionName = () => {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}").name ||
      "Institution";
  } catch {
    return "Institution";
  }
};

export default function InstitutionLayout({
  active,
  children,
  notificationRefreshKey = 0
}) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);
  const name = institutionName();
  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return undefined;
    let mounted = true;
    getInstitutionNotifications(token)
      .then((result) => {
        if (mounted) setUnreadCount(result.unreadCount || 0);
      })
      .catch((error) => {
        console.error("Unable to load institution notification count:", error);
      });
    return () => {
      mounted = false;
    };
  }, [notificationRefreshKey]);

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/", { replace: true });
  }

  const navigation = [
    ["Dashboard", "/dashboard", "▣", "dashboard"],
    ["My FDRs", "/fdrs", "▤", "fdrs"],
    ["Submit FDR", "/submit-fdr", "＋", "submit"],
    ["Renewals", "/renewals", "↻", "renewals"],
    ["Notifications", "/notifications", "♢", "notifications"]
  ];

  return (
    <div className="dashboard-layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-circle">AICTE</div>
          <div><h2>AICTE</h2><span>FDR Portal</span></div>
        </div>
        <nav className="sidebar-nav">
          {navigation.map(([label, path, icon, key]) => (
            <button
              className={`nav-item${active === key ? " active" : ""}`}
              key={key}
              type="button"
              onClick={() => navigate(path)}
            >
              <span>{icon}</span>
              {label}
              {key === "notifications" && unreadCount > 0 && (
                <span className="institution-unread-count">{unreadCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="institution-mini">
            <strong>{name}</strong>
            {user.aicte_code && <span>{user.aicte_code}</span>}
          </div>
          <button className="logout-button" type="button" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>
      <main className="dashboard-main">
        <header className="topbar">
          <div>
            <h1>{active === "renewals" ? "Renewals" : "Notifications"}</h1>
            <p>Security Deposit &amp; Fixed Deposit Receipt Management</p>
          </div>
          <div className="user-info">
            <div className="user-avatar">{name.charAt(0).toUpperCase()}</div>
            <div><strong>{name}</strong><span>Institution</span></div>
          </div>
        </header>
        {children}
      </main>
      <style>{`
        .institution-unread-count{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:12px;background:#e5484d;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700}
        .institution-page-content{padding:28px 35px}
        .institution-summary-grid{display:grid;grid-template-columns:repeat(5,minmax(130px,1fr));gap:14px;margin-bottom:22px}
        .institution-summary-card{background:#fff;border:1px solid #eaecf0;border-radius:10px;padding:18px}
        .institution-summary-card span{display:block;color:#667085;font-size:12px;margin-bottom:8px}
        .institution-summary-card strong{font-size:22px;color:#172033}
        .institution-table-wrap{overflow:auto;background:#fff;border:1px solid #eaecf0;border-radius:10px}
        .institution-table{width:100%;border-collapse:collapse;min-width:800px}
        .institution-table th,.institution-table td{text-align:left;padding:12px 14px;border-bottom:1px solid #eaecf0;font-size:12px;vertical-align:top}
        .institution-table th{background:#f8fafc;color:#667085;font-size:10px;text-transform:uppercase;white-space:nowrap}
        .institution-table tr:last-child td{border-bottom:0}
        .institution-status{display:inline-block;border-radius:14px;padding:4px 9px;background:#f2f4f7;color:#344054;font-size:10px;font-weight:700}
        .institution-status.pending,.institution-status.action-required{background:#fff4e5;color:#b54708}
        .institution-status.approved{background:#e8f5ed;color:#067647}
        .institution-status.rejected{background:#fee4e2;color:#b42318}
        .institution-message{padding:14px 16px;border-radius:8px;margin-bottom:16px;background:#eff8ff;color:#175cd3}
        .institution-message.error{background:#fee2e2;color:#991b1b}
        .institution-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:16px}
        .institution-secondary-button{border:1px solid #d0d5dd;background:white;color:#123b73;padding:10px 14px;border-radius:7px;cursor:pointer;font-weight:600}
        .institution-modal-backdrop{position:fixed;inset:0;background:rgba(16,24,40,.48);z-index:50;display:flex;align-items:center;justify-content:center;padding:20px}
        .institution-modal{background:#fff;border-radius:12px;width:min(760px,100%);max-height:90vh;overflow:auto;padding:22px;box-shadow:0 20px 50px rgba(16,24,40,.25)}
        .institution-modal-header{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:18px}
        .institution-modal-header h2{margin:0;font-size:18px}
        .institution-modal-close{border:0;background:transparent;font-size:24px;cursor:pointer;color:#667085}
        .institution-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}
        .institution-detail-grid small{display:block;color:#667085;margin-bottom:4px}
        .institution-form{display:grid;gap:14px}
        .institution-form label{display:grid;gap:6px;color:#344054;font-size:13px}
        .institution-form input,.institution-form select,.institution-form textarea,.institution-filter{border:1px solid #d0d5dd;border-radius:6px;padding:10px;font:inherit}
        .institution-form textarea{min-height:90px;resize:vertical}
        .institution-notification{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px}
        .institution-notification.unread{border-left:4px solid #1674bb;background:#f5faff}
        .institution-notification button.message{border:0;background:none;text-align:left;padding:0;color:inherit;font:inherit;cursor:pointer}
        .institution-notification small{display:block;color:#667085;margin-top:7px}
        .institution-timeline{border-left:2px solid #d0d5dd;margin:10px 0 10px 8px;padding-left:18px}
        .institution-timeline-item{position:relative;margin:0 0 14px}
        .institution-timeline-item:before{content:"";position:absolute;left:-24px;top:4px;width:10px;height:10px;border-radius:50%;background:#1674bb}
        @media(max-width:1000px){.institution-page-content{padding:20px}.institution-summary-grid{grid-template-columns:repeat(3,minmax(120px,1fr))}}
        @media(max-width:700px){.institution-page-content{padding:14px}.institution-toolbar{align-items:stretch;flex-direction:column}.institution-summary-grid{grid-template-columns:repeat(2,minmax(120px,1fr))}.institution-detail-grid{grid-template-columns:1fr}.institution-modal-backdrop{padding:10px}}
      `}</style>
    </div>
  );
}
