const API_URL = import.meta.env.VITE_API_URL;

export async function login(email, password) {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email,
      password
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Login failed");
  }

  return data;
}

export async function getOfficerFdrs(token) {
  const response = await fetch(`${API_URL}/officer/fdrs`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Unable to fetch FDRs");
  }

  if (!data) {
    throw new Error("Invalid response while fetching FDRs");
  }

  return data;
}

export async function getOfficerStats(token) {
  const response = await fetch(`${API_URL}/officer/stats`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Unable to fetch officer statistics");
  }

  if (!data?.stats) {
    throw new Error("Invalid response while fetching officer statistics");
  }

  return data.stats;
}

export async function getOfficerDashboard(token) {
  const data = await getOfficerResource(
    "/officer/dashboard",
    token,
    "Unable to fetch officer dashboard data"
  );

  if (!data.stats || data.source !== "DATABASE") {
    throw new Error("Invalid officer dashboard response");
  }

  return data;
}

export async function getOfficerVerificationQueue(token) {
  const data = await getOfficerResource(
    "/officer/verification-queue",
    token,
    "Unable to fetch verification queue"
  );

  if (!Array.isArray(data.fdrs)) {
    throw new Error("Invalid officer verification queue response");
  }

  return data;
}

export async function postOfficerFdrOverride(token, fdrId, decision, reason) {
  const response = await fetch(`${API_URL}/officer/fdrs/${fdrId}/override`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ decision, reason })
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || "Unable to record officer decision");
  }

  return data;
}

export async function getOfficerFdrDocument(token, fdrId, documentId) {
  const response = await fetch(
    `${API_URL}/officer/fdrs/${fdrId}/documents/${documentId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || "Unable to open FDR document");
  }

  return response.blob();
}

export async function getOfficerFdrDetail(token, fdrId) {
  return getOfficerResource(
    `/officer/fdrs/${fdrId}`,
    token,
    "Unable to fetch FDR details"
  );
}

async function getOfficerResource(path, token, fallbackMessage, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`
    }
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(data?.message || fallbackMessage);
  }

  if (!data) {
    throw new Error("Invalid response from officer API");
  }

  return data;
}

export async function getOfficerFdrTimeline(token, fdrId) {
  const data = await getOfficerResource(
    `/officer/fdrs/${fdrId}/timeline`,
    token,
    "Unable to fetch FDR activity timeline"
  );

  if (!Array.isArray(data.events)) {
    throw new Error("Invalid FDR timeline response");
  }

  return data.events;
}

export async function getInstitutionCompliance(token, institutionId) {
  const data = await getOfficerResource(
    `/officer/institutions/${institutionId}/compliance`,
    token,
    "Unable to fetch institution compliance score"
  );

  if (!data.compliance) {
    throw new Error("Invalid institution compliance response");
  }

  return data.compliance;
}

export async function getOfficerInstitutions(token) {
  return getOfficerResource(
    "/officer/institutions",
    token,
    "Unable to fetch institutions"
  );
}

export async function getOfficerInstitution(token, institutionId) {
  return getOfficerResource(
    `/officer/institutions/${institutionId}`,
    token,
    "Unable to fetch institution details"
  );
}

export async function getOfficerReleaseRequests(token) {
  return getOfficerResource(
    "/officer/release-requests",
    token,
    "Unable to fetch release requests"
  );
}

export async function reviewOfficerReleaseRequest(
  token,
  requestId,
  decision,
  reason
) {
  const response = await fetch(
    `${API_URL}/officer/release-requests/${requestId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ decision, reason })
    }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to review release request");
  }
  return data;
}

export async function getOfficerNotifications(token) {
  return getOfficerResource(
    "/officer/notifications",
    token,
    "Unable to fetch notifications"
  );
}

export async function markOfficerNotificationRead(token, notificationId) {
  return getOfficerResource(
    `/officer/notifications/${notificationId}/read`,
    token,
    "Unable to mark notification as read",
    { method: "PATCH" }
  );
}

export async function markAllOfficerNotificationsRead(token) {
  return getOfficerResource(
    "/officer/notifications/read-all",
    token,
    "Unable to mark notifications as read",
    { method: "PATCH" }
  );
}

export async function getOfficerAuditLogs(token) {
  return getOfficerResource(
    "/officer/audit-logs",
    token,
    "Unable to fetch audit logs"
  );
}

export async function getOfficerUsers(token) {
  return getOfficerResource(
    "/officer/users",
    token,
    "Unable to fetch users"
  );
}

export async function getOfficerRenewals(token) {
  return getOfficerResource(
    "/officer/renewals",
    token,
    "Unable to fetch renewals"
  );
}

export async function reviewOfficerRenewal(token, renewalId, status, reason) {
  return getOfficerResource(
    `/officer/renewals/${renewalId}/review`,
    token,
    "Unable to review renewal request",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason })
    }
  );
}

export async function getOfficerMasterData(token) {
  return getOfficerResource(
    "/officer/master-data",
    token,
    "Unable to fetch master data"
  );
}

export async function getOfficerReports(token) {
  return getOfficerResource(
    "/officer/reports",
    token,
    "Unable to fetch reports"
  );
}

export async function getOfficerProfile(token) {
  return getOfficerResource(
    "/officer/me",
    token,
    "Unable to fetch officer profile"
  );
}

export async function updateOfficerProfile(token, profile) {
  const response = await fetch(`${API_URL}/officer/me`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(profile)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to update officer profile");
  }
  return data;
}

export async function runOfficerAutomatedVerification(token, fdrId) {
  const response = await fetch(
    `${API_URL}/officer/fdrs/${fdrId}/run-verification`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to run automated verification");
  }
  return data;
}

export async function runOfficerBankVerification(token, fdrId) {
  const response = await fetch(
    `${API_URL}/officer/fdrs/${fdrId}/bank-verify`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || "Unable to run mock bank verification");
  }
  return data;
}
