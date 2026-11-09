interface ProgressIndicatorProps {
  currentStep: number
  totalSteps: number
  size?: 'sm' | 'md' | 'lg'
  activeColor?: string
  inactiveColor?: string
}

const SIZE_DOT_CLASSES: Record<'sm' | 'md' | 'lg', string> = {
  sm: 'w-2 h-2',
  md: 'w-3 h-3',
  lg: 'w-4 h-4',
}

export function ProgressIndicator({
  currentStep,
  totalSteps,
  size = 'md',
  activeColor = 'brand-600',
  inactiveColor = 'gray-300',
}: ProgressIndicatorProps) {
  return (
    <div className="flex items-center space-x-2" role="progressbar" aria-valuenow={currentStep} aria-valuemin={1} aria-valuemax={totalSteps}>
      {Array.from({ length: totalSteps }, (_, i) => {
        const step = i + 1
        const isActive = step <= currentStep
        return (
          <div
            key={step}
            className={`rounded-full transition-colors duration-300 ${SIZE_DOT_CLASSES[size]} ${
              isActive ? `bg-${activeColor}` : `bg-${inactiveColor}`
            }`}
            aria-label={`Step ${step} of ${totalSteps}${isActive ? ', complete' : ''}`}
          />
        )
      })}
    </div>
  )
}
