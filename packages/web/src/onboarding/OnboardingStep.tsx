import type { OnboardingStepConfig } from './types'

interface Props {
  step: OnboardingStepConfig
  onNext: () => void
  onSkip: () => void
}

export default function OnboardingStep({
  step,
  onNext,
  onSkip,
}: Props) {
  const hasSecondary = Boolean(step.secondaryCta && step.skipAllowed)
  const showSkip = step.skipAllowed && !hasSecondary

  return (
    <section className="flex flex-col items-center justify-center text-center space-y-6 w-full max-w-xl">
      <div aria-hidden="true" className="h-48 w-auto mx-auto opacity-30">
        <svg
          viewBox="0 0 200 200"
          className="w-full h-auto"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="100" cy="100" r="80" className="text-slate-200 dark:text-slate-700" />
          <path d="M100 30v140M30 100h140" className="text-slate-300 dark:text-slate-600" />
        </svg>
      </div>
      <h1
        className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100"
        aria-level={1}
      >
        {step.title}
      </h1>
      <p className="text-lg text-slate-600 dark:text-slate-300 mb-8 max-w-lg mx-auto leading-relaxed">
        {step.subhead}
      </p>
      {!hasSecondary && (
        <button
          type="button"
          onClick={onNext}
          className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
          aria-label={step.primaryCta}
        >
          {step.primaryCta}
        </button>
      )}
      {showSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="mt-3 w-full text-sm text-slate-500 dark:text-slate-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
          aria-label="Skip onboarding"
        >
          {step.secondaryCta}
        </button>
      )}
      {hasSecondary && (
        <>
          <button
            type="button"
            onClick={onNext}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
          >
            {step.primaryCta}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="mt-3 w-full text-sm text-slate-500 dark:text-slate-400 underline hover:no-underline px-8 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
            aria-label={`Skip ${step.key.replace('-', ' ')}`}
          >
            {step.secondaryCta}
          </button>
        </>
      )}
      {step.key === 'complete' && (
        <p className="text-sm text-slate-500 dark:text-slate-400 sr-only" aria-live="assertive">
          Onboarding complete. Welcome to Flyby.
        </p>
      )}
    </section>
  )
}
