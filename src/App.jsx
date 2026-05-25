import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Footer from './components/Footer'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import Results from './pages/Results'
import Schedule from './pages/Schedule'
import RogerAgent from './components/RogerAgent'
import { DarkModeProvider } from './lib/DarkModeContext'

function Layout({ children, showFooter = true }) {
  return (
    <div className="flex flex-col min-h-screen bg-white dark:bg-gray-950 transition-colors duration-200">
      <Navbar />
      <main className="flex-1">{children}</main>
      {showFooter && <Footer />}
    </div>
  )
}

export default function App() {
  return (
    <DarkModeProvider>
    <BrowserRouter>
      <RogerAgent />
      <Routes>
        <Route path="/" element={
          <Layout>
            <Landing />
          </Layout>
        } />
        <Route path="/onboarding" element={
          <Layout showFooter={false}>
            <Onboarding />
          </Layout>
        } />
        <Route path="/results" element={
          <Layout showFooter={false}>
            <Results />
          </Layout>
        } />
        <Route path="/schedule" element={
          <Layout showFooter={false}>
            <Schedule />
          </Layout>
        } />
        {/* Fallback */}
        <Route path="*" element={
          <Layout>
            <div className="flex flex-col items-center justify-center py-32 text-center px-4">
              <p className="text-6xl mb-4">🔍</p>
              <h2 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 mb-2">Page not found</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-8">That page doesn't exist.</p>
              <a href="/" className="btn-primary">← Back to home</a>
            </div>
          </Layout>
        } />
      </Routes>
    </BrowserRouter>
    </DarkModeProvider>
  )
}
