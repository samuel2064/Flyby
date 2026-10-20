// Offline status indicator bar
// Shows when the app is offline and how many reports are pending sync

import { useOfflineQueue } from '../hooks/useOfflineQueue'

export default function OfflineStatus() {
  const { isOnline, pendingCount, isSyncing } = useOfflineQueue()

  if (isOnline && pendingCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-yellow-100 border-t border-yellow-300 px-4 py-2 flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {!isOnline && (
          <span className="font-medium text-yellow-800">
            You are offline
          </span>
        )}
        {pendingCount > 0 && (
          <span className="text-yellow-700">
            {isSyncing ? 'Syncing' : `${pendingCount} report${pendingCount === 1 ? '' : 's'} pending`}
          </span>
        )}
      </div>
      {isSyncing && (
        <span className="inline-block w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  )
}
