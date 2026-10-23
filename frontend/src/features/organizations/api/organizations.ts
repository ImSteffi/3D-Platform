export type Organization = {
    id: number
    name: string
  }
  
  function checkResponse(response: Response) {
    if (response.status === 401) {
      window.location.replace('/login');
      throw new Error('Session expired.')
    }
  
    if (response.status === 403) {
      throw new Error('You do not have permission for this action.')
    }
  
    if (!response.ok) {
      throw new Error('The request failed. Please try again.')
    }
  }
  
  export async function getOrganizations(): Promise<Organization[]> {
    const response = await fetch('/api/organizations', {
      credentials: 'same-origin',
    })
  
    checkResponse(response)
  
    return response.json()
  }
  
  export async function createOrganization(
    name: string,
  ): Promise<Organization> {
    const csrfResponse = await fetch('/api/auth/csrf', {
      credentials: 'same-origin',
    })
  
    checkResponse(csrfResponse)
  
    const csrf: { headerName: string; token: string } =
      await csrfResponse.json()
  
    const response = await fetch('/api/organizations', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [csrf.headerName]: csrf.token,
      },
      body: JSON.stringify({ name }),
    })
  
    if (response.status === 400) {
      throw new Error('Enter an organization name of 1–200 characters.')
    }
  
    checkResponse(response)
  
    return response.json()
  }