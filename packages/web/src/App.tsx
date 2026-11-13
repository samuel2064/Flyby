import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from './contexts/AuthContext'
import { PublicDashboard } from './components/PublicDashboard'
import { AirportDetail } from './components/AirportDetail'
import Checkpoint from './pages/Checkpoint'
import Search from './pages/Search'
import Dashboard from './pages/Dashboard'
import NotFound from './pages/NotFound'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Profile from './pages/Profile'
import ProtectedRoute from './components/ProtectedRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { OnboardingFlow } from './onboarding/OnboardingFlow'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = () => {
    if (!deferredPrompt) return
    void deferredPrompt.prompt()
    void deferredPrompt.userChoice.then(() => setVisible(false))
  }

  if (!visible) return null

  return (
    <div className="bg-brand text-white px-4 py-2 flex items-center justify-between">
      <span>Install Flyby for offline access</span>
      <div className="space-x-2">
        <button onClick={handleInstall} className="bg-white text-brand px-3 py-1 rounded text-sm font-semibold">
          Install
        </button>
        <button onClick={() => setVisible(false)} className="text-sm underline">
          Dismiss
        </button>
      </div>
    </div>
  )
}

function AirportDetailRoute() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  if (!code) return <NotFound />
  return (
    <AirportDetail
      code={code.toUpperCase()}
      onBack={() => navigate('/')}
    />
  )
}

function App() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null)

  useEffect(() => {
    setOnboardingComplete(localStorage.getItem('flyby.onboarding.complete') === 'true')
  }, [])

  if (onboardingComplete === null) return null
  if (!onboardingComplete) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
        <OnboardingFlow
          onComplete={() => setOnboardingComplete(true)}
          onSkip={() => setOnboardingComplete(true)}
        />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-brand text-white p-4 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <Link to="/" className="text-xl font-bold tracking-tight">
            Flyby
          </Link>
          <nav className="space-x-4 text-sm flex items-center">
            <Link to="/" className="hover:underline">Home</Link>
            <Link to="/search" className="hover:underline">Search</Link>
            {user ? (
              <>
                <Link to="/dashboard" className="hover:underline">Dashboard</Link>
                <Link to="/profile" className="hover:underline">Profile</Link>
                <button onClick={logout} className="hover:underline">Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="hover:underline">Log in</Link>
                <Link to="/signup" className="hover:underline">Sign up</Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <InstallPrompt />
      <main className="max-w-3xl mx-auto p-4">
        <ErrorBoundary>
          <Routes>
            <Route
              path="/"
              element={
                <PublicDashboard
                  onSelectAirport={(a) => navigate(`/airport/${a.airport}`)}
                />
              }
            />
            <Route path="/search" element={<Search />} />
            <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/airport/:code" element={<AirportDetailRoute />} />
            <Route path="/checkpoint/:id" element={<Checkpoint />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </main>
      <footer
        data-testid="app-footer"
        className="mt-10 pb-6 text-center text-xs text-slate-500"
      >
        Flyby — crowdsourced airport security wait times
      </footer>
    </div>
  )
}

export default App
