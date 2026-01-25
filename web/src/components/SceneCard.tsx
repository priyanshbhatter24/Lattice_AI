import { Sun, Moon, Sunrise, Sunset, Home, Trees, CheckCircle, Circle } from 'lucide-react'

interface Scene {
  id: string
  slugline: string
  int_ext: string
  time_of_day: string
  description: string
  mood: string
  period: string
  requirements: string[]
  scene_number: number
}

interface SceneCardProps {
  scene: Scene
  isSelected: boolean
  onToggle: () => void
}

export function SceneCard({ scene, isSelected, onToggle }: SceneCardProps) {
  const getTimeIcon = () => {
    switch (scene.time_of_day?.toLowerCase()) {
      case 'day':
        return <Sun className="h-4 w-4 text-yellow-500" />
      case 'night':
        return <Moon className="h-4 w-4 text-indigo-500" />
      case 'morning':
        return <Sunrise className="h-4 w-4 text-orange-400" />
      case 'sunset':
      case 'evening':
        return <Sunset className="h-4 w-4 text-orange-500" />
      default:
        return <Sun className="h-4 w-4 text-gray-400" />
    }
  }

  const getLocationIcon = () => {
    return scene.int_ext?.toLowerCase() === 'interior' ? (
      <Home className="h-4 w-4 text-gray-500" />
    ) : (
      <Trees className="h-4 w-4 text-green-500" />
    )
  }

  return (
    <div
      onClick={onToggle}
      className={`
        bg-white rounded-lg border-2 p-4 cursor-pointer transition-all
        ${isSelected ? 'border-primary bg-primary/5' : 'border-gray-200 hover:border-gray-300'}
      `}
    >
      <div className="flex items-start gap-4">
        {/* Selection Indicator */}
        <div className="pt-1">
          {isSelected ? (
            <CheckCircle className="h-6 w-6 text-primary" />
          ) : (
            <Circle className="h-6 w-6 text-gray-300" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-gray-500">
              Scene {scene.scene_number}
            </span>
            {getLocationIcon()}
            {getTimeIcon()}
          </div>

          {/* Slugline */}
          <h3 className="font-mono text-sm font-semibold text-gray-900 mb-2">
            {scene.slugline}
          </h3>

          {/* Description */}
          {scene.description && (
            <p className="text-sm text-gray-600 mb-3 line-clamp-2">
              {scene.description}
            </p>
          )}

          {/* Tags */}
          <div className="flex flex-wrap gap-2">
            {scene.mood && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                {scene.mood}
              </span>
            )}
            {scene.period && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                {scene.period}
              </span>
            )}
            {scene.requirements?.slice(0, 3).map((req, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full"
              >
                {req}
              </span>
            ))}
            {scene.requirements?.length > 3 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                +{scene.requirements.length - 3} more
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
