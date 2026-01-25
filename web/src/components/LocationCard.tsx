import { useState } from 'react'
import { MapPin, DollarSign, ExternalLink, Phone, Star } from 'lucide-react'
import { MatchScore } from './MatchScore'

interface Location {
  id: string
  source: string
  name: string
  address: string
  images: string[]
  price: string
  source_url: string
}

interface Score {
  id: string
  scene_id: string
  visual_score: number
  functional_score: number
  logistics_score: number
  overall_score: number
  reasoning: string
}

interface LocationCardProps {
  location: Location
  score: number
  scores: Score[]
}

export function LocationCard({ location, score, scores }: LocationCardProps) {
  const [showDetails, setShowDetails] = useState(false)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  const images = location.images || []
  const hasImages = images.length > 0

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100'
    if (score >= 60) return 'text-yellow-600 bg-yellow-100'
    return 'text-red-600 bg-red-100'
  }

  const getSourceBadge = () => {
    switch (location.source) {
      case 'airbnb':
        return 'bg-pink-100 text-pink-700'
      case 'google_maps':
        return 'bg-blue-100 text-blue-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Image Carousel */}
      <div className="relative h-48 bg-gray-100">
        {hasImages ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={location.name}
              className="w-full h-full object-cover"
            />
            {images.length > 1 && (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {images.slice(0, 5).map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentImageIndex(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      i === currentImageIndex ? 'bg-white' : 'bg-white/50'
                    }`}
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            No images available
          </div>
        )}

        {/* Score Badge */}
        <div
          className={`absolute top-2 right-2 px-2 py-1 rounded-full font-semibold text-sm flex items-center gap-1 ${getScoreColor(score)}`}
        >
          <Star className="h-4 w-4" />
          {score}
        </div>

        {/* Source Badge */}
        <div
          className={`absolute top-2 left-2 px-2 py-1 rounded-full text-xs font-medium ${getSourceBadge()}`}
        >
          {location.source === 'google_maps' ? 'Google' : location.source}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 mb-1 line-clamp-1">
          {location.name}
        </h3>

        {location.address && (
          <p className="text-sm text-gray-500 flex items-center gap-1 mb-2">
            <MapPin className="h-4 w-4 flex-shrink-0" />
            <span className="line-clamp-1">{location.address}</span>
          </p>
        )}

        {location.price && (
          <p className="text-sm text-gray-600 flex items-center gap-1 mb-3">
            <DollarSign className="h-4 w-4 flex-shrink-0" />
            {location.price}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
          >
            {showDetails ? 'Hide Details' : 'View Details'}
          </button>

          {location.source_url && (
            <a
              href={location.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>

        {/* Expandable Details */}
        {showDetails && scores.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Match Scores</h4>
            {scores.map((s) => (
              <MatchScore key={s.id} score={s} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
