
import { useState } from "react";
import { useNavigate } from "react-router-dom";

function SubmitFDR() {
  const navigate = useNavigate();

  const [purpose, setPurpose] = useState("");

  const [formData, setFormData] = useState({
    institutionName: "VJTI Engineering College",
    programmeName: "",
    programmeLevel: "",
    discipline: "",
    currentIntake: "",
    proposedIntake: "",
    academicYear: "",
    previousFdrNumber: "",
    applicationDescription: "",

    fdrNumber: "",
    bankName: "",
    amount: "",
    issueDate: "",
    maturityDate: ""
  });

  const [file, setFile] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function handleChange(event) {
    const { name, value } = event.target;

    setFormData((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  function handleFileChange(event) {
    const selectedFile = event.target.files[0];

    if (!selectedFile) {
      setFile(null);
      return;
    }

    const extension = selectedFile.name.split(".").pop()?.toLowerCase();
    if (
      !["pdf", "png", "jpg", "jpeg"].includes(extension) ||
      (selectedFile.type &&
        !["application/pdf", "image/png", "image/jpeg"].includes(
          selectedFile.type
        ))
    ) {
      setError("Please select a PDF, PNG, JPG or JPEG file.");
      event.target.value = "";
      setFile(null);
      return;
    }

    setError("");
    setFile(selectedFile);
  }

  function validatePurposeFields() {
    if (purpose === "NEW_PROGRAMME") {
      if (
        !formData.programmeName ||
        !formData.programmeLevel ||
        !formData.discipline ||
        !formData.proposedIntake ||
        !formData.academicYear
      ) {
        return "Please complete all programme details.";
      }
    }

    if (purpose === "INCREASE_INTAKE") {
      if (
        !formData.programmeName ||
        !formData.currentIntake ||
        !formData.proposedIntake ||
        !formData.academicYear
      ) {
        return "Please complete all intake details.";
      }

      if (
        Number(formData.proposedIntake) <=
        Number(formData.currentIntake)
      ) {
        return "Proposed intake must be greater than the current intake.";
      }
    }

    if (purpose === "RENEWAL") {
      if (!formData.previousFdrNumber) {
        return "Please enter the existing FDR number.";
      }
    }

    if (purpose === "REPLACEMENT") {
      if (!formData.previousFdrNumber) {
        return "Please enter the FDR number being replaced.";
      }
      if (!formData.applicationDescription.trim()) {
        return "Please describe why the FDR is being replaced.";
      }
    }

    if (purpose === "MODIFICATION") {
      if (!formData.academicYear) {
        return "Please enter the academic year.";
      }
      if (!formData.applicationDescription.trim()) {
        return "Please describe the requested modification.";
      }
    }

    if (purpose === "OTHER") {
      if (!formData.academicYear) {
        return "Please enter the academic year.";
      }
      if (!formData.applicationDescription.trim()) {
        return "Please describe the regulatory requirement.";
      }
    }

    return "";
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setSuccess("");

    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/");
      return;
    }

    if (!purpose) {
      setError("Please select what you are applying for.");
      return;
    }

    const purposeError = validatePurposeFields();

    if (purposeError) {
      setError(purposeError);
      return;
    }

    if (!file) {
      setError("Please upload the FDR document.");
      return;
    }

    if (
      !formData.fdrNumber ||
      !formData.bankName ||
      !formData.amount ||
      !formData.issueDate ||
      !formData.maturityDate
    ) {
      setError("Please complete all FDR details.");
      return;
    }

    if (Number(formData.amount) <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    if (
      new Date(formData.maturityDate) <=
      new Date(formData.issueDate)
    ) {
      setError("Maturity date must be after the issue date.");
      return;
    }

    try {
      setLoading(true);

      const data = new FormData();

      /*
       * Existing backend fields
       */
      data.append("fdrNumber", formData.fdrNumber);
      data.append("bankName", formData.bankName);
      data.append("amount", formData.amount);
      data.append("issueDate", formData.issueDate);
      data.append("maturityDate", formData.maturityDate);
      data.append("fdrDocument", file);

      /*
       * New application information.
       *
       * These fields can be handled by the backend when
       * we add the application table/API.
       */
      data.append("applicationType", purpose);
      data.append("institutionName", formData.institutionName);
      data.append("programmeName", formData.programmeName);
      data.append("programmeLevel", formData.programmeLevel);
      data.append("discipline", formData.discipline);
      data.append("currentIntake", formData.currentIntake);
      data.append("proposedIntake", formData.proposedIntake);
      data.append("academicYear", formData.academicYear);
      data.append("previousFdrNumber", formData.previousFdrNumber);
      data.append("applicationDescription", formData.applicationDescription);

      const response = await fetch(
        "http://localhost:5000/api/fdr",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: data
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.message || "Failed to submit FDR"
        );
      }

      const verification = result.verification;
      setSuccess(
        `FDR submitted. Automated result: ${verification?.status || result.fdr.verificationStatus} (${verification?.score ?? result.fdr.verificationScore}/100). OCR: ${verification?.ocr?.message || "result unavailable"} Bank: ${verification?.bank?.status || "PENDING"} — ${verification?.bank?.message || "Bank result unavailable."}`
      );

    } catch (err) {
      console.error("Submit FDR error:", err);

      setError(
        err.message || "Failed to submit FDR."
      );
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    navigate("/");
  }

  function getPurposeTitle() {
    const titles = {
      NEW_INSTITUTION: "New Institution",
      NEW_PROGRAMME: "New Programme Addition",
      INCREASE_INTAKE: "Increase in Approved Intake",
      RENEWAL: "Renewal / Continuation",
      REPLACEMENT: "Replacement / Re-submission",
      MODIFICATION: "Change / Modification",
      OTHER: "Other Regulatory Requirement"
    };

    return titles[purpose] || "Submit FDR";
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


          <button className="nav-item active">
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


      {/* MAIN */}

      <main className="dashboard-main">

        <header className="topbar">

          <div>

            <h1>
              Submit FDR
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
                VJTI Engineering College
              </strong>

              <span>
                Institution
              </span>

            </div>

          </div>

        </header>


        <section className="dashboard-content">

          {/* PAGE TITLE */}

          <div className="welcome-section">

            <div>

              <h2>
                {purpose
                  ? getPurposeTitle()
                  : "What are you applying for?"}
              </h2>

              <p>
                {purpose
                  ? "Complete the information below and submit the required FDR."
                  : "Select the purpose of this FDR submission to continue."}
              </p>

            </div>

          </div>


          {/* ERROR */}

          {error && (

            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "20px"
              }}
            >
              {error}
            </div>

          )}


          {/* SUCCESS */}

          {success && (

            <div
              style={{
                background: "#dcfce7",
                color: "#166534",
                padding: "14px",
                borderRadius: "8px",
                marginBottom: "20px"
              }}
            >
              {success}
            </div>

          )}


          {/* PURPOSE SELECTION */}

          {!purpose && (

            <section className="panel">

              <div className="panel-header">

                <div>

                  <h3>
                    Select Application Type
                  </h3>

                  <p>
                    Choose the reason for submitting this FDR.
                  </p>

                </div>

              </div>


              <div
                style={{
                  padding: "25px",
                  display: "grid",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "18px"
                }}
              >

                <button
                  type="button"
                  onClick={() => setPurpose("NEW_INSTITUTION")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    🏛
                  </span>

                  <strong style={titleStyle}>
                    New Institution
                  </strong>

                  <span style={descriptionStyle}>
                    Security deposit/FDR for establishing
                    a new institution.
                  </span>
                </button>


                <button
                  type="button"
                  onClick={() => setPurpose("NEW_PROGRAMME")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    🎓
                  </span>

                  <strong style={titleStyle}>
                    New Programme Addition
                  </strong>

                  <span style={descriptionStyle}>
                    Add a new academic programme to the
                    institution.
                  </span>
                </button>


                <button
                  type="button"
                  onClick={() => setPurpose("INCREASE_INTAKE")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    👥
                  </span>

                  <strong style={titleStyle}>
                    Increase in Approved Intake
                  </strong>

                  <span style={descriptionStyle}>
                    Increase the approved number of seats
                    for an existing programme.
                  </span>
                </button>


                <button
                  type="button"
                  onClick={() => setPurpose("RENEWAL")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    🔄
                  </span>

                  <strong style={titleStyle}>
                    Renewal / Continuation
                  </strong>

                  <span style={descriptionStyle}>
                    Submit a renewed FDR for an existing
                    security deposit.
                  </span>
                </button>


                <button
                  type="button"
                  onClick={() => setPurpose("REPLACEMENT")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    📄
                  </span>

                  <strong style={titleStyle}>
                    Replacement / Re-submission
                  </strong>

                  <span style={descriptionStyle}>
                    Replace or re-submit an existing FDR
                    when required.
                  </span>
                </button>


                <button
                  type="button"
                  onClick={() => setPurpose("MODIFICATION")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    ✏️
                  </span>

                  <strong style={titleStyle}>
                    Change / Modification
                  </strong>

                  <span style={descriptionStyle}>
                    Submit documentation for an institutional
                    or regulatory modification.
                  </span>
                </button>


                <button
                  type="button"
                  onClick={() => setPurpose("OTHER")}
                  style={cardStyle}
                >
                  <span style={iconStyle}>
                    •
                  </span>

                  <strong style={titleStyle}>
                    Other Regulatory Requirement
                  </strong>

                  <span style={descriptionStyle}>
                    Use this option when your requirement
                    doesn't fit the categories above.
                  </span>
                </button>

              </div>

            </section>

          )}


          {/* FORM */}

          {purpose && (

            <form onSubmit={handleSubmit}>

              {/* APPLICATION DETAILS */}

              <section className="panel">

                <div className="panel-header">

                  <div>

                    <h3>
                      Application Details
                    </h3>

                    <p>
                      Information related to this application.
                    </p>

                  </div>


                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setPurpose("");
                      setError("");
                    }}
                  >
                    Change Application Type
                  </button>

                </div>


                <div
                  style={{
                    padding: "25px"
                  }}
                >

                  {/* NEW PROGRAMME */}

                  {purpose === "NEW_PROGRAMME" && (

                    <div
                      style={gridStyle}
                    >

                      <div>

                        <label style={labelStyle}>
                          Programme Name *
                        </label>

                        <input
                          name="programmeName"
                          value={formData.programmeName}
                          onChange={handleChange}
                          placeholder="e.g. B.Tech Computer Engineering"
                          required
                          style={inputStyle}
                        />

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Programme Level *
                        </label>

                        <select
                          name="programmeLevel"
                          value={formData.programmeLevel}
                          onChange={handleChange}
                          required
                          style={inputStyle}
                        >

                          <option value="">
                            Select level
                          </option>

                          <option value="DIPLOMA">
                            Diploma
                          </option>

                          <option value="UG">
                            Undergraduate
                          </option>

                          <option value="PG">
                            Postgraduate
                          </option>

                          <option value="PHD">
                            PhD / Doctoral
                          </option>

                        </select>

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Discipline / Branch *
                        </label>

                        <input
                          name="discipline"
                          value={formData.discipline}
                          onChange={handleChange}
                          placeholder="e.g. Computer Engineering"
                          required
                          style={inputStyle}
                        />

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Proposed Intake *
                        </label>

                        <input
                          name="proposedIntake"
                          type="number"
                          min="1"
                          value={formData.proposedIntake}
                          onChange={handleChange}
                          placeholder="e.g. 60"
                          required
                          style={inputStyle}
                        />

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Academic Year *
                        </label>

                        <input
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          required
                          style={inputStyle}
                        />

                      </div>

                    </div>

                  )}


                  {/* INCREASE INTAKE */}

                  {purpose === "INCREASE_INTAKE" && (

                    <div
                      style={gridStyle}
                    >

                      <div>

                        <label style={labelStyle}>
                          Programme Name *
                        </label>

                        <input
                          name="programmeName"
                          value={formData.programmeName}
                          onChange={handleChange}
                          placeholder="e.g. B.Tech Computer Engineering"
                          required
                          style={inputStyle}
                        />

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Current Approved Intake *
                        </label>

                        <input
                          name="currentIntake"
                          type="number"
                          min="1"
                          value={formData.currentIntake}
                          onChange={handleChange}
                          placeholder="e.g. 60"
                          required
                          style={inputStyle}
                        />

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Proposed Intake *
                        </label>

                        <input
                          name="proposedIntake"
                          type="number"
                          min="1"
                          value={formData.proposedIntake}
                          onChange={handleChange}
                          placeholder="e.g. 120"
                          required
                          style={inputStyle}
                        />

                      </div>


                      <div>

                        <label style={labelStyle}>
                          Academic Year *
                        </label>

                        <input
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          required
                          style={inputStyle}
                        />

                      </div>

                    </div>

                  )}


                  {/* RENEWAL */}

                  {purpose === "RENEWAL" && (

                    <div>

                      <label style={labelStyle}>
                        Previous FDR Number *
                      </label>

                      <input
                        name="previousFdrNumber"
                        value={formData.previousFdrNumber}
                        onChange={handleChange}
                        placeholder="e.g. FDR/VJTI/2026/001"
                        required
                        style={inputStyle}
                      />

                      <p
                        style={{
                          color: "#64748b",
                          fontSize: "14px",
                          marginTop: "8px"
                        }}
                      >
                        Enter the FDR being renewed. Enter the new FDR number
                        separately in FDR Details below.
                      </p>

                    </div>

                  )}


                  {/* REPLACEMENT */}

                  {purpose === "REPLACEMENT" && (

                    <div>

                      <label style={labelStyle}>
                        FDR Number Being Replaced *
                      </label>

                      <input
                        name="previousFdrNumber"
                        value={formData.previousFdrNumber}
                        onChange={handleChange}
                        placeholder="e.g. FDR/VJTI/2026/001"
                        required
                        style={inputStyle}
                      />

                      <label style={{ ...labelStyle, display: "block", marginTop: 16 }}>
                        Reason for Replacement *
                      </label>
                      <textarea
                        name="applicationDescription"
                        value={formData.applicationDescription}
                        onChange={handleChange}
                        required
                        style={{ ...inputStyle, minHeight: 90 }}
                      />
                    </div>

                  )}


                  {/* MODIFICATION */}

                  {purpose === "MODIFICATION" && (

                    <div>

                      <label style={labelStyle}>
                        Academic Year *
                      </label>

                      <input
                        name="academicYear"
                        value={formData.academicYear}
                        onChange={handleChange}
                        placeholder="e.g. 2027-28"
                        required
                        style={inputStyle}
                      />

                      <label style={{ ...labelStyle, display: "block", marginTop: 16 }}>
                        Modification Details *
                      </label>
                      <textarea
                        name="applicationDescription"
                        value={formData.applicationDescription}
                        onChange={handleChange}
                        required
                        style={{ ...inputStyle, minHeight: 90 }}
                      />
                    </div>

                  )}


                  {/* OTHER */}

                  {purpose === "OTHER" && (

                    <div>

                      <label style={labelStyle}>
                        Academic Year *
                      </label>

                      <input
                        name="academicYear"
                        value={formData.academicYear}
                        onChange={handleChange}
                        placeholder="e.g. 2027-28"
                        required
                        style={inputStyle}
                      />

                      <label style={{ ...labelStyle, display: "block", marginTop: 16 }}>
                        Requirement Description *
                      </label>
                      <textarea
                        name="applicationDescription"
                        value={formData.applicationDescription}
                        onChange={handleChange}
                        required
                        style={{ ...inputStyle, minHeight: 90 }}
                      />
                    </div>

                  )}


                  {/* NEW INSTITUTION */}

                  {purpose === "NEW_INSTITUTION" && (

                    <div>

                      <div
                        style={{
                          background: "#f8fafc",
                          padding: "16px",
                          borderRadius: "8px",
                          marginBottom: "20px"
                        }}
                      >
                        <strong>
                          Institution
                        </strong>

                        <p
                          style={{
                            margin: "6px 0 0",
                            color: "#64748b"
                          }}
                        >
                          {formData.institutionName}
                        </p>
                      </div>


                      <div>

                        <label style={labelStyle}>
                          Academic Year
                        </label>

                        <input
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          style={inputStyle}
                        />

                      </div>

                    </div>

                  )}

                </div>

              </section>


              {/* FDR DETAILS */}

              <section
                className="panel"
                style={{
                  marginTop: "20px"
                }}
              >

                <div className="panel-header">

                  <div>

                    <h3>
                      FDR Details
                    </h3>

                    <p>
                      Enter the details exactly as shown on
                      the bank-issued FDR.
                    </p>

                  </div>

                </div>


                <div
                  style={{
                    padding: "25px"
                  }}
                >

                  <div style={gridStyle}>

                    <div>

                      <label style={labelStyle}>
                        FDR Number *
                      </label>

                      <input
                        name="fdrNumber"
                        value={formData.fdrNumber}
                        onChange={handleChange}
                        placeholder="e.g. FDR/VJTI/2026/002"
                        required
                        style={inputStyle}
                      />

                    </div>


                    <div>

                      <label style={labelStyle}>
                        Bank Name *
                      </label>

                      <input
                        name="bankName"
                        value={formData.bankName}
                        onChange={handleChange}
                        placeholder="e.g. State Bank of India"
                        required
                        style={inputStyle}
                      />

                    </div>


                    <div>

                      <label style={labelStyle}>
                        Amount (₹) *
                      </label>

                      <input
                        name="amount"
                        type="number"
                        min="1"
                        step="0.01"
                        value={formData.amount}
                        onChange={handleChange}
                        placeholder="e.g. 1000000"
                        required
                        style={inputStyle}
                      />

                    </div>


                    <div>

                      <label style={labelStyle}>
                        Issue Date *
                      </label>

                      <input
                        name="issueDate"
                        type="date"
                        value={formData.issueDate}
                        onChange={handleChange}
                        required
                        style={inputStyle}
                      />

                    </div>


                    <div>

                      <label style={labelStyle}>
                        Maturity Date *
                      </label>

                      <input
                        name="maturityDate"
                        type="date"
                        value={formData.maturityDate}
                        onChange={handleChange}
                        required
                        style={inputStyle}
                      />

                    </div>


                    <div>

                      <label style={labelStyle}>
                        FDR Document (PDF, PNG or JPG) *
                      </label>

                      <input
                        id="fdrDocument"
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                        onChange={handleFileChange}
                        required
                        style={{
                          ...inputStyle,
                          padding: "9px"
                        }}
                      />

                      {file && (

                        <p
                          style={{
                            marginTop: "8px",
                            color: "#475569",
                            fontSize: "14px"
                          }}
                        >
                          Selected: {file.name}
                        </p>

                      )}

                    </div>

                  </div>

                </div>

              </section>


              {/* ACTIONS */}

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "12px",
                  marginTop: "20px"
                }}
              >

                <button
                  type="button"
                  onClick={() => navigate("/fdrs")}
                  disabled={loading}
                  style={{
                    padding: "12px 20px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "8px",
                    background: "#fff",
                    cursor: "pointer"
                  }}
                >
                  Cancel
                </button>


                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                  style={{
                    border: "none",
                    cursor: loading
                      ? "not-allowed"
                      : "pointer"
                  }}
                >
                  {loading
                    ? "Submitting..."
                    : "Submit FDR"}
                </button>

              </div>

            </form>

          )}

        </section>

      </main>

    </div>
  );
}


/*
 * Reusable inline styles.
 */

const cardStyle = {
  border: "1px solid #e2e8f0",
  borderRadius: "12px",
  background: "#ffffff",
  padding: "22px",
  textAlign: "left",
  cursor: "pointer",
  minHeight: "170px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  transition: "0.2s"
};

const iconStyle = {
  fontSize: "30px",
  marginBottom: "14px"
};

const titleStyle = {
  fontSize: "17px",
  marginBottom: "8px",
  color: "#0f172a"
};

const descriptionStyle = {
  fontSize: "14px",
  lineHeight: "1.6",
  color: "#64748b"
};

const gridStyle = {
  display: "grid",
  gridTemplateColumns:
    "repeat(2, minmax(0, 1fr))",
  gap: "20px"
};

const labelStyle = {
  display: "block",
  fontWeight: "600",
  marginBottom: "8px",
  color: "#334155"
};

const inputStyle = {
  width: "100%",
  padding: "12px",
  border: "1px solid #cbd5e1",
  borderRadius: "8px",
  boxSizing: "border-box",
  background: "#ffffff",
  fontSize: "14px"
};

export default SubmitFDR;