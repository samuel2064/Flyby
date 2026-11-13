import { useState, useCallback } from 'react'
import type { TutorialCarouselProps } from './types'

const SLIDES = [
  {
    headline: 'Report a wait in 10 seconds.',
    body: 'Tap Report, pick your wait time, submit. No typing, no signup.',
    illustration: (
      <svg aria-hidden="true" className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 8h10M7 12h4M7 16h7M9 20l3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    headline: 'Choose Standard or PreCheck.',
    body: 'Wait times differ by lane — pick the one you are in.',
    illustration: (
      <svg aria-hidden="true" className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="8" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="13" y="3" width="8" height="18" rx="2" ry="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    headline: 'Your report helps others skip the line.',
    body: 'Reports update live for everyone at this checkpoint.',
    illustration: (
      <svg aria-hidden="true" className="h-32 w-auto mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 2a10 10 0 00-9.34 16.66M12 2a10 10 0 019.34 16.66M5 12a1 1 0 011-1h5M22 12a1 1 0 01-1 1h-5M12 5a1 1 0 01-1 1v5M12 17a1 1 0 01-1-1v-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
]

export default function TutorialCarousel({
  onComplete,
  onSkip,
}: TutorialCarouselProps) {
  const [slide, setSlide] = useState(0)

  const isLast = slide === SLIDES.length - 1
  const current = SLIDES[slide]

  const handleNext = useCallback(() => {
    if (isLast) {
      onComplete()
    } else {
      setSlide((s) => s + 1)
    }
  }, [isLast, onComplete])

  return (
    <section className="flex flex-col items-center justify-center text-center space-y-6 w-full max-w-xl" role="region" aria-label="Reporting tutorial">
      <div className="relative h-48 w-full flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-200 ease-in-out">
          {current.illustration}
        </div>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
        {current.headline}
      </h2>
      <p className="text-lg text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
        {current.body}
      </p>
      <div className="flex items-center space-x-1.5">
        {[0, 1, 2].map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Slide ${i + 1} of 3`}
            aria-current={slide === i ? 'true' : undefined}
            className={`w-2 h-2 rounded-full transition-colors duration-200 ${slide === i ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-600'}`}
            onClick={() => setSlide(i)}
          />
        ))}
      </div>
      <div className="flex w-full gap-3 pt-4">
        {!isLast ? (
          <>
            <button
              type="button"
              onClick={onSkip}
              className="flex-1 text-sm text-slate-500 dark:text-slate-400 underline hover:no-underline px-4 py-2 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2"
              aria-label="Skip tutorial"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
              aria-label={`Next, tutorial slide ${slide + 2}`}
            >
              Next
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px]"
            aria-label="I Got It, finish tutorial"
          >
            I Got It
          </button>
        )}
      </div>
    </section>
  )
}
