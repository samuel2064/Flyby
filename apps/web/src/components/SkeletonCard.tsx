export function SkeletonCard() {
  return (
    <div
      aria-hidden="true"
      className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-1/2 space-y-2">
          <div className="h-4 w-3/4 rounded bg-slate-200" />
          <div className="h-3 w-1/3 rounded bg-slate-100" />
        </div>
        <div className="h-6 w-24 rounded-full bg-slate-200" />
      </div>
      <div className="mt-4 h-10 w-32 rounded-xl bg-slate-100" />
    </div>
  )
}
