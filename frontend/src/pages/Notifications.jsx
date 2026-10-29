import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstitutionLayout from "../components/InstitutionLayout";
import {
  getInstitutionNotifications,
  markAllInstitutionNotificationsRead,
  markInstitutionNotificationRead
} from "../api/api";
import "./InstitutionWorkspace.css";

function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
}

function notificationCategory(notification) {
  const value = String(notification.type || "").toUpperCase();
  if (notification.renewal_id) return "Renewal";
  if (value.startsWith("RENEWAL")) return "Renewal";
  if (value.includes("VERIF") || value.includes("MISMATCH") || value.includes("FLAG") || value.includes("FAILED")) return "Verification";
  if (value.includes("FDR") || value.includes("DOCUMENT") || value.includes("AMOUNT")) return "FDR";
  if (notification.fdr_id && value === "ACTION_REQUIRED") return "Verification";
  return "System";
}

function getDateGroup(dateString) {
  if (!dateString) return "Earlier";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "Earlier";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const itemDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today - itemDate) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return "Earlier";
}

function getNotifVisuals(item) {
  const cat = notificationCategory(item);
  const type = String(item.type || "").toUpperCase();

  if (
    type.includes("FAIL") ||
    type.includes("FLAG") ||
    type.includes("MISMATCH") ||
    type.includes("REJECT")
  ) {
    return {
      tone: "notif-red",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      ),
      tag: "Action Required"
    };
  }

  if (
    type.includes("APPROVED") ||
    type.includes("VERIFIED") ||
    type.includes("PASS")
  ) {
    return {
      tone: "notif-green",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ),
      tag: "Approved & Verified"
    };
  }

  if (
    cat === "Renewal" ||
    type.includes("REMINDER") ||
    type.includes("EXPIR")
  ) {
    return {
      tone: "notif-amber",
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      tag: "Maturity Warning"
    };
  }

  return {
    tone: "notif-blue",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
    ),
    tag: "Regulatory Notice"
  };
}

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadNotifications = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await getInstitutionNotifications(token);
      setNotifications(result.notifications || []);
      setUnreadCount(result.unreadCount || 0);
    } catch (loadError) {
      setError(loadError.message || "Unable to load notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    Promise.resolve().then(loadNotifications);
  }, [loadNotifications, refreshKey]);

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((item) => {
        if (filter === "Unread" && item.is_read) return false;
        if (["FDR", "Verification", "Renewal", "System"].includes(filter)) {
          return notificationCategory(item) === filter;
        }
        return true;
      }),
    [filter, notifications]
  );

  const groupedNotifications = useMemo(() => {
    const groups = { Today: [], Yesterday: [], Earlier: [] };
    visibleNotifications.forEach((item) => {
      const g = getDateGroup(item.created_at);
      if (groups[g]) groups[g].push(item);
      else groups.Earlier.push(item);
    });
    return groups;
  }, [visibleNotifications]);

  async function markRead(notificationId) {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return false;
    }
    const notification = notifications.find((item) => item.id === notificationId);
    if (!notification || notification.is_read) return true;
    setBusyId(notificationId);
    setError("");
    try {
      await markInstitutionNotificationRead(token, notificationId);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, is_read: 1 } : item
        )
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      setRefreshKey((value) => value + 1);
      return true;
    } catch (readError) {
      setError(readError.message || "Unable to mark notification as read.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/", { replace: true });
      return;
    }
    setBusyId("all");
    setError("");
    try {
      await markAllInstitutionNotificationsRead(token);
      setNotifications((current) =>
        current.map((item) => ({ ...item, is_read: 1 }))
      );
      setUnreadCount(0);
      setRefreshKey((value) => value + 1);
    } catch (readError) {
      setError(readError.message || "Unable to mark notifications as read.");
    } finally {
      setBusyId(null);
    }
  }

  async function openNotification(notification) {
    if (!(await markRead(notification.id))) return;
    setSelectedNotification({ ...notification, is_read: 1 });
  }

  function openRelatedRecord(notification) {
    if (notification.renewal_id) {
      navigate(`/renewals?renewal=${notification.renewal_id}`);
    } else if (notification.fdr_id || notification.fdr_number) {
      const query = new URLSearchParams();
      if (notification.fdr_number) query.set("search", notification.fdr_number);
      const search = query.toString();
      navigate(`/fdrs${search ? `?${search}` : ""}`);
    }
    setSelectedNotification(null);
  }

  const filters = ["All", "Unread", "FDR", "Verification", "Renewal", "System"];

  return (
    <InstitutionLayout
      active="notifications"
      notificationRefreshKey={refreshKey}
    >
      <section className="dashboard-content" style={{ padding: "28px" }}>
        {/* HERO BANNER */}
        <div className="ow-hero-header" style={{ marginBottom: "22px" }}>
          <div className="ow-hero-text">
            <span className="ow-hero-pill">
              <span className="ow-pill-dot" /> Operational Alerts & Feeds
            </span>
            <h1 style={{ fontSize: "22px", margin: "6px 0 4px 0", color: "#ffffff", fontWeight: 700 }}>
              Alerts & Notifications Centre
            </h1>
            <p style={{ margin: 0, color: "#bae6fd", fontSize: "13px" }}>
              Live statutory updates regarding your submitted security deposits, verification results, and approaching renewals.
            </p>
          </div>
          <div className="ow-hero-meta">
            <span className="ow-meta-stat">{unreadCount}</span>
            <span className="ow-meta-label">Unread Alerts</span>
          </div>
        </div>

        {/* ALERTS */}
        {error && (
          <div
            style={{
              padding: "14px 18px",
              marginBottom: "20px",
              background: "#fee2e2",
              color: "#991b1b",
              border: "1px solid #fecaca",
              borderRadius: "8px",
              fontSize: "13.5px"
            }}
          >
            ⚠ {error}
          </div>
        )}

        {/* TOOLBAR */}
        <div
          className="ow-filter-toolbar"
          style={{
            borderRadius: "10px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "12px"
          }}
        >
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
            {filters.map((item) => (
              <button
                key={item}
                type="button"
                className={filter === item ? "ow-action-primary-btn" : "ow-button"}
                onClick={() => setFilter(item)}
                style={{
                  padding: "6px 14px",
                  fontSize: "12.5px",
                  borderRadius: "20px"
                }}
              >
                {item}
                {item === "Unread" && unreadCount > 0 && (
                  <span
                    style={{
                      marginLeft: "6px",
                      background: filter === "Unread" ? "#ffffff" : "#0284c7",
                      color: filter === "Unread" ? "#0284c7" : "#ffffff",
                      padding: "1px 6px",
                      borderRadius: "10px",
                      fontSize: "10px",
                      fontWeight: 800
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button
              type="button"
              className="ow-button"
              disabled={unreadCount === 0 || busyId === "all"}
              onClick={markAllRead}
              style={{ padding: "6px 14px", fontSize: "12.5px" }}
            >
              {busyId === "all" ? "Updating..." : "✓ Mark All as Read"}
            </button>
            <button
              type="button"
              className="ow-button"
              onClick={() => setRefreshKey((k) => k + 1)}
              style={{ padding: "6px 12px", fontSize: "12.5px" }}
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS LIST */}
        {loading ? (
          <section className="ow-card" style={{ padding: "40px", textAlign: "center", color: "#64748b" }}>
            Loading notification feed...
          </section>
        ) : visibleNotifications.length === 0 ? (
          <section className="ow-card" style={{ padding: "50px", textAlign: "center" }}>
            <div
              style={{
                width: "48px",
                height: "48px",
                margin: "0 auto 12px",
                borderRadius: "50%",
                background: "#f0f7ff",
                color: "#0284c7",
                display: "flex",
                alignItems: "center",
                justifyContent: "center"
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h3 style={{ margin: "0 0 6px 0", color: "#002b5c" }}>No Notifications Found</h3>
            <p style={{ margin: 0, color: "#64748b", fontSize: "13.5px" }}>
              {filter === "All"
                ? "You are all caught up. No operational alerts on record."
                : `No notifications matching the "${filter}" filter.`}
            </p>
          </section>
        ) : (
          <div className="ow-stack">
            {["Today", "Yesterday", "Earlier"].map((groupName) => {
              const items = groupedNotifications[groupName];
              if (!items || items.length === 0) return null;

              return (
                <div key={groupName} className="inst-notif-group">
                  <div className="inst-notif-group-header">
                    <span>{groupName}</span>
                    <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>({items.length})</span>
                  </div>

                  {items.map((item) => {
                    const visuals = getNotifVisuals(item);

                    return (
                      <article
                        key={item.id}
                        className={`inst-notif-card ${item.is_read ? "" : "unread"}`}
                      >
                        <button
                          type="button"
                          className="inst-notif-left"
                          onClick={() => openNotification(item)}
                        >
                          <div className={`inst-notif-badge-icon ${visuals.tone}`}>
                            {visuals.icon}
                          </div>
                          <div className="inst-notif-content">
                            <div className="inst-notif-msg">{item.message}</div>
                            <div className="inst-notif-meta">
                              <span className="inst-notif-pill">{visuals.tag}</span>
                              <span>{formatDateTime(item.created_at)}</span>
                              {item.fdr_number && (
                                <strong style={{ color: "#002b5c" }}>· FDR: {item.fdr_number}</strong>
                              )}
                              {item.renewal_id && (
                                <strong style={{ color: "#0284c7" }}>· Renewal: #{item.renewal_id}</strong>
                              )}
                              {!item.is_read && (
                                <span style={{ color: "#0284c7", fontWeight: 800 }}>· New</span>
                              )}
                            </div>
                          </div>
                        </button>

                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                          {!item.is_read && (
                            <button
                              type="button"
                              className="ow-button"
                              disabled={busyId === item.id}
                              onClick={() => markRead(item.id)}
                              style={{ fontSize: "11px", padding: "4px 8px" }}
                            >
                              {busyId === item.id ? "..." : "Mark Read"}
                            </button>
                          )}
                          {(item.fdr_id || item.renewal_id) && (
                            <button
                              type="button"
                              className="ow-action-view-btn"
                              onClick={() => openRelatedRecord(item)}
                              style={{ fontSize: "11px", padding: "4px 8px" }}
                            >
                              Inspect →
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* NOTIFICATION DETAILS MODAL */}
      {selectedNotification && (
        <div
          className="inst-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedNotification(null);
          }}
        >
          <section className="inst-modal-box" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
            <div className="inst-modal-header">
              <h2 id="notification-detail-title">Notification Notice</h2>
              <button
                className="inst-modal-close-btn"
                type="button"
                onClick={() => setSelectedNotification(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <p style={{ fontSize: "15px", color: "#0f172a", lineHeight: 1.5, margin: "0 0 12px 0", fontWeight: 600 }}>
                {selectedNotification.message}
              </p>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  fontSize: "12px",
                  color: "#64748b",
                  background: "#f8fafc",
                  padding: "10px 14px",
                  borderRadius: "6px"
                }}
              >
                <span>Category: <strong>{notificationCategory(selectedNotification)}</strong></span>
                <span>Type: <strong>{selectedNotification.type.replaceAll("_", " ")}</strong></span>
                <span>Timestamp: <strong>{formatDateTime(selectedNotification.created_at)}</strong></span>
              </div>
            </div>

            {selectedNotification.fdr_number && (
              <div style={{ marginBottom: "10px", fontSize: "13px" }}>
                Associated Fixed Deposit Receipt: <strong>{selectedNotification.fdr_number}</strong>
              </div>
            )}

            {selectedNotification.renewal_id && (
              <div style={{ marginBottom: "16px", fontSize: "13px" }}>
                Associated Renewal Request: <strong>#{selectedNotification.renewal_id}</strong>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "20px" }}>
              <button
                type="button"
                className="ow-button"
                onClick={() => setSelectedNotification(null)}
              >
                Close
              </button>
              {(selectedNotification.fdr_id || selectedNotification.renewal_id) && (
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => openRelatedRecord(selectedNotification)}
                >
                  Open Related Record →
                </button>
              )}
            </div>
          </section>
        </div>
      )}
    </InstitutionLayout>
  );
}
