import { BrowserRouter, Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import FDRs from "./pages/FDRs";
import SubmitFDR from "./pages/SubmitFDR";
import Documents from "./pages/Documents";
import OfficerDashboard from "./pages/OfficerDashboard";
import OfficerWorkspace from "./pages/OfficerWorkspace";
import Renewals from "./pages/Renewals";
import Notifications from "./pages/Notifications";

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
          path="/officer/:section"
          element={<OfficerWorkspace />}
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
          path="/renewals"
          element={<Renewals />}
        />
        <Route
          path="/notifications"
          element={<Notifications />}
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