import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import InstitutionLayout from "../components/InstitutionLayout";
import {
  getInstitutionNotifications,
  markAllInstitutionNotificationsRead,
  markInstitutionNotificationRead
} from "../api/api";

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
    () => notifications.filter((item) => {
      if (filter === "Unread" && item.is_read) return false;
      if (["FDR", "Verification", "Renewal", "System"].includes(filter)) {
        return notificationCategory(item) === filter;
      }
      return true;
    }),
    [filter, notifications]
  );

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
      <section className="dashboard-content institution-page-content">
        <div className="welcome-section">
          <div>
            <h2>Notifications</h2>
            <p>Updates about your FDR submissions, verification, renewals, and account.</p>
          </div>
          <button
            className="institution-secondary-button"
            type="button"
            disabled={unreadCount === 0 || busyId === "all"}
            onClick={markAllRead}
          >
            {busyId === "all" ? "Updating..." : "Mark All as Read"}
          </button>
        </div>

        {error && <div className="institution-message error" role="alert">{error}</div>}
        <div className="institution-toolbar">
          <div><strong>{unreadCount}</strong> unread notification(s)</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {filters.map((item) => (
              <button
                className={filter === item ? "primary-button" : "institution-secondary-button"}
                type="button"
                key={item}
                onClick={() => setFilter(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <section className="panel"><div className="institution-message" role="status">Loading notifications...</div></section>
        ) : visibleNotifications.length === 0 ? (
          <section className="panel"><div className="institution-empty">
            {filter === "All" ? "No notifications found." : `No ${filter.toLowerCase()} notifications found.`}
          </div></section>
        ) : (
          visibleNotifications.map((item) => (
            <article
              className={`panel institution-notification${item.is_read ? "" : " unread"}`}
              key={item.id}
            >
              <button className="message" type="button" onClick={() => openNotification(item)}>
                <strong>{item.message}</strong>
                <small>
                  {notificationCategory(item)} · {item.type.replaceAll("_", " ")} · {formatDateTime(item.created_at)}
                  {item.fdr_number ? ` · FDR ${item.fdr_number}` : ""}
                  {item.renewal_id ? ` · Renewal #${item.renewal_id}` : ""}
                  {item.is_read ? " · Read" : " · Unread"}
                </small>
              </button>
              {!item.is_read && (
                <button
                  className="text-button"
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => markRead(item.id)}
                >
                  {busyId === item.id ? "Updating..." : "Mark as Read"}
                </button>
              )}
            </article>
          ))
        )}
      </section>

      {selectedNotification && (
        <div className="institution-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedNotification(null);
        }}>
          <section className="institution-modal" role="dialog" aria-modal="true" aria-labelledby="notification-detail-title">
            <div className="institution-modal-header">
              <h2 id="notification-detail-title">Notification</h2>
              <button className="institution-modal-close" type="button" onClick={() => setSelectedNotification(null)} aria-label="Close">×</button>
            </div>
            <p>{selectedNotification.message}</p>
            <p className="institution-subtle">
              {selectedNotification.type.replaceAll("_", " ")} · {formatDateTime(selectedNotification.created_at)} · Read
            </p>
            {selectedNotification.fdr_number && <p>Related FDR: <strong>{selectedNotification.fdr_number}</strong></p>}
            {selectedNotification.renewal_id && <p>Related renewal: <strong>#{selectedNotification.renewal_id}</strong></p>}
            {(selectedNotification.fdr_id || selectedNotification.renewal_id) && (
              <button className="primary-button" type="button" onClick={() => openRelatedRecord(selectedNotification)}>
                Open Related Record
              </button>
            )}
          </section>
        </div>
      )}
      <style>{`
        .institution-empty{padding:42px;text-align:center;color:#667085}
        .institution-subtle{font-size:12px;color:#667085}
      `}</style>
    </InstitutionLayout>
  );
}
