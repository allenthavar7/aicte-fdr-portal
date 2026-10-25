import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FDRs from "./pages/FDRs";
import SubmitFDR from "./pages/SubmitFDR";
import Documents from "./pages/Documents";
import OfficerDashboard from "./pages/OfficerDashboard";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        <Route
          path="/"
          element={<Login />}
        />

        <Route
          path="/dashboard"
          element={<Dashboard />}
        />
        <Route
          path="/officer"
          element={<OfficerDashboard />}
        />
        <Route
          path="/fdrs"
          element={<FDRs />}
        />

        <Route
          path="/submit-fdr"
          element={<SubmitFDR />}
        />

        <Route
          path="/documents"
          element={<Documents />}
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;