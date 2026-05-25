import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDarkMode } from '../lib/DarkModeContext'

function SunIcon() {
  return (
    <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="5" strokeWidth={2} />
      <path strokeLinecap="round" strokeWidth={2} d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  )
}

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const location = useLocation()
  const isLanding = location.pathname === '/'
  const { isDark, toggleDark } = useDarkMode()

  return (
    <nav className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-100 dark:border-gray-800 transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 bg-miami-red rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <span className="font-bold text-lg text-gray-900 dark:text-gray-100">
            Register<span className="text-miami-red">Buddy</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {isLanding && (
            <>
              <a href="#features" className="btn-ghost text-sm">Features</a>
              <a href="#how-it-works" className="btn-ghost text-sm">How it works</a>
              <a href="#pricing" className="btn-ghost text-sm">Pricing</a>
            </>
          )}
        </div>

        {/* CTA + dark toggle */}
        <div className="hidden md:flex items-center gap-3">
          {/* Dark mode toggle */}
          <button
            onClick={toggleDark}
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          {isLanding && (
            <a href="#pricing" className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
              Pricing
            </a>
          )}
          <Link to="/onboarding" className="btn-primary text-sm py-2 px-5">
            Get my picks →
          </Link>
        </div>

        {/* Mobile right side */}
        <div className="flex md:hidden items-center gap-2">
          <button
            onClick={toggleDark}
            aria-label="Toggle dark mode"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <div className="w-5 flex flex-col gap-1.5">
              <span className={`block h-0.5 bg-gray-700 dark:bg-gray-300 rounded transition-all ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block h-0.5 bg-gray-700 dark:bg-gray-300 rounded transition-all ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 bg-gray-700 dark:bg-gray-300 rounded transition-all ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-4 flex flex-col gap-2 transition-colors">
          {isLanding && (
            <>
              <a href="#features" className="py-2 text-gray-700 dark:text-gray-300 font-medium" onClick={() => setMenuOpen(false)}>Features</a>
              <a href="#how-it-works" className="py-2 text-gray-700 dark:text-gray-300 font-medium" onClick={() => setMenuOpen(false)}>How it works</a>
              <a href="#pricing" className="py-2 text-gray-700 dark:text-gray-300 font-medium" onClick={() => setMenuOpen(false)}>Pricing</a>
            </>
          )}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex flex-col gap-2">
            <Link to="/onboarding" className="btn-primary text-center text-sm" onClick={() => setMenuOpen(false)}>
              Get my picks →
            </Link>
          </div>
        </div>
      )}
    </nav>
  )
}
