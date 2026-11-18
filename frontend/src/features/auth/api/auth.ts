export type CurrentUser = {
  displayName: string;
  email: string;
  platformAdmin: boolean;
  /** The one admin who adds and removes the other admins. */
  owner: boolean;
  organizationNames: string[];
};

type CsrfResponse = {
  headerName: string;
  token: string;
};

export async function login(email: string, password: string): Promise<void> {
  const csrfResponse = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
  });

  if (!csrfResponse.ok) {
    throw new Error("Failed to prepare login.");
  }

  const csrf: CsrfResponse = await csrfResponse.json();

  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      [csrf.headerName]: csrf.token,
    },
    body: new URLSearchParams({
      email: email.trim(),
      password,
    }),
  });

  if (response.status === 429) {
    throw new Error("Too many sign-in attempts. Wait 15 minutes and try again.");
  }

  if (response.status === 401) {
    throw new Error("Wrong email or password.");
  }

  if (response.status !== 204) {
    throw new Error("Login failed.");
  }
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Failed to load user data.");
  }

  return response.json();
}

export async function logout(): Promise<void> {
  const csrfResponse = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
  });

  if (!csrfResponse.ok) {
    throw new Error("Failed to prepare logout.");
  }

  const csrf: CsrfResponse = await csrfResponse.json();

  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      [csrf.headerName]: csrf.token,
    },
  });

  if (response.status !== 204) {
    throw new Error("Logout failed.");
  }
}
