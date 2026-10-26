import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  getInstitutionFdrDocument,
  getInstitutionFdrs
} from "../api/api";

function FDRs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [fdrs, setFdrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchText, setSearchText] = useState(
    () => searchParams.get("search") || ""
  );
  const [openingDocumentId, setOpeningDocumentId] = useState(null);
  const [documentError, setDocumentError] = useState("");

  const loadFdrs = useCallback(async () => {
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
  }, [navigate]);

  useEffect(() => {
    Promise.resolve().then(loadFdrs);
  }, [loadFdrs]);

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

  function getMaturityStatus(maturityDate) {
    const date = new Date(maturityDate);

    if (!maturityDate || Number.isNaN(date.getTime())) {
      return "Unknown";
    }

    const daysRemaining = Math.ceil(
      (date.getTime() - new Date().setHours(0, 0, 0, 0)) /
        (1000 * 60 * 60 * 24)
    );

    if (daysRemaining < 0) return "Expired";
    if (daysRemaining < 30) return "Critical";
    if (daysRemaining <= 90) return "Expiring Soon";
    return "Normal";
  }

  function logout() {
    localStorage.removeItem("token");
    navigate("/");
  }

  async function openDocument(fdr) {
    const documentWindow = window.open("", "_blank");

    if (!documentWindow) {
      setDocumentError("Allow pop-ups to open the FDR document.");
      return;
    }

    try {
      setOpeningDocumentId(fdr.document_id);
      setDocumentError("");
      const token = localStorage.getItem("token");

      if (!token) {
        documentWindow.close();
        navigate("/");
        return;
      }

      const blob = await getInstitutionFdrDocument(
        token,
        fdr.id,
        fdr.document_id
      );
      documentWindow.location.href = URL.createObjectURL(blob);
    } catch (err) {
      documentWindow.close();
      console.error("Failed to open FDR document:", err);
      setDocumentError(err.message || "Unable to open FDR document");
    } finally {
      setOpeningDocumentId(null);
    }
  }

  const visibleFdrs = fdrs.filter((fdr) => {
    const query = searchText.trim().toLocaleLowerCase("en-IN");

    return [fdr.fdr_number, fdr.bank_name, fdr.application_type].some(
      (value) => String(value || "").toLocaleLowerCase("en-IN").includes(query)
    );
  });

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

          {documentError && (
            <div role="alert" style={{ color: "#991b1b", marginBottom: "16px" }}>
              {documentError}
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
                    {visibleFdrs.length} of {fdrs.length} FDR
                    {fdrs.length !== 1 ? "s" : ""} shown
                  </p>

                </div>


                <div>
                  <input
                    type="search"
                    aria-label="Search your FDRs"
                    placeholder="Search FDR number, bank, application..."
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                  <button
                    className="text-button"
                    onClick={loadFdrs}
                  >
                    Refresh
                  </button>
                </div>

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
                        Maturity Status
                      </th>

                      <th>
                        Verification
                      </th>

                      <th>
                        Automated Result
                      </th>

                      <th>
                        Score
                      </th>

                      <th>
                        Status
                      </th>

                      <th>
                        Document
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {visibleFdrs.map((fdr) => (

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
                          {getMaturityStatus(fdr.maturity_date)}
                        </td>


                        <td>
                          <span
                            className={`badge ${
                              fdr.verification_status === "VERIFIED"
                                ? "badge-success"
                                : ["REJECTED", "FAILED"].includes(
                                    fdr.verification_status
                                  )
                                ? "badge-error"
                                : "badge-pending"
                            }`}
                          >
                            {fdr.verification_status}
                          </span>
                        </td>

                        <td>
                          <div>
                            {fdr.verification_result || fdr.verification_status}
                          </div>
                          {fdr.review_reason && (
                            <small style={{ color: "#8a4b08" }}>
                              {fdr.review_reason}
                            </small>
                          )}
                        </td>

                        <td>
                          {Number.isFinite(fdr.verification_score)
                            ? `${fdr.verification_score}%`
                            : "—"}
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

                        <td>
                          {fdr.document_id ? (
                            <button
                              className="text-button"
                              onClick={() => openDocument(fdr)}
                              disabled={openingDocumentId === fdr.document_id}
                            >
                              {openingDocumentId === fdr.document_id
                                ? "Opening..."
                                : "View"}
                            </button>
                          ) : (
                            "—"
                          )}
                        </td>

                      </tr>

                    ))}
                    {visibleFdrs.length === 0 && (
                      <tr>
                        <td colSpan="11" style={{ textAlign: "center" }}>
                          No FDRs match your search.
                        </td>
                      </tr>
                    )}

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
