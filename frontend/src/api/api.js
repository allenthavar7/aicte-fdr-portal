const API_BASE_URL = import.meta.env.VITE_API_URL;

export async function getInstitutionFdrs(token) {
  const response = await fetch(
    `${API_BASE_URL}/fdr/my`,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message || "Failed to fetch FDRs"
    );
  }

  if (!data) {
    throw new Error("Invalid response while fetching FDRs");
  }

  return data;
}

export async function getOfficerFdrs(token) {
  const response = await fetch(
    `${API_BASE_URL}/officer/fdrs`,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      data?.message || "Failed to fetch officer FDRs"
    );
  }

  if (!data) {
    throw new Error("Invalid response while fetching officer FDRs");
  }

  return data;
}

export async function getInstitutionFdrDocument(token, fdrId, documentId) {
  const response = await fetch(
    `${API_BASE_URL}/fdr/${fdrId}/documents/${documentId}`,
    {
      method: "GET",
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

async function institutionRequest(path, token, fallbackMessage, options = {}) {
  const response = await fetch(`${API_BASE_URL}/institution${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`,
      ...(options.body ? { "Content-Type": "application/json" } : {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || fallbackMessage);
  }
  if (!data) {
    throw new Error("Invalid response from institution API");
  }
  return data;
}

export async function getInstitutionRenewals(token) {
  return institutionRequest(
    "/renewals",
    token,
    "Unable to load renewal requests"
  );
}

export async function getEligibleInstitutionRenewalFdrs(token) {
  return institutionRequest(
    "/renewals/eligible-fdrs",
    token,
    "Unable to load FDR renewal eligibility"
  );
}

export async function getInstitutionRenewal(token, renewalId) {
  return institutionRequest(
    `/renewals/${renewalId}`,
    token,
    "Unable to load renewal details"
  );
}

export async function submitInstitutionRenewal(token, renewalRequest) {
  return institutionRequest(
    "/renewals",
    token,
    "Unable to submit renewal request",
    {
      method: "POST",
      body: JSON.stringify(renewalRequest)
    }
  );
}

export async function getInstitutionNotifications(token) {
  return institutionRequest(
    "/notifications",
    token,
    "Unable to load notifications"
  );
}

export async function markInstitutionNotificationRead(token, notificationId) {
  return institutionRequest(
    `/notifications/${notificationId}/read`,
    token,
    "Unable to mark notification as read",
    { method: "PATCH" }
  );
}

export async function markAllInstitutionNotificationsRead(token) {
  return institutionRequest(
    "/notifications/read-all",
    token,
    "Unable to mark notifications as read",
    { method: "PATCH" }
  );
}