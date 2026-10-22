export type CurrentUser = {
  username: string;
};

type CsrfResponse = {
  headerName: string;
  token: string;
};

export async function login(username: string, password: string): Promise<void> {
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
    body: new URLSearchParams({ username, password }),
  });

  if (response.status === 401) {
    throw new Error("Wrong username or password.");
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
