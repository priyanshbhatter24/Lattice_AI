interface Score {
  id: string
  scene_id: string
  visual_score: number
  functional_score: number
  logistics_score: number
  overall_score: number
  reasoning: string
}

interface MatchScoreProps {
  score: Score
}

export function MatchScore({ score }: MatchScoreProps) {
  const getBarColor = (value: number) => {
    if (value >= 80) return 'bg-green-500'
    if (value >= 60) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const ScoreBar = ({ label, value }: { label: string; value: number }) => (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getBarColor(value)}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )

  return (
    <div className="space-y-3 mb-4 last:mb-0">
      <div className="grid grid-cols-3 gap-3">
        <ScoreBar label="Visual" value={score.visual_score} />
        <ScoreBar label="Functional" value={score.functional_score} />
        <ScoreBar label="Logistics" value={score.logistics_score} />
      </div>

      {score.reasoning && (
        <p className="text-xs text-gray-500 italic">
          "{score.reasoning}"
        </p>
      )}
    </div>
  )
}
