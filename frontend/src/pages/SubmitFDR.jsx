import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AutomatedVerificationResult from "../components/AutomatedVerificationResult";
import "./InstitutionWorkspace.css";

function SubmitFDR() {
  const navigate = useNavigate();

  const user = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "{}");
      if (u.name && /vjti/i.test(u.name)) u.name = "ABC";
      if (u.email && /vjti/i.test(u.email)) u.email = "admin@abc.ac.in";
      return u;
    } catch {
      return {};
    }
  })();
  const dummyUser = (() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "{}");
    } catch {
      return {};
    }
  })();
  const institutionName = (user.name && !/vjti/i.test(user.name)) ? user.name : "ABC";
  const institutionCode = user.aicte_code || user.institution_code || "AICTE-MH-001";
  const avatarLetter = (institutionName[0] || "V").toUpperCase();

  const [purpose, setPurpose] = useState("");

  const [formData, setFormData] = useState({
    institutionName: institutionName,
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
  const [fileInputKey, setFileInputKey] = useState(0);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submissionResult, setSubmissionResult] = useState(null);

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
      setError("Please select a valid PDF, PNG, JPG or JPEG certificate scan.");
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

      if (Number(formData.proposedIntake) <= Number(formData.currentIntake)) {
        return "Proposed intake must be greater than current approved intake.";
      }
    }

    if (purpose === "RENEWAL") {
      if (!formData.previousFdrNumber) {
        return "Please enter the existing FDR number being renewed.";
      }
    }

    if (purpose === "REPLACEMENT") {
      if (!formData.previousFdrNumber) {
        return "Please enter the FDR number being replaced.";
      }
      if (!formData.applicationDescription.trim()) {
        return "Please provide a reason for FDR replacement.";
      }
    }

    if (purpose === "MODIFICATION") {
      if (!formData.academicYear) {
        return "Please specify the academic year.";
      }
      if (!formData.applicationDescription.trim()) {
        return "Please describe the requested modification.";
      }
    }

    if (purpose === "OTHER") {
      if (!formData.academicYear) {
        return "Please specify the academic year.";
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
    setSubmissionResult(null);

    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/");
      return;
    }

    if (!purpose) {
      setError("Please select the regulatory application type.");
      return;
    }

    const purposeError = validatePurposeFields();
    if (purposeError) {
      setError(purposeError);
      return;
    }

    if (!file) {
      setError("Please upload the scanned FDR document.");
      return;
    }

    if (
      !formData.fdrNumber ||
      !formData.bankName ||
      !formData.amount ||
      !formData.issueDate ||
      !formData.maturityDate
    ) {
      setError("Please complete all FDR financial details.");
      return;
    }

    if (Number(formData.amount) <= 0) {
      setError("Deposit amount must be greater than zero.");
      return;
    }

    if (new Date(formData.maturityDate) <= new Date(formData.issueDate)) {
      setError("Maturity date must be after the issue date.");
      return;
    }

    try {
      setLoading(true);

      const data = new FormData();
      data.append("fdrNumber", formData.fdrNumber);
      data.append("bankName", formData.bankName);
      data.append("amount", formData.amount);
      data.append("issueDate", formData.issueDate);
      data.append("maturityDate", formData.maturityDate);
      data.append("fdrDocument", file);

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
        `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/fdr`,
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
        throw new Error(result.message || "Failed to submit FDR");
      }

      setSuccess(result.message || "FDR lodged successfully. Automated OCR & banking verification initiated.");
      setSubmissionResult(
        result.verification || {
          status: result.fdr?.verificationStatus || result.fdr?.verificationResult,
          score: result.fdr?.verificationScore,
          ocr: {
            provider: result.fdr?.ocrProvider || "Tesseract.js",
            confidence: result.fdr?.ocrConfidence,
            extracted: null,
            rawText: ""
          },
          bank: result.fdr?.bankVerification,
          comparisons: result.fdr?.comparisonResults || []
        }
      );
    } catch (err) {
      console.error("Submit FDR error:", err);
      setError(err.message || "Failed to submit FDR.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/");
  }

  const purposeOptions = [
    {
      id: "NEW_INSTITUTION",
      title: "New Institution Establishment",
      desc: "Mandatory security deposit for establishing a new technical institution.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 21h18M3 7v14M21 7v14M6 11h2M6 15h2M16 11h2M16 15h2M9 21V11h6v10" />
        </svg>
      )
    },
    {
      id: "NEW_PROGRAMME",
      title: "New Programme Addition",
      desc: "Security deposit collateral for introducing a new approved degree or diploma course.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <path d="M6 12v5c3 3 9 3 12 0v-5" />
        </svg>
      )
    },
    {
      id: "INCREASE_INTAKE",
      title: "Increase in Approved Intake",
      desc: "Additional security deposit for expanding approved student capacity.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      )
    },
    {
      id: "RENEWAL",
      title: "Renewal / Continuation",
      desc: "Lodge a replacement deposit certificate for an existing maturing FDR.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
        </svg>
      )
    },
    {
      id: "REPLACEMENT",
      title: "Replacement / Re-submission",
      desc: "Replace an existing FDR due to bank merger, denomination change, or rectification.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="12" y1="18" x2="12" y2="12" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      )
    },
    {
      id: "MODIFICATION",
      title: "Change / Modification",
      desc: "Submit security deposit update for campus relocation, name change, or restructuring.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      )
    },
    {
      id: "OTHER",
      title: "Other Regulatory Requirement",
      desc: "Custom AICTE regulatory lodgement pursuant to special council directives.",
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )
    }
  ];

  const selectedPurposeObj = purposeOptions.find((p) => p.id === purpose);

  return (
    <div className="dashboard-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-circle">AICTE</div>
          <div>
            <h2>AICTE</h2>
            <span>FDR Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className="nav-item" onClick={() => navigate("/dashboard")}>
            <span>▣</span>
            Dashboard
          </button>

          <button className="nav-item" onClick={() => navigate("/fdrs")}>
            <span>▤</span>
            My FDRs
          </button>

          <button className="nav-item active">
            <span>＋</span>
            Submit FDR
          </button>

          <button className="nav-item" onClick={() => navigate("/renewals")}>
            <span>↻</span>
            Renewals
          </button>

          <button className="nav-item" onClick={() => navigate("/documents")}>
            <span>📄</span>
            Documents
          </button>

          <button className="nav-item" onClick={() => navigate("/notifications")}>
            <span>♢</span>
            Notifications
          </button>

          <button className="nav-item" onClick={() => navigate("/help")}>
            <span>🛟</span>
            Help & Support
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="institution-mini">
            <strong>{institutionName}</strong>
            <span>{institutionCode}</span>
          </div>

          <button className="logout-button" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="dashboard-main">
        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <h1>Submit FDR</h1>
            <p>Security Deposit & Fixed Deposit Receipt Lodgement</p>
          </div>

          <div className="user-info">
            <div className="user-avatar">{avatarLetter}</div>
            <div>
              <strong>{institutionName}</strong>
              <span>Institution Nodal Contact</span>
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <section className="dashboard-content">
          {/* HERO BANNER */}
          <div className="ow-hero-header" style={{ marginBottom: "22px" }}>
            <div className="ow-hero-text">
              <span className="ow-hero-pill">
                <span className="ow-pill-dot" /> Regulatory Submission Desk
              </span>
              <h1 style={{ fontSize: "22px", margin: "6px 0 4px 0", color: "#ffffff", fontWeight: 700 }}>
                {purpose ? selectedPurposeObj?.title : "Submit New Fixed Deposit Receipt"}
              </h1>
              <p style={{ margin: 0, color: "#bae6fd", fontSize: "13px" }}>
                {purpose
                  ? "Complete the mandatory institutional details, deposit terms, and upload the scanned bank certificate."
                  : "Select the statutory purpose of this FDR lodgement to launch the guided submission form."}
              </p>
            </div>
            {purpose && (
              <button
                type="button"
                className="ow-button"
                onClick={() => {
                  setPurpose("");
                  setError("");
                }}
                style={{
                  background: "rgba(255,255,255,0.15)",
                  color: "#fff",
                  borderColor: "rgba(255,255,255,0.25)",
                  whiteSpace: "nowrap"
                }}
              >
                ← Change Application Type
              </button>
            )}
          </div>

          {/* ALERTS */}
          {error && (
            <div
              style={{
                background: "#fee2e2",
                color: "#991b1b",
                border: "1px solid #fecaca",
                padding: "14px 18px",
                borderRadius: "8px",
                marginBottom: "20px",
                fontSize: "13.5px"
              }}
            >
              ⚠ {error}
            </div>
          )}

          {success && (
            <div
              style={{
                background: "#dcfce7",
                color: "#166534",
                border: "1px solid #bbf7d0",
                padding: "14px 18px",
                borderRadius: "8px",
                marginBottom: "20px",
                fontSize: "13.5px"
              }}
            >
              ✓ {success}
            </div>
          )}

          {/* SUBMISSION VERIFICATION RESULT */}
          {submissionResult && (
            <div className="ow-stack" style={{ marginBottom: "24px" }}>
              <AutomatedVerificationResult verification={submissionResult} />
              <div style={{ display: "flex", gap: "12px", justifyContent: "flex-end", marginTop: "16px" }}>
                <button
                  type="button"
                  className="ow-button"
                  onClick={() => navigate("/fdrs")}
                  style={{ padding: "10px 20px" }}
                >
                  View My FDRs Portfolio →
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setPurpose("");
                    setFile(null);
                    setFileInputKey((key) => key + 1);
                    setSuccess("");
                    setSubmissionResult(null);
                    setError("");
                    setFormData({
                      institutionName: institutionName,
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
                  }}
                  style={{ padding: "10px 20px" }}
                >
                  + Submit Another FDR
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: PURPOSE SELECTION */}
          {!submissionResult && !purpose && (
            <section className="ow-card" style={{ padding: "24px" }}>
              <div style={{ marginBottom: "18px" }}>
                <h3 style={{ margin: "0 0 4px 0", fontSize: "16px", color: "#002b5c", fontWeight: 700 }}>
                  Select Regulatory Lodgement Category
                </h3>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  Identify the statutory basis for this Fixed Deposit Receipt submission.
                </p>
              </div>

              <div className="inst-purpose-grid">
                {purposeOptions.map((opt) => (
                  <div
                    key={opt.id}
                    className="inst-purpose-card"
                    onClick={() => setPurpose(opt.id)}
                  >
                    <div className="inst-purpose-card-header">
                      <div className="inst-purpose-icon">{opt.icon}</div>
                      <div>
                        <h4>{opt.title}</h4>
                        <p>{opt.desc}</p>
                      </div>
                    </div>
                    <span className="inst-purpose-select-btn">Select Category →</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* STEP 2: GUIDED FORM */}
          {!submissionResult && purpose && (
            <form onSubmit={handleSubmit}>
              {/* SECTION 1: APPLICATION & PURPOSE DETAILS */}
              <section className="inst-form-card">
                <div className="inst-form-card-header">
                  <div className="inst-step-badge">1</div>
                  <div>
                    <h3>Application & Programme Details</h3>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                      Academic and institutional parameters for {selectedPurposeObj?.title}.
                    </p>
                  </div>
                </div>

                <div className="inst-form-card-body">
                  {/* NEW PROGRAMME */}
                  {purpose === "NEW_PROGRAMME" && (
                    <div className="inst-form-grid-3">
                      <div className="inst-field-group">
                        <label>Programme Name <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="programmeName"
                          value={formData.programmeName}
                          onChange={handleChange}
                          placeholder="e.g. B.Tech Computer Engineering"
                          required
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Programme Level <span className="inst-req">*</span></label>
                        <select
                          className="inst-select"
                          name="programmeLevel"
                          value={formData.programmeLevel}
                          onChange={handleChange}
                          required
                        >
                          <option value="">Select Level</option>
                          <option value="DIPLOMA">Diploma</option>
                          <option value="UG">Undergraduate (UG)</option>
                          <option value="PG">Postgraduate (PG)</option>
                          <option value="PHD">PhD / Doctoral</option>
                        </select>
                      </div>

                      <div className="inst-field-group">
                        <label>Discipline / Branch <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="discipline"
                          value={formData.discipline}
                          onChange={handleChange}
                          placeholder="e.g. Computer Engineering"
                          required
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Proposed Approved Intake <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="proposedIntake"
                          type="number"
                          min="1"
                          value={formData.proposedIntake}
                          onChange={handleChange}
                          placeholder="e.g. 60"
                          required
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Academic Year <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* INCREASE INTAKE */}
                  {purpose === "INCREASE_INTAKE" && (
                    <div className="inst-form-grid-2">
                      <div className="inst-field-group">
                        <label>Programme Name <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="programmeName"
                          value={formData.programmeName}
                          onChange={handleChange}
                          placeholder="e.g. B.Tech Mechanical Engineering"
                          required
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Academic Year <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          required
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Current Approved Intake <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="currentIntake"
                          type="number"
                          min="1"
                          value={formData.currentIntake}
                          onChange={handleChange}
                          placeholder="e.g. 60"
                          required
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Proposed Expanded Intake <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="proposedIntake"
                          type="number"
                          min="1"
                          value={formData.proposedIntake}
                          onChange={handleChange}
                          placeholder="e.g. 120"
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* RENEWAL */}
                  {purpose === "RENEWAL" && (
                    <div className="inst-field-group" style={{ maxWidth: "500px" }}>
                      <label>Existing FDR Number Being Renewed <span className="inst-req">*</span></label>
                      <input
                        className="inst-input"
                        name="previousFdrNumber"
                        value={formData.previousFdrNumber}
                        onChange={handleChange}
                        placeholder="e.g. DEMO-FDR-2026-APPR-01"
                        required
                      />
                      <small style={{ color: "#64748b", marginTop: "4px" }}>
                        Specify the existing FDR certificate being renewed. Enter the replacement FDR details in Section 2 below.
                      </small>
                    </div>
                  )}

                  {/* REPLACEMENT */}
                  {purpose === "REPLACEMENT" && (
                    <div className="inst-form-grid-2">
                      <div className="inst-field-group">
                        <label>FDR Number Being Replaced <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="previousFdrNumber"
                          value={formData.previousFdrNumber}
                          onChange={handleChange}
                          placeholder="e.g. DEMO-FDR-2026-MAT-01"
                          required
                        />
                      </div>

                      <div className="inst-field-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Reason for Replacement / Re-submission <span className="inst-req">*</span></label>
                        <textarea
                          className="inst-textarea"
                          rows="3"
                          name="applicationDescription"
                          value={formData.applicationDescription}
                          onChange={handleChange}
                          placeholder="Explain bank restructuring, lien re-endorsement, or denomination change..."
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* MODIFICATION */}
                  {purpose === "MODIFICATION" && (
                    <div className="inst-form-grid-2">
                      <div className="inst-field-group">
                        <label>Academic Year <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          required
                        />
                      </div>

                      <div className="inst-field-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Modification Details & Scrutiny Basis <span className="inst-req">*</span></label>
                        <textarea
                          className="inst-textarea"
                          rows="3"
                          name="applicationDescription"
                          value={formData.applicationDescription}
                          onChange={handleChange}
                          placeholder="Describe the requested change or modification..."
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* OTHER */}
                  {purpose === "OTHER" && (
                    <div className="inst-form-grid-2">
                      <div className="inst-field-group">
                        <label>Academic Year <span className="inst-req">*</span></label>
                        <input
                          className="inst-input"
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                          required
                        />
                      </div>

                      <div className="inst-field-group" style={{ gridColumn: "1 / -1" }}>
                        <label>Regulatory Requirement Description <span className="inst-req">*</span></label>
                        <textarea
                          className="inst-textarea"
                          rows="3"
                          name="applicationDescription"
                          value={formData.applicationDescription}
                          onChange={handleChange}
                          placeholder="Detail the specific AICTE requirement or order..."
                          required
                        />
                      </div>
                    </div>
                  )}

                  {/* NEW INSTITUTION */}
                  {purpose === "NEW_INSTITUTION" && (
                    <div className="inst-form-grid-2">
                      <div className="inst-field-group">
                        <label>Institution Name</label>
                        <input
                          className="inst-input"
                          value={formData.institutionName}
                          disabled
                        />
                      </div>

                      <div className="inst-field-group">
                        <label>Target Academic Year</label>
                        <input
                          className="inst-input"
                          name="academicYear"
                          value={formData.academicYear}
                          onChange={handleChange}
                          placeholder="e.g. 2027-28"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* SECTION 2: FDR FINANCIAL & BANK DETAILS */}
              <section className="inst-form-card">
                <div className="inst-form-card-header">
                  <div className="inst-step-badge">2</div>
                  <div>
                    <h3>Bank & Financial Instrument Details</h3>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                      Enter deposit values exactly as stated on the physical certificate.
                    </p>
                  </div>
                </div>

                <div className="inst-form-card-body">
                  <div className="inst-form-grid-3">
                    <div className="inst-field-group">
                      <label>FDR Instrument Number <span className="inst-req">*</span></label>
                      <input
                        className="inst-input"
                        name="fdrNumber"
                        value={formData.fdrNumber}
                        onChange={handleChange}
                        placeholder="e.g. FDR/ABC/2027/009"
                        required
                      />
                    </div>

                    <div className="inst-field-group">
                      <label>Issuing Bank Name <span className="inst-req">*</span></label>
                      <input
                        className="inst-input"
                        name="bankName"
                        value={formData.bankName}
                        onChange={handleChange}
                        placeholder="e.g. State Bank of India"
                        required
                      />
                    </div>

                    <div className="inst-field-group">
                      <label>Deposit Amount (₹) <span className="inst-req">*</span></label>
                      <input
                        className="inst-input"
                        name="amount"
                        type="number"
                        min="1"
                        step="0.01"
                        value={formData.amount}
                        onChange={handleChange}
                        placeholder="e.g. 1500000"
                        required
                      />
                    </div>

                    <div className="inst-field-group">
                      <label>Date of Issuance <span className="inst-req">*</span></label>
                      <input
                        className="inst-input"
                        name="issueDate"
                        type="date"
                        value={formData.issueDate}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="inst-field-group">
                      <label>Maturity Date <span className="inst-req">*</span></label>
                      <input
                        className="inst-input"
                        name="maturityDate"
                        type="date"
                        value={formData.maturityDate}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* SECTION 3: SCANNED DOCUMENT EVIDENCE */}
              <section className="inst-form-card">
                <div className="inst-form-card-header">
                  <div className="inst-step-badge">3</div>
                  <div>
                    <h3>Fixed Deposit Certificate Document Upload</h3>
                    <p style={{ margin: 0, fontSize: "12px", color: "#64748b" }}>
                      High-resolution scan featuring explicit AICTE joint lien endorsement.
                    </p>
                  </div>
                </div>

                <div className="inst-form-card-body">
                  <label htmlFor="fdrDocument" className="inst-dropzone" style={{ display: "block" }}>
                    <div className="inst-dropzone-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <h4>Click to Browse or Drag Certificate Here</h4>
                    <p>Accepted formats: PDF, PNG, JPG, JPEG · Maximum file size: 10MB</p>

                    <input
                      id="fdrDocument"
                      key={fileInputKey}
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                      onChange={handleFileChange}
                      required
                      style={{ display: "none" }}
                    />
                  </label>

                  {file && (
                    <div className="inst-file-selected-box">
                      <div className="inst-file-meta">
                        <div className="inst-file-icon">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <div>
                          <div className="inst-file-name">{file.name}</div>
                          <div className="inst-file-size">{(file.size / 1024).toFixed(1)} KB · Ready for OCR</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFile(null);
                          setFileInputKey((k) => k + 1);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                          fontSize: "12.5px",
                          fontWeight: 700
                        }}
                      >
                        ✕ Remove
                      </button>
                    </div>
                  )}
                </div>
              </section>

              {/* ACTION FOOTER */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
                <button
                  type="button"
                  className="ow-button"
                  onClick={() => navigate("/fdrs")}
                  disabled={loading}
                  style={{ padding: "10px 22px" }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={loading}
                  style={{ padding: "10px 26px" }}
                >
                  {loading ? "Lodging & Analyzing Document..." : "Submit FDR & Run Automated Verification →"}
                </button>
              </div>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}

export default SubmitFDR;
