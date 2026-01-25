import { useState } from 'react'
import { useStore } from '../store'
import { SceneCard } from './SceneCard'
import { MapPin, Search, Loader2, CheckSquare, Square } from 'lucide-react'

export function SceneList() {
  const {
    scenes,
    selectedScenes,
    toggleSceneSelection,
    selectAllScenes,
    clearSelections,
    startSearch,
    isSearching,
  } = useStore()

  const [searchLocation, setSearchLocation] = useState('Los Angeles, CA')

  const handleSearch = async () => {
    await startSearch(searchLocation)
  }

  const allSelected = selectedScenes.length === scenes.length

  return (
    <div className="space-y-6">
      {/* Search Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
              Search Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                id="location"
                value={searchLocation}
                onChange={(e) => setSearchLocation(e.target.value)}
                placeholder="Enter city or region"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex items-end gap-2">
            <button
              onClick={allSelected ? clearSelections : selectAllScenes}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
            >
              {allSelected ? (
                <CheckSquare className="h-5 w-5" />
              ) : (
                <Square className="h-5 w-5" />
              )}
              {allSelected ? 'Deselect All' : 'Select All'}
            </button>
            <button
              onClick={handleSearch}
              disabled={selectedScenes.length === 0 || isSearching}
              className={`
                px-6 py-2 rounded-lg font-medium flex items-center gap-2
                ${
                  selectedScenes.length === 0 || isSearching
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-primary text-white hover:bg-primary/90'
                }
              `}
            >
              {isSearching ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="h-5 w-5" />
                  Find Locations
                </>
              )}
            </button>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {selectedScenes.length} of {scenes.length} scenes selected
        </p>
      </div>

      {/* Scene Cards */}
      <div className="grid gap-4">
        {scenes.map((scene) => (
          <SceneCard
            key={scene.id}
            scene={scene}
            isSelected={selectedScenes.includes(scene.id)}
            onToggle={() => toggleSceneSelection(scene.id)}
          />
        ))}
      </div>
    </div>
  )
}
