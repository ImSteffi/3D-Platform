export type Organization = {
    id: number
    name: string
  }
  
  function checkResponse(response: Response) {
    if (response.status === 401) {
      window.location.replace('/login');
      throw new Error('Your session expired. Sign in again.')
    }
  
    if (response.status === 403) {
      throw new Error('You do not have permission to do this.')
    }
  
    if (!response.ok) {
      throw new Error('That did not go through. Try again.')
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
      throw new Error('Enter a customer name of 1 to 200 characters.')
    }
  
    checkResponse(response)
  
    return response.json()
  }