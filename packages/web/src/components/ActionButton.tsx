import { type ComponentPropsWithoutRef, forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'outline'
type Size = 'sm' | 'md' | 'lg'

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-gradient-to-r from-brand-600 to-brand-700 text-white hover:opacity-90',
  secondary: 'bg-transparent text-brand-600 hover:text-brand-700/80',
  outline: 'border border-brand-600/20 text-brand-600 hover:bg-brand-50',
}

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'px-3 py-1 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
}

interface ActionButtonProps extends Omit<ComponentPropsWithoutRef<'button'>, 'onClick'> {
  label: string
  onClick: () => void
  variant?: Variant
  size?: Size
  isLoading?: boolean
  disabled?: boolean
  icon?: React.ComponentType<{ className?: string }>
  iconEnd?: React.ComponentType<{ className?: string }>
}

export const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  function ActionButton(
    { label, onClick, variant = 'primary', size = 'md', isLoading = false, disabled = false, icon: Icon, iconEnd: IconEnd },
    ref,
  ) {
    return (
      <button
        type="button"
        ref={ref}
        onClick={onClick}
        disabled={disabled || isLoading}
        className={`min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg transition-opacity duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`}
      >
        {isLoading ? (
          <svg
            aria-hidden="true"
            className="h-4 w-4 animate-spin text-current"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0Z" strokeLinecap="round" />
          </svg>
        ) : (
          <>
            {Icon && <Icon className="mr-2 h-4 w-4" />}
            {label}
            {IconEnd && <IconEnd className="ml-2 h-4 w-4" />}
          </>
        )}
      </button>
    )
  },
)

ActionButton.displayName = 'ActionButton'
