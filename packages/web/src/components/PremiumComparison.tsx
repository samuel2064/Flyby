interface TierProps {
  label: string
  features: Array<string>
  isFree: boolean
}

interface PremiumComparisonProps {
  tier1: TierProps
  tier2: TierProps
  highlight?: 'free' | 'premium'
  primaryCta: { label: string; onClick: () => void }
  secondaryCta?: { label: string; onClick: () => void }
}

const TIER_HEADER_STYLES: Record<string, string> = {
  'true': 'text-gray-600 dark:text-gray-300',
  'false': 'text-brand-600 dark:text-brand-400',
}

const CHECKMARK_STYLES: Record<string, string> = {
  'true': 'text-gray-400 dark:text-gray-500',
  'false': 'text-brand-600 dark:text-brand-400',
}

export function PremiumComparison({
  tier1,
  tier2,
  highlight = 'premium',
  primaryCta,
  secondaryCta,
}: PremiumComparisonProps) {
  const tiers = [tier1, tier2]
  return (
    <div className="flex flex-col sm:flex-row gap-6">
      {tiers.map((tier, index) => {
        const isHighlighted = (index === 0 && highlight === 'free') || (index === 1 && highlight === 'premium')
        const isFreeKey = String(tier.isFree)
        return (
          <div
            key={tier.label}
            className={`flex-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6 ${
              isHighlighted ? 'ring-2 ring-brand-600' : ''
            }`}
          >
            <h3 className={`text-lg font-semibold mb-4 ${TIER_HEADER_STYLES[isFreeKey]}`}>
              {tier.label}
            </h3>
            <ul className="space-y-2 mb-6">
              {tier.features.map((feature, i) => (
                <li key={i} className="flex items-start space-x-2">
                  <span
                    aria-hidden="true"
                    className={`w-4 h-4 shrink-0 ${CHECKMARK_STYLES[isFreeKey]}`}
                  >
                    ✓
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-300">{feature}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6">
              <button
                type="button"
                onClick={primaryCta.onClick}
                className={`w-full bg-gradient-to-r from-brand-600 to-brand-700 text-white px-6 py-3 rounded-lg hover:opacity-90 transition-opacity ${isHighlighted ? 'shadow-md ring-2 ring-brand-400/50' : ''}`}
              >
                {primaryCta.label}
              </button>
              {secondaryCta && index === 0 && (
                <button
                  type="button"
                  onClick={secondaryCta.onClick}
                  className="mt-3 w-full bg-transparent text-brand-600 hover:text-brand-700/80 px-6 py-3 rounded-lg border border-brand-600/20 hover:bg-brand-50 transition"
                >
                  {secondaryCta.label}
                </button>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
