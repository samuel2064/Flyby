import { useState } from 'react'

interface SubscriptionCheckoutProps {
  price?: string
  billingDetails?: { today: string; startsAfter: string }
  showMarketingOpts?: boolean
  onSubmit: (paymentData: { token: string; email: string }) => void
  onCancel?: () => void
  isLoading?: boolean
  error?: string | null
}

export function SubscriptionCheckout({
  price = '$.99/month after 30-day free trial',
  billingDetails = { today: '$0.00 today', startsAfter: '$.99 starts after trial' },
  showMarketingOpts = true,
  onSubmit,
  onCancel,
  isLoading = false,
  error = null,
}: SubscriptionCheckoutProps) {
  const [email, setEmail] = useState('')
  const [cardToken, setCardToken] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    onSubmit({ token: cardToken, email })
  }

  return (
    <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
      {error && (
        <div
          className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded"
          role="alert"
        >
          {error}
        </div>
      )}
      <div className="text-2xl font-bold mb-2 text-slate-900 dark:text-slate-100">
        {price}
      </div>
      <p className={`text-sm text-gray-500 dark:text-gray-400 mb-4`}>
        {billingDetails.today} · {billingDetails.startsAfter}
      </p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="mb-4">
          <label htmlFor="checkout-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Email
          </label>
          <input
            id="checkout-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            disabled={isLoading}
          />
        </div>
        <div className="mb-4">
          <label htmlFor="checkout-card" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Card
          </label>
          <div id="checkout-card" className="h-10 px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20">
            {/* Stripe Elements would mount here */}
            <input
              type="text"
              readOnly
              placeholder="Card number, expiry, CVC…"
              className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
              onChange={(e) => setCardToken(e.target.value)}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Securely processed by Stripe
          </p>
        </div>
        {showMarketingOpts && (
          <div className="flex items-start space-x-2 text-sm text-gray-600 dark:text-gray-300 mb-6">
            <input
              id="checkout-marketing"
              type="checkbox"
              className="h-4 w-4 text-brand-600 bg-gray-100 dark:bg-slate-600 border-gray-300 dark:border-slate-600 rounded focus:ring-brand-500 focus:outline-none"
            />
            <label htmlFor="checkout-marketing" className="text-sm">
              I’d like to receive travel tips and offers
            </label>
          </div>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className={`w-full px-6 py-3 rounded-lg text-white font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed ${
            isLoading ? 'opacity-70 pointer-events-none' : 'bg-gradient-to-r from-brand-600 to-brand-700 hover:opacity-90'
          }`}
        >
          {isLoading ? 'Processing…' : 'Pay now'}
        </button>
      </form>
      {onCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-4 block text-sm text-gray-500 dark:text-gray-400 underline hover:no-underline"
        >
          Cancel
        </button>
      )}
    </section>
  )
}
