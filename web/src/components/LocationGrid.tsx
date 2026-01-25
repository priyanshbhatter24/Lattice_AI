import { useStore } from '../store'
import { LocationCard } from './LocationCard'

export function LocationGrid() {
  const { locations, matchScores } = useStore()

  // Sort locations by their best match score
  const sortedLocations = [...locations].sort((a, b) => {
    const aScore = matchScores
      .filter((s) => s.location_id === a.id)
      .reduce((max, s) => Math.max(max, s.overall_score), 0)
    const bScore = matchScores
      .filter((s) => s.location_id === b.id)
      .reduce((max, s) => Math.max(max, s.overall_score), 0)
    return bScore - aScore
  })

  if (locations.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No locations found yet. Start a search to find matching locations.
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {sortedLocations.map((location) => {
        const scores = matchScores.filter((s) => s.location_id === location.id)
        const bestScore = scores.reduce(
          (max, s) => Math.max(max, s.overall_score),
          0
        )
        return (
          <LocationCard
            key={location.id}
            location={location}
            score={bestScore}
            scores={scores}
          />
        )
      })}
    </div>
  )
}
