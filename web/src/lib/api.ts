const API_BASE = '/api'

export const api = {
  async uploadScript(title: string, content: string) {
    const formData = new FormData()
    formData.append('title', title)
    formData.append('content', content)

    const response = await fetch(`${API_BASE}/scripts/`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Failed to upload script')
    }

    return response.json()
  },

  async getScript(scriptId: string) {
    const response = await fetch(`${API_BASE}/scripts/${scriptId}`)
    if (!response.ok) {
      throw new Error('Failed to fetch script')
    }
    return response.json()
  },

  async getScenes(scriptId?: string) {
    const url = scriptId
      ? `${API_BASE}/scenes?script_id=${scriptId}`
      : `${API_BASE}/scenes`
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error('Failed to fetch scenes')
    }
    return response.json()
  },

  async startSearch(
    sceneIds: string[],
    location: string,
    sources: string[] = ['airbnb', 'google']
  ) {
    const response = await fetch(`${API_BASE}/search/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scene_ids: sceneIds,
        location,
        sources,
        max_results: 20,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to start search')
    }

    return response.json()
  },

  async getLocations() {
    const response = await fetch(`${API_BASE}/locations/`)
    if (!response.ok) {
      throw new Error('Failed to fetch locations')
    }
    return response.json()
  },

  async getLocation(locationId: string) {
    const response = await fetch(`${API_BASE}/locations/${locationId}`)
    if (!response.ok) {
      throw new Error('Failed to fetch location')
    }
    return response.json()
  },

  async initiateCall(locationId: string, phoneNumber: string) {
    const response = await fetch(`${API_BASE}/outreach/call`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        location_id: locationId,
        phone_number: phoneNumber,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to initiate call')
    }

    return response.json()
  },
}
