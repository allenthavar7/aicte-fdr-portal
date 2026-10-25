import { useNavigate } from "react-router-dom";

function Documents() {
  const navigate = useNavigate();

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
              VJTI Engineering College
            </strong>

            <span>
              AICTE-MH-001
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

        <header className="topbar">

          <div>

            <h1>
              Documents
            </h1>

            <p>
              Manage documents uploaded with your FDR submissions
            </p>

          </div>


          <div className="user-info">

            <div className="user-avatar">
              V
            </div>

            <div>

              <strong>
                VJTI Engineering College
              </strong>

              <span>
                Institution
              </span>

            </div>

          </div>

        </header>


        <section className="dashboard-content">

          <div className="welcome-section">

            <div>

              <h2>
                FDR Documents
              </h2>

              <p>
                View the documents associated with your submitted FDRs.
              </p>

            </div>


            <button
              className="primary-button"
              onClick={() => navigate("/submit-fdr")}
            >
              + Submit New FDR
            </button>

          </div>


          <section className="panel">

            <div className="panel-header">

              <div>

                <h3>
                  Uploaded Documents
                </h3>

                <p>
                  Documents associated with your FDR records
                </p>

              </div>

            </div>


            <div
              style={{
                padding: "50px",
                textAlign: "center"
              }}
            >

              <div
                style={{
                  fontSize: "42px",
                  marginBottom: "15px"
                }}
              >
                ▧
              </div>


              <h3>
                Document management
              </h3>


              <p
                style={{
                  color: "#64748b",
                  maxWidth: "550px",
                  margin: "10px auto 20px"
                }}
              >
                Your uploaded FDR documents are stored against
                their respective FDR records. We will connect this
                page to the document API next.
              </p>


              <button
                className="primary-button"
                onClick={() => navigate("/fdrs")}
              >
                View My FDRs
              </button>

            </div>

          </section>

        </section>

      </main>

    </div>
  );
}

export default Documents;
