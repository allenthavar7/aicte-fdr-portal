import { useState } from "react";
import { useNavigate } from "react-router-dom";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:5000/api"}/auth/login`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: email.trim(),
            password,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Login failed"
        );
      }

      // Save authentication information
      localStorage.setItem("token", data.token);

      localStorage.setItem(
        "user",
        JSON.stringify(data.user)
      );

      // Redirect according to user role
      if (data.user.role === "OFFICER") {
        navigate("/officer");
      } else if (data.user.role === "INSTITUTION") {
        navigate("/dashboard");
      } else if (data.user.role === "ADMIN") {
        navigate("/admin");
      } else {
        setError("Unknown user role.");
      }

    } catch (error) {
      console.error("Login error:", error);

      setError(
        error.message ||
        "Unable to connect to the server."
      );

    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">

      <div className="login-card">

        {/* LOGO */}

        <div className="login-brand">

          <div className="brand-circle">
            AICTE
          </div>

          <div>
            <h1>AICTE</h1>
            <p>FDR Management Portal</p>
          </div>

        </div>

        {/* HEADING */}

        <div className="login-heading">

          <h2>Welcome Back</h2>

          <p>
            Sign in to manage your Fixed Deposit Receipts
          </p>

        </div>

        {/* ERROR */}

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        {/* FORM */}

        <form onSubmit={handleSubmit}>

          <div className="form-group">

            <label htmlFor="email">
              Email Address
            </label>

            <input
              id="email"
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(event) =>
                setEmail(event.target.value)
              }
              required
              autoComplete="email"
            />

          </div>

          <div className="form-group">

            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              required
              autoComplete="current-password"
            />

          </div>

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>

        </form>

        {/* QUICK FILL DEMO ACCOUNTS */}
        <div style={{ marginTop: "24px", paddingTop: "18px", borderTop: "1px solid #eaecf0" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px", color: "#667085", marginBottom: "12px", textAlign: "center" }}>
            Demo Quick Login Presets
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "14px" }}>
            <button
              type="button"
              onClick={() => {
                setEmail("admin@abc.ac.in");
                setPassword("ABC@12345");
                setError("");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid #b2ddff",
                background: "#eff8ff",
                color: "#175cd3",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                textAlign: "center"
              }}
            >
              🏢 Fill Institution (ABC)
            </button>

            <button
              type="button"
              onClick={() => {
                setEmail("officer@aicte.gov.in");
                setPassword("AICTE@12345");
                setError("");
              }}
              style={{
                padding: "8px 10px",
                borderRadius: "6px",
                border: "1px solid #d0d5dd",
                background: "#f8fafc",
                color: "#344054",
                fontSize: "12px",
                fontWeight: "600",
                cursor: "pointer",
                textAlign: "center"
              }}
            >
              🛡️ Fill AICTE Officer
            </button>
          </div>

          <div style={{ background: "#f8fafc", border: "1px solid #eaecf0", borderRadius: "8px", padding: "12px", fontSize: "12px", color: "#475467" }}>
            <div style={{ marginBottom: "8px" }}>
              <strong style={{ color: "#1d2939" }}>Institution:</strong> admin@abc.ac.in &nbsp;|&nbsp; <code>ABC@12345</code>
            </div>
            <div>
              <strong style={{ color: "#1d2939" }}>Officer:</strong> officer@aicte.gov.in &nbsp;|&nbsp; <code>AICTE@12345</code>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}

export default Login;