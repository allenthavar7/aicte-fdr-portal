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
        "http://localhost:5000/api/auth/login",
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

        {/* DEMO ACCOUNT */}

        <div className="demo-account">

          <strong>Demo Institution Account</strong>

          <p>
            VJTI Engineering College
          </p>

          <p>
            <span>Email:</span>{" "}
            admin@vjti.ac.in
          </p>

          <p>
            <span>Password:</span>{" "}
            AICTE@12345
          </p>

        </div>

      </div>

    </div>
  );
}

export default Login;