const API_BASE_URL = "http://localhost:5000";

export async function getInstitutionFdrs(token) {
  const response = await fetch(
    `${API_BASE_URL}/api/fdr/my`,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to fetch FDRs"
    );
  }

  return data;
}

export async function getOfficerFdrs(token) {
  const response = await fetch(
    `${API_BASE_URL}/api/officer/fdrs`,
    {
      method: "GET",

      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data.message || "Failed to fetch officer FDRs"
    );
  }

  return data;
}