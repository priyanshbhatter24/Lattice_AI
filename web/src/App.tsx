import { useEffect } from 'react'
import { useStore } from './store'
import { ScriptUpload } from './components/ScriptUpload'
import { SceneList } from './components/SceneList'
import { LocationGrid } from './components/LocationGrid'
import { Dashboard } from './components/Dashboard'
import { Film, MapPin, Search } from 'lucide-react'

function App() {
  const { currentScript, scenes, locations, connectSSE } = useStore()

  useEffect(() => {
    // Connect to SSE for real-time updates
    connectSSE()
  }, [connectSSE])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Film className="h-8 w-8 text-primary" />
              <h1 className="text-xl font-semibold">Location Scout AI</h1>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {locations.length} locations
              </span>
              <span className="flex items-center gap-1">
                <Search className="h-4 w-4" />
                {scenes.length} scenes
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!currentScript ? (
          // Upload View
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">
                Upload Your Script
              </h2>
              <p className="text-gray-600">
                Our AI will extract scenes and find matching filming locations
              </p>
            </div>
            <ScriptUpload />
          </div>
        ) : scenes.length > 0 && locations.length === 0 ? (
          // Scenes View (pre-search)
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900">
                {currentScript.title}
              </h2>
              <p className="text-gray-600">
                {scenes.length} scenes extracted - Select scenes to find locations
              </p>
            </div>
            <SceneList />
          </div>
        ) : (
          // Dashboard View (with locations)
          <Dashboard />
        )}
      </main>
    </div>
  )
}

export default App
