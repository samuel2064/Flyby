import { useState } from 'react'

interface InfoSectionProps {
  title: string
  content: string | React.ReactNode
  isOpen?: boolean
  onToggle?: () => void
  icon?: React.ComponentType<{ className?: string }>
}

export function InfoSection({
  title,
  content,
  isOpen: isOpenProp = false,
  onToggle,
  icon: Icon,
}: InfoSectionProps) {
  const [internalOpen, setInternalOpen] = useState(isOpenProp)
  const isOpen = isOpenProp !== undefined ? isOpenProp : internalOpen

  const handleToggle = () => {
    if (onToggle) {
      onToggle()
    } else {
      setInternalOpen((prev) => !prev)
    }
  }

  return (
    <section className="border-b border-slate-200 dark:border-slate-600 last:border-b-0">
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
        className="flex items-center justify-between w-full p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-brand-600" />}
          <span className="text-lg font-medium text-slate-900 dark:text-slate-100">{title}</span>
        </div>
        <svg
          aria-hidden="true"
          className={`h-4 w-4 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {isOpen && (
        <div className="pt-4 pb-6 text-sm text-gray-600 dark:text-gray-300">{content}</div>
      )}
    </section>
  )
}
