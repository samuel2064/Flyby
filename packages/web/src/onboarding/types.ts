export type OnboardingStepKey =
  | 'welcome'
  | 'airport-permission'
  | 'checkpoint-selection'
  | 'reporting-tutorial'
  | 'notification-permission'
  | 'complete'

export interface OnboardingStepConfig {
  key: OnboardingStepKey
  title: string
  subhead: string
  primaryCta: string
  secondaryCta?: string
  skipAllowed: boolean
}

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    key: 'welcome',
    title: 'Know before you go.',
    subhead: 'Live security wait times at every checkpoint, reported by travelers like you.',
    primaryCta: 'Get Started',
    secondaryCta: 'Skip',
    skipAllowed: true,
  },
  {
    key: 'airport-permission',
    title: 'Find your nearest airport.',
    subhead: 'Flyby uses your location to show wait times at nearby checkpoints. You can change this anytime in Settings.',
    primaryCta: 'Allow Location',
    secondaryCta: 'Not Now',
    skipAllowed: true,
  },
  {
    key: 'checkpoint-selection',
    title: 'Pick your airport',
    subhead: "We'll show wait times for your checkpoints and let you report in 10 seconds.",
    primaryCta: 'Select Airport',
    secondaryCta: 'Skip',
    skipAllowed: true,
  },
  {
    key: 'reporting-tutorial',
    title: 'Report a wait in 10 seconds.',
    subhead: 'Tap Report, pick your wait time, submit. No typing, no signup.',
    primaryCta: 'Next',
    secondaryCta: 'Skip',
    skipAllowed: true,
  },
  {
    key: 'notification-permission',
    title: 'Get alerted when waits spike.',
    subhead: "We'll notify you when a saved checkpoint's wait time jumps above your threshold.",
    primaryCta: 'Allow Alerts',
    secondaryCta: 'Not Now',
    skipAllowed: true,
  },
  {
    key: 'complete',
    title: "You're all set.",
    subhead: 'Your airport wait times are one tap away.',
    primaryCta: 'Go to App',
    secondaryCta: 'Settings',
    skipAllowed: false,
  },
]

export interface OnboardingFlowProps {
  onComplete: () => void
  onSkip: () => void
  initialStep?: OnboardingStepKey
}

export interface OnboardingStepProps {
  step: OnboardingStepConfig
  onNext: () => void
  onSkip: () => void
  data?: Record<string, unknown>
}

export interface AirportSelectorProps {
  onSelect: (code: string) => void
  onSkip: () => void
  preselected?: string
}

export interface PermissionPromptProps {
  type: 'location' | 'notification'
  onAllow: () => void
  onDeny: () => void
}

export interface TutorialCarouselProps {
  onComplete: () => void
  onSkip: () => void
}
