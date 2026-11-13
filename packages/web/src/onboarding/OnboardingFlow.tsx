import { useState, useCallback, useEffect } from 'react'
import {
  ONBOARDING_STEPS,
  type OnboardingFlowProps,
} from './types'
import OnboardingStep from './OnboardingStep'
import AirportSelector from './AirportSelector'
import PermissionPrompt from './PermissionPrompt'
import TutorialCarousel from './TutorialCarousel'

const STORAGE_KEY = 'flyby.onboarding.complete'

export function OnboardingFlow({
  onComplete,
  onSkip,
  initialStep,
}: OnboardingFlowProps) {
  const [stepIndex, setStepIndex] = useState<number>(
    initialStep ? ONBOARDING_STEPS.findIndex((s) => s.key === initialStep) : 0
  )
  const [airportCode, setAirportCode] = useState<string | null>(null)

  const currentStep = ONBOARDING_STEPS[stepIndex]

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, 'true')
    void onComplete()
  }, [stepIndex >= ONBOARDING_STEPS.length, onComplete])

  const handleNext = useCallback(() => {
    if (!currentStep) return
    setStepIndex((i) => i + 1)
  }, [currentStep])

  const handleSkip = useCallback(() => {
    void onSkip()
    setStepIndex(ONBOARDING_STEPS.length)
  }, [onSkip])

  const handleAirportSelect = useCallback((code: string) => {
    setAirportCode(code)
    setStepIndex((i) => i + 1)
  }, [])

  const handleLocationAllow = useCallback(() => {
    setStepIndex((i) => i + 1)
  }, [])

  const handleLocationDeny = useCallback(() => {
    setStepIndex((i) => i + 1)
  }, [])

  const handleNotificationAllow = useCallback(() => {
    setStepIndex((i) => i + 1)
  }, [])

  const handleNotificationDeny = useCallback(() => {
    setStepIndex((i) => i + 1)
  }, [])

  if (stepIndex >= ONBOARDING_STEPS.length) return null

  const stepConfig = currentStep

  return (
    <section
      className="fixed inset-0 z-50 bg-slate-50 dark:bg-slate-900 min-h-screen"
      role="dialog"
      aria-modal="true"
      aria-label="Onboarding"
    >
      <div className="max-w-xl mx-auto h-full flex flex-col py-6">
        <button
          type="button"
          onClick={handleSkip}
          className="self-end text-slate-500 dark:text-slate-400 text-sm underline hover:no-underline px-4"
          aria-label="Skip onboarding"
        >
          Skip
        </button>
        <main className="flex-1 flex flex-col items-center justify-center p-4 space-y-8">
          {stepConfig.key === 'checkpoint-selection' && (
            <AirportSelector
              onSelect={handleAirportSelect}
              onSkip={handleNext}
              preselected={airportCode || undefined}
            />
          )}
          {(stepConfig.key === 'airport-permission' ||
            stepConfig.key === 'notification-permission') && (
            <PermissionPrompt
              type={stepConfig.key === 'airport-permission' ? 'location' : 'notification'}
              onAllow={
                stepConfig.key === 'airport-permission'
                  ? handleLocationAllow
                  : handleNotificationAllow
              }
              onDeny={
                stepConfig.key === 'airport-permission'
                  ? handleLocationDeny
                  : handleNotificationDeny
              }
            />
          )}
          {stepConfig.key === 'reporting-tutorial' && (
            <TutorialCarousel onComplete={handleNext} onSkip={handleNext} />
          )}
          {stepConfig.key === 'welcome' ||
            stepConfig.key === 'complete' ? (
            <OnboardingStep
              step={stepConfig}
              onNext={handleNext}
              onSkip={handleSkip}
            />
          ) : null}
        </main>
      </div>
    </section>
  )
}
