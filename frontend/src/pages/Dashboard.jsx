import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstitutionFdrs } from "../api/api";

function Dashboard() {
  const navigate = useNavigate();

  const [institution] = useState({
    name: "VJTI Engineering College",
    code: "AICTE-MH-001",
    city: "Mumbai",
    state: "Maharashtra"
  });

  const [fdrs, setFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadFdrs() {
      try {
        const token = localStorage.getItem("token");

        if (!token) {
          navigate("/");
          return;
        }

        const data = await getInstitutionFdrs(token);

        setFdrs(data.fdrs || []);
      } catch (err) {
        console.error("Failed to load FDRs:", err);
        setError(err.message || "Failed to load FDR data");
      } finally {
        setLoading(false);
      }
    }

    loadFdrs();
  }, [navigate]);

  function formatAmount(amount) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0
    }).format(amount || 0);
  }

  function formatDate(date) {
    if (!date) return "-";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
      return date;
    }

    return parsedDate.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric"
    });
  }

  function logout() {
    localStorage.removeItem("token");
    navigate("/");
  }

  const activeCount = fdrs.filter(
    (fdr) => fdr.status === "ACTIVE"
  ).length;

  const pendingCount = fdrs.filter(
    (fdr) => fdr.verification_status === "PENDING"
  ).length;

  const totalAmount = fdrs.reduce(
    (total, fdr) => total + Number(fdr.amount || 0),
    0
  );

  const today = new Date();

  const expiringCount = fdrs.filter((fdr) => {
    if (!fdr.maturity_date) return false;

    const maturityDate = new Date(fdr.maturity_date);

    if (Number.isNaN(maturityDate.getTime())) {
      return false;
    }

    const difference =
      maturityDate.getTime() - today.getTime();

    const days =
      difference / (1000 * 60 * 60 * 24);

    return days >= 0 && days <= 90;
  }).length;

  return (
    <div className="dashboard-layout">

      {/* SIDEBAR */}

      <aside className="sidebar">

        <div className="sidebar-brand">

          <div className="brand-circle">
            AICTE
          </div>

          <div>
            <h2>AICTE</h2>
            <span>FDR Portal</span>
          </div>

        </div>

        <nav className="sidebar-nav">

          <button className="nav-item active">
            <span>▣</span>
            Dashboard
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/fdrs")}
          >
            <span>▤</span>
            My FDRs
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/submit-fdr")}
          >
            <span>＋</span>
            Submit FDR
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/renewals")}
          >
            <span>↻</span>
            Renewals
          </button>

          <button
            className="nav-item"
            onClick={() => navigate("/notifications")}
          >
            <span>♢</span>
            Notifications
          </button>

        </nav>

        <div className="sidebar-bottom">

          <div className="institution-mini">

            <strong>
              {institution.name}
            </strong>

            <span>
              {institution.code}
            </span>

          </div>

          <button
            className="logout-button"
            onClick={logout}
          >
            Logout
          </button>

        </div>

      </aside>


      {/* MAIN CONTENT */}

      <main className="dashboard-main">

        {/* TOPBAR */}

        <header className="topbar">

          <div>

            <h1>
              Institution Dashboard
            </h1>

            <p>
              Security Deposit & Fixed Deposit Receipt Management
            </p>

          </div>

          <div className="user-info">

            <div className="user-avatar">
              V
            </div>

            <div>

              <strong>
                {institution.name}
              </strong>

              <span>
                Institution
              </span>

            </div>

          </div>

        </header>


        {/* CONTENT */}

        <section className="dashboard-content">

          {/* WELCOME */}

          <div className="welcome-section">

            <div>

              <h2>
                Welcome, {institution.name}
              </h2>

              <p>
                Here's an overview of your security deposits
                and FDR records.
              </p>

            </div>

            <button
              className="primary-button"
              onClick={() => navigate("/submit-fdr")}
            >
              + Submit New FDR
            </button>

          </div>


          {/* ERROR */}

          {error && (
            <div
              style={{
                padding: "15px",
                marginBottom: "20px",
                background: "#fee2e2",
                color: "#991b1b",
                borderRadius: "8px"
              }}
            >
              {error}
            </div>
          )}


          {/* STAT CARDS */}

          <div className="stats-grid">

            <div className="stat-card">

              <div className="stat-icon">
                F
              </div>

              <div>

                <span>
                  Active FDRs
                </span>

                <strong>
                  {loading ? "..." : activeCount}
                </strong>

              </div>

            </div>


            <div className="stat-card">

              <div className="stat-icon pending">
                !
              </div>

              <div>

                <span>
                  Pending Verification
                </span>

                <strong>
                  {loading ? "..." : pendingCount}
                </strong>

              </div>

            </div>


            <div className="stat-card">

              <div className="stat-icon warning">
                ⏱
              </div>

              <div>

                <span>
                  Expiring Soon
                </span>

                <strong>
                  {loading ? "..." : expiringCount}
                </strong>

              </div>

            </div>


            <div className="stat-card">

              <div className="stat-icon amount">
                ₹
              </div>

              <div>

                <span>
                  Total Deposit Amount
                </span>

                <strong>
                  {loading
                    ? "..."
                    : formatAmount(totalAmount)}
                </strong>

              </div>

            </div>

          </div>


          {/* FDR SECTION */}

          <section className="panel">

            <div className="panel-header">

              <div>

                <h3>
                  Recent FDRs
                </h3>

                <p>
                  Your latest submitted fixed deposit receipts
                </p>

              </div>

              <button
                className="text-button"
                onClick={() => navigate("/fdrs")}
              >
                View All
              </button>

            </div>


            <div className="table-container">

              {loading ? (

                <div
                  style={{
                    padding: "40px",
                    textAlign: "center"
                  }}
                >
                  Loading FDRs...
                </div>

              ) : fdrs.length === 0 ? (

                <div
                  style={{
                    padding: "40px",
                    textAlign: "center"
                  }}
                >
                  No FDRs have been submitted yet.
                </div>

              ) : (

                <table>

                  <thead>

                    <tr>

                      <th>
                        FDR Number
                      </th>

                      <th>
                        Bank
                      </th>

                      <th>
                        Amount
                      </th>

                      <th>
                        Maturity Date
                      </th>

                      <th>
                        Verification
                      </th>

                      <th>
                        Status
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {fdrs.slice(0, 5).map((fdr) => (

                      <tr key={fdr.id}>

                        <td>
                          <strong>
                            {fdr.fdr_number}
                          </strong>
                        </td>

                        <td>
                          {fdr.bank_name}
                        </td>

                        <td>
                          {formatAmount(fdr.amount)}
                        </td>

                        <td>
                          {formatDate(fdr.maturity_date)}
                        </td>

                        <td>

                          <span
                            className={`badge ${
                              fdr.verification_status ===
                              "VERIFIED"
                                ? "badge-success"
                                : "badge-pending"
                            }`}
                          >
                            {fdr.verification_status}
                          </span>

                        </td>

                        <td>

                          <span
                            className={`badge ${
                              fdr.status === "ACTIVE"
                                ? "badge-active"
                                : ""
                            }`}
                          >
                            {fdr.status}
                          </span>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              )}

            </div>

          </section>


          {/* QUICK ACTIONS */}

          <section className="quick-actions">

            <div className="quick-action">

              <div className="quick-icon">
                +
              </div>

              <div>

                <h3>
                  Submit New FDR
                </h3>

                <p>
                  Register a new security deposit or FDR
                </p>

              </div>

              <button
                onClick={() => navigate("/submit-fdr")}
              >
                →
              </button>

            </div>


            <div className="quick-action">

              <div className="quick-icon">
                ↻
              </div>

              <div>

                <h3>
                  Manage Renewals
                </h3>

                <p>
                  View FDRs requiring renewal
                </p>

              </div>

              <button
                onClick={() => navigate("/renewals")}
              >
                →
              </button>

            </div>

          </section>

        </section>

      </main>

    </div>
  );
}

export default Dashboard;