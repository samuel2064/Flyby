type SubscriptionStatus = 'active' | 'trial' | 'expired' | 'cancelled' | 'past_due'

interface SettingsScreenProps {
  subscriptionStatus: SubscriptionStatus
  renewalDate?: string | null
  onManageSubscription: () => void
  onViewBillingHistory?: () => void
  onNotificationPreferences: () => void
  userEmail: string
}

const STATUS_BADGE_STYLES: Record<SubscriptionStatus, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200',
  trial: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
  'past_due': 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200',
}

export function SettingsScreen({
  subscriptionStatus,
  renewalDate,
  onManageSubscription,
  onViewBillingHistory,
  onNotificationPreferences,
  userEmail,
}: SettingsScreenProps) {
  const badgeStyle = STATUS_BADGE_STYLES[subscriptionStatus]
  const hasMultipleSections = Boolean(onViewBillingHistory || onNotificationPreferences)

  return (
    <section className="space-y-6">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Premium</h1>
          {userEmail && (
            <p className="text-sm text-gray-500 dark:text-gray-400">{userEmail}</p>
          )}
        </div>
      </header>

      <section className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
        <div className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-xs font-medium mb-2">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              subscriptionStatus === 'active' ? 'bg-green-600' :
              subscriptionStatus === 'trial' ? 'bg-yellow-600' :
              'bg-red-600'
            }`}
          />
          <span className={`font-medium ${badgeStyle}`}>
            {subscriptionStatus.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        </div>
        <p className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">
          {subscriptionStatus.charAt(0).toUpperCase() + subscriptionStatus.slice(1).replace('_', ' ')}
          {subscriptionStatus === 'trial' && ' · Trial'}
        </p>
        {renewalDate && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Renews {renewalDate}
          </p>
        )}
        <button
          type="button"
          onClick={onManageSubscription}
          className="mt-4 w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          Manage subscription
        </button>
      </section>

      {hasMultipleSections && (
        <div className="border-t border-slate-200 dark:border-slate-600 my-6" />
      )}

      {onViewBillingHistory && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">Billing history</h2>
          <button
            type="button"
            onClick={onViewBillingHistory}
            className="text-sm text-brand-600 underline hover:no-underline dark:text-brand-400"
          >
            View billing history
          </button>
        </section>
      )}

      {hasMultipleSections && (
        <div className="border-t border-slate-200 dark:border-slate-600 my-6" />
      )}

      {onNotificationPreferences && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2 text-slate-900 dark:text-slate-100">Notifications</h2>
          <button
            type="button"
            onClick={onNotificationPreferences}
            className="text-sm text-brand-600 underline hover:no-underline dark:text-brand-400"
          >
            Manage notification preferences
          </button>
        </section>
      )}
    </section>
  )
}
