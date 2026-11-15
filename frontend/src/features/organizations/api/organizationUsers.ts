export type OrganizationUser = {
  id: number;
  organizationId: number;
  displayName: string;
  email: string;
  role: string;
};

function checkResponse(response: Response) {
  if (response.status === 401) {
    window.location.replace("/login");
    throw new Error("Your session expired. Sign in again.");
  }

  if (response.status === 403) {
    throw new Error("You do not have permission to do this.");
  }

  if (response.status === 404) {
    throw new Error("This customer could not be found.");
  }

  if (response.status === 409) {
    throw new Error("That email is already in use. Use a different email for this person.");
  }

  if (response.status === 400) {
    throw new Error(
      "Check the name, email and password. The password must be 72 bytes or shorter.",
    );
  }

  if (!response.ok) {
    throw new Error("That did not go through. Try again.");
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
