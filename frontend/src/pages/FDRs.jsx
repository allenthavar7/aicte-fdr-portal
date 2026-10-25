import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getInstitutionFdrs } from "../api/api";

function FDRs() {
  const navigate = useNavigate();

  const [fdrs, setFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    loadFdrs();
  }, []);

  async function loadFdrs() {
    try {
      setLoading(true);
      setError("");

      const token = localStorage.getItem("token");

      if (!token) {
        navigate("/");
        return;
      }

      const data = await getInstitutionFdrs(token);

      setFdrs(data.fdrs || []);
    } catch (err) {
      console.error("Failed to load FDRs:", err);
      setError(err.message || "Failed to load FDRs");
    } finally {
      setLoading(false);
    }
  }

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

          <button
            className="nav-item"
            onClick={() => navigate("/dashboard")}
          >
            <span>▣</span>
            Dashboard
          </button>


          <button className="nav-item active">
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
            <strong>VJTI Engineering College</strong>
            <span>AICTE-MH-001</span>
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

            <h1>My FDRs</h1>

            <p>
              View and manage your submitted Fixed Deposit Receipts
            </p>

          </div>


          <div className="user-info">

            <div className="user-avatar">
              V
            </div>

            <div>
              <strong>VJTI Engineering College</strong>
              <span>Institution</span>
            </div>

          </div>

        </header>


        {/* CONTENT */}

        <section className="dashboard-content">

          <div className="welcome-section">

            <div>

              <h2>
                Fixed Deposit Receipts
              </h2>

              <p>
                All FDRs submitted by your institution.
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
                background: "#fee2e2",
                color: "#991b1b",
                padding: "15px",
                borderRadius: "8px",
                marginBottom: "20px"
              }}
            >
              {error}
            </div>

          )}


          {/* LOADING */}

          {loading && (

            <section className="panel">

              <div
                style={{
                  padding: "40px",
                  textAlign: "center"
                }}
              >
                Loading FDRs...
              </div>

            </section>

          )}


          {/* EMPTY */}

          {!loading && !error && fdrs.length === 0 && (

            <section className="panel">

              <div
                style={{
                  padding: "50px",
                  textAlign: "center"
                }}
              >

                <h3>
                  No FDRs found
                </h3>

                <p>
                  You haven't submitted any FDRs yet.
                </p>

                <button
                  className="primary-button"
                  onClick={() => navigate("/submit-fdr")}
                  style={{
                    marginTop: "20px"
                  }}
                >
                  Submit Your First FDR
                </button>

              </div>

            </section>

          )}


          {/* FDR TABLE */}

          {!loading && fdrs.length > 0 && (

            <section className="panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Your FDR Records
                  </h3>

                  <p>
                    {fdrs.length} FDR
                    {fdrs.length !== 1 ? "s" : ""} found
                  </p>

                </div>


                <button
                  className="text-button"
                  onClick={loadFdrs}
                >
                  Refresh
                </button>

              </div>


              <div className="table-container">

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
                        Issue Date
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

                    {fdrs.map((fdr) => (

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
                          {formatDate(fdr.issue_date)}
                        </td>


                        <td>
                          {formatDate(fdr.maturity_date)}
                        </td>


                        <td>

                          <span
                            className={`badge ${
                              fdr.verification_status === "VERIFIED"
                                ? "badge-success"
                                : fdr.verification_status === "REJECTED"
                                ? "badge-error"
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
                                : "badge-pending"
                            }`}
                          >
                            {fdr.status}
                          </span>

                        </td>

                      </tr>

                    ))}

                  </tbody>

                </table>

              </div>

            </section>

          )}

        </section>

      </main>

    </div>
  );
}

export default FDRs;
