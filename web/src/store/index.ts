import { create } from 'zustand'
import { api } from '../lib/api'

interface Script {
  id: string
  title: string
  content: string
  created_at: string
}

interface Scene {
  id: string
  script_id: string
  slugline: string
  int_ext: string
  time_of_day: string
  description: string
  mood: string
  period: string
  requirements: string[]
  scene_number: number
}

interface Location {
  id: string
  source: string
  source_id: string
  name: string
  address: string
  coordinates: { lat: number; lng: number } | null
  description: string
  images: string[]
  price: string
  amenities: string[]
  source_url: string
}

interface MatchScore {
  id: string
  scene_id: string
  location_id: string
  visual_score: number
  functional_score: number
  logistics_score: number
  overall_score: number
  reasoning: string
}

interface Store {
  // State
  currentScript: Script | null
  scenes: Scene[]
  locations: Location[]
  matchScores: MatchScore[]
  selectedScenes: string[]
  isLoading: boolean
  isSearching: boolean
  error: string | null

  // Actions
  setCurrentScript: (script: Script | null) => void
  setScenes: (scenes: Scene[]) => void
  addLocation: (location: Location) => void
  addMatchScore: (score: MatchScore) => void
  toggleSceneSelection: (sceneId: string) => void
  selectAllScenes: () => void
  clearSelections: () => void
  setLoading: (loading: boolean) => void
  setSearching: (searching: boolean) => void
  setError: (error: string | null) => void
  reset: () => void

  // Async Actions
  uploadScript: (title: string, content: string) => Promise<void>
  startSearch: (location: string) => Promise<void>
  connectSSE: () => void
}

export const useStore = create<Store>((set, get) => ({
  // Initial State
  currentScript: null,
  scenes: [],
  locations: [],
  matchScores: [],
  selectedScenes: [],
  isLoading: false,
  isSearching: false,
  error: null,

  // Actions
  setCurrentScript: (script) => set({ currentScript: script }),
  setScenes: (scenes) => set({ scenes }),
  addLocation: (location) =>
    set((state) => ({ locations: [...state.locations, location] })),
  addMatchScore: (score) =>
    set((state) => ({ matchScores: [...state.matchScores, score] })),
  toggleSceneSelection: (sceneId) =>
    set((state) => ({
      selectedScenes: state.selectedScenes.includes(sceneId)
        ? state.selectedScenes.filter((id) => id !== sceneId)
        : [...state.selectedScenes, sceneId],
    })),
  selectAllScenes: () =>
    set((state) => ({
      selectedScenes: state.scenes.map((s) => s.id),
    })),
  clearSelections: () => set({ selectedScenes: [] }),
  setLoading: (isLoading) => set({ isLoading }),
  setSearching: (isSearching) => set({ isSearching }),
  setError: (error) => set({ error }),
  reset: () =>
    set({
      currentScript: null,
      scenes: [],
      locations: [],
      matchScores: [],
      selectedScenes: [],
      isLoading: false,
      isSearching: false,
      error: null,
    }),

  // Async Actions
  uploadScript: async (title, content) => {
    set({ isLoading: true, error: null })
    try {
      const response = await api.uploadScript(title, content)
      set({
        currentScript: response.script,
        scenes: response.scenes,
        selectedScenes: response.scenes.map((s: Scene) => s.id),
        isLoading: false,
      })
    } catch (err) {
      set({ error: 'Failed to upload script', isLoading: false })
      throw err
    }
  },

  startSearch: async (location) => {
    const { selectedScenes } = get()
    if (selectedScenes.length === 0) {
      set({ error: 'Please select at least one scene' })
      return
    }

    set({ isSearching: true, error: null })
    try {
      await api.startSearch(selectedScenes, location)
    } catch (err) {
      set({ error: 'Failed to start search', isSearching: false })
      throw err
    }
  },

  connectSSE: () => {
    const eventSource = new EventSource('/api/events?client_id=default')

    eventSource.addEventListener('location_found', (event) => {
      const data = JSON.parse(event.data)
      get().addLocation(data.location)
    })

    eventSource.addEventListener('location_scored', (event) => {
      const data = JSON.parse(event.data)
      get().addMatchScore(data.score)
    })

    eventSource.addEventListener('search_completed', () => {
      set({ isSearching: false })
    })

    eventSource.addEventListener('error', () => {
      console.error('SSE connection error')
    })
  },
}))
