import { useState } from 'react'
import { useStore } from '../store'
import { SceneList } from './SceneList'
import { LocationGrid } from './LocationGrid'
import { LayoutGrid, List, Map, Download, Loader2 } from 'lucide-react'

type View = 'grid' | 'list' | 'map'

export function Dashboard() {
  const { currentScript, scenes, locations, isSearching } = useStore()
  const [view, setView] = useState<View>('grid')

  const handleExport = () => {
    // Simple CSV export
    const headers = ['Name', 'Address', 'Source', 'Price', 'URL']
    const rows = locations.map((loc) => [
      loc.name,
      loc.address || '',
      loc.source,
      loc.price || '',
      loc.source_url || '',
    ])

    const csv = [headers, ...rows].map((row) => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `locations-${currentScript?.title || 'export'}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {currentScript?.title}
          </h2>
          <p className="text-gray-600">
            {scenes.length} scenes | {locations.length} locations found
            {isSearching && (
              <span className="ml-2 text-primary">
                <Loader2 className="inline h-4 w-4 animate-spin mr-1" />
                Searching...
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setView('grid')}
              className={`p-2 rounded ${view === 'grid' ? 'bg-white shadow' : ''}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-2 rounded ${view === 'list' ? 'bg-white shadow' : ''}`}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView('map')}
              className={`p-2 rounded ${view === 'map' ? 'bg-white shadow' : ''}`}
            >
              <Map className="h-4 w-4" />
            </button>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={locations.length === 0}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Scenes Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Scenes</h3>
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {scenes.map((scene) => (
                <div
                  key={scene.id}
                  className="p-3 bg-gray-50 rounded-lg"
                >
                  <p className="text-xs text-gray-500 mb-1">
                    Scene {scene.scene_number}
                  </p>
                  <p className="font-mono text-sm font-medium text-gray-900 line-clamp-1">
                    {scene.slugline}
                  </p>
                  {scene.mood && (
                    <span className="inline-block mt-2 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full">
                      {scene.mood}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Locations Panel */}
        <div className="lg:col-span-2">
          {view === 'grid' && <LocationGrid />}
          {view === 'list' && (
            <div className="bg-white rounded-lg border border-gray-200">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Location
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Price
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {locations.map((loc) => (
                    <tr key={loc.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{loc.name}</p>
                        <p className="text-sm text-gray-500">{loc.address}</p>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {loc.source}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {loc.price || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-sm font-medium rounded">
                          85
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {view === 'map' && (
            <div className="bg-white rounded-lg border border-gray-200 h-[600px] flex items-center justify-center text-gray-500">
              Map view coming soon
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
