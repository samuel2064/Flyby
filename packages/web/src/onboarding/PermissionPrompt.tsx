import { useState, useEffect } from 'react'
import type { PermissionPromptProps } from './types'

const LOCATION_ILLUSTRATION = (
  <svg aria-hidden="true" className="h-16 w-16 mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="10" r="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const NOTIFICATION_ILLUSTRATION = (
  <svg aria-hidden="true" className="h-16 w-16 mx-auto text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13.73 21a2 2 0 01-3.46 0" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export default function PermissionPrompt({
  type,
  onAllow,
  onDeny,
}: PermissionPromptProps) {
  const [status, setStatus] = useState<'default' | 'granted' | 'denied'>('default')
  const isLocation = type === 'location'

  useEffect(() => {
    const timer = setTimeout(() => setStatus('default'), 0)
    return () => clearTimeout(timer)
  }, [])

  const illustration = isLocation ? LOCATION_ILLUSTRATION : NOTIFICATION_ILLUSTRATION
  const headline = isLocation ? 'Find your nearest airport.' : 'Get alerted when waits spike.'
  const subhead = isLocation
    ? 'Flyby uses your location to show wait times at nearby checkpoints. You can change this anytime in Settings.'
    : "We'll notify you when a saved checkpoint's wait time jumps above your threshold."
  const primaryLabel = isLocation ? 'Allow Location' : 'Allow Alerts'
  const secondaryLabel = 'Not Now'

  const handleAllow = () => {
    setStatus('granted')
    onAllow()
  }

  const handleDeny = () => {
    setStatus('denied')
    onDeny()
  }

  return (
    <section className="flex flex-col items-center justify-center text-center space-y-6 w-full max-w-xl">
      <div className={`h-16 w-16 mx-auto ${status === 'granted' ? 'text-green-500' : status === 'denied' ? 'text-slate-400' : 'text-slate-400'} transition-colors duration-300`}>
        {illustration}
        {status === 'granted' && (
          <svg className="absolute -right-1 -bottom-1 h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        )}
        {status === 'denied' && (
          <svg className="absolute -right-1 -bottom-1 h-5 w-5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{headline}</h2>
      <p className="text-lg text-slate-600 dark:text-slate-300 max-w-lg mx-auto leading-relaxed">
        {subhead}
      </p>
      <div className="flex flex-col gap-3 w-full">
        <button
          type="button"
          onClick={handleAllow}
          className={`w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-8 py-4 rounded-xl font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 min-h-[48px] ${status === 'granted' ? 'opacity-100 ring-2 ring-green-500' : ''}`}
          aria-label={isLocation ? 'Allow location access' : 'Allow push notifications for wait-time alerts'}
        >
          {primaryLabel}
        </button>
        <button
          type="button"
          onClick={handleDeny}
          className={`w-full text-sm text-slate-500 dark:text-slate-400 underline hover:no-underline px-8 py-3 rounded-xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 ${status === 'denied' ? 'opacity-100' : ''}`}
          aria-label={isLocation ? 'Not now, continue without location' : 'Not now, continue without alerts'}
        >
          {secondaryLabel}
        </button>
      </div>
      {status === 'granted' && (
        <p className="text-sm text-green-600 dark:text-green-400" aria-live="polite">
          {isLocation ? 'Location access granted' : 'Notifications enabled'}
        </p>
      )}
      {status === 'denied' && (
        <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
          {isLocation ? 'Location access denied' : 'Notifications disabled'}
        </p>
      )}
    </section>
  )
}
