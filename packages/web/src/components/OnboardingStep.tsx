interface OnboardingStepProps {
  step: number
  totalSteps?: number
  title: string
  description: string
  illustration?: React.ComponentType<{ className?: string }>
  primaryAction: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
  showProgress?: boolean
}

export function OnboardingStep({
  step,
  totalSteps = 3,
  title,
  description,
  illustration: Illustration,
  primaryAction,
  secondaryAction,
  showProgress = true,
}: OnboardingStepProps) {
  return (
    <section className="flex flex-col items-center justify-center text-center space-y-6">
      {showProgress && (
        <div className="flex items-center space-x-2 mb-4">
          {Array.from({ length: totalSteps }, (_, i) => {
            const s = i + 1
            return (
              <div
                key={s}
                className={`h-2.5 w-2.5 rounded-full transition-colors duration-300 ${s <= step ? 'bg-brand-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                aria-label={`Step ${s} of ${totalSteps}${s <= step ? ', complete' : ''}`}
              />
            )
          })}
        </div>
      )}
      {Illustration && <Illustration className="mb-8 h-48 w-auto" />}
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
      <p className="text-lg text-gray-600 dark:text-gray-300 mb-6 max-w-xl mx-auto">
        {description}
      </p>
      <button
        type="button"
        onClick={primaryAction.onClick}
        className="mt-6 w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
      >
        {primaryAction.label}
      </button>
      {secondaryAction && (
        <button
          type="button"
          onClick={secondaryAction.onClick}
          className="mt-4 text-sm text-gray-600 dark:text-gray-300 underline hover:no-underline"
        >
          {secondaryAction.label}
        </button>
      )}
    </section>
  )
}
