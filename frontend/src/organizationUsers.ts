export type OrganizationUser = {
  id: number;
  organizationId: number;
  displayName: string;
  email: string;
  role: string;
};

function checkResponse(response: Response) {
  if (response.status === 401) {
    throw new Error("Please log in again.");
  }

  if (response.status === 403) {
    throw new Error("You do not have permission for this action.");
  }

  if (response.status === 404) {
    throw new Error("Organization not found.");
  }

  if (response.status === 409) {
    throw new Error("Email is already in use or user data conflicts.");
  }

  if (response.status === 400) {
    throw new Error(
      "Check the name, email and password. Password must not exceed 72 bytes.",
    );
  }

  if (!response.ok) {
    throw new Error("The request failed. Please try again.");
  }
}

export async function getOrganizationUsers(
  organizationId: number,
): Promise<OrganizationUser[]> {
  const response = await fetch(`/api/organizations/${organizationId}/users`, {
    credentials: "same-origin",
  });

  checkResponse(response);

  return response.json();
}

export async function createOrganizationUser(
  organizationId: number,
  data: {
    displayName: string;
    email: string;
    password: string;
  },
): Promise<OrganizationUser> {
  const csrfResponse = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
  });

  checkResponse(csrfResponse);

  const csrf: { headerName: string; token: string } = await csrfResponse.json();

  const response = await fetch(`/api/organizations/${organizationId}/users`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify(data),
  });

  checkResponse(response);

  return response.json();
}
