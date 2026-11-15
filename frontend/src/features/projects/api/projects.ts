export type Project = {
  id: number
  organizationId: number
  name: string
}

function checkResponse(response: Response) {
  if (response.status === 401) {
    window.location.replace('/login')
    throw new Error('Your session expired. Sign in again.')
  }
  if (response.status === 403) {
    throw new Error('You do not have permission to do this.')
  }
  if (response.status === 404) {
    throw new Error('This customer could not be found.')
  }
  if (response.status === 400) {
    throw new Error('Enter a space name of 1 to 200 characters.')
  }
  if (!response.ok) {
    throw new Error('That did not go through. Try again.')
  }
}

export async function getProjects(organizationId: number): Promise<Project[]> {
  const response = await fetch(`/api/organizations/${organizationId}/projects`, {
    credentials: 'same-origin',
  })
  checkResponse(response)
  return response.json()
}

export async function createProject(organizationId: number, name: string): Promise<Project> {
  const csrfResponse = await fetch('/api/auth/csrf', {
    credentials: 'same-origin',
  })
  checkResponse(csrfResponse)
  const csrf: { headerName: string; token: string } = await csrfResponse.json()

  const response = await fetch(`/api/organizations/${organizationId}/projects`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify({ name }),
  })
  checkResponse(response)
  return response.json()
}
