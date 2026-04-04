import React, { useEffect, Component, ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useGridStore } from './stores/gridStore'
import { useWebSocket } from './hooks/useWebSocket'
import { api } from './api/client'
import Layout from './components/Layout'

import LoginPage from './pages/LoginPage'
import NetworkMapPage from './pages/NetworkMapPage'
import PowerFlowPage from './pages/PowerFlowPage'
import OperatingEnvelopePage from './pages/OperatingEnvelopePage'
import ForecastPage from './pages/ForecastPage'
import D4GMessagesPage from './pages/D4GMessagesPage'
import BaselineFlexPage from './pages/BaselineFlexPage'

class PageErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
        <div className="text-4xl">⚠️</div>
        <p className="text-sm font-medium text-gray-300">Page failed to render</p>
        <p className="text-xs text-gray-500 max-w-sm text-center">{(this.state.error as Error).message}</p>
        <button className="text-xs text-indigo-400 underline mt-2" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    )
    return this.props.children
  }
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { token, _hasHydrated } = useAuthStore()
  if (!_hasHydrated) return (
    <div className="h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Loading Neural Grid…</p>
      </div>
    </div>
  )
  if (!token) return <Navigate to="/login" replace />
  return <Layout><PageErrorBoundary>{children}</PageErrorBoundary></Layout>
}

function AppInit() {
  const { token, setUser, setDeployments } = useAuthStore()
  const { setAlerts, setGridState } = useGridStore()
  useWebSocket()
  useEffect(() => {
    const ping = () => fetch(`${import.meta.env.VITE_API_URL || ''}/health`).catch(() => {})
    ping()
    const id = setInterval(ping, 10 * 60 * 1000)
    return () => clearInterval(id)
  }, [])
  useEffect(() => {
    if (!token) return
    api.me().then((r) => setUser(r.data)).catch(() => {})
    api.deployments().then((r) => { if (Array.isArray(r.data) && r.data.length > 0) setDeployments(r.data) }).catch(() => {})
    api.gridDashboard().then((r) => { if (r.data?.grid_state) setGridState(r.data.grid_state); if (r.data?.active_alerts) setAlerts(r.data.active_alerts) }).catch(() => {})
    api.gridAlerts().then((r) => { if (Array.isArray(r.data)) setAlerts(r.data) }).catch(() => {})
  }, [token])
  return null
}

export default function App() {
  return (
    <>
      <AppInit />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Navigate to="/network" replace />} />
        <Route path="/network" element={<ProtectedRoute><NetworkMapPage /></ProtectedRoute>} />
        <Route path="/powerflow" element={<ProtectedRoute><PowerFlowPage /></ProtectedRoute>} />
        <Route path="/envelope" element={<ProtectedRoute><OperatingEnvelopePage /></ProtectedRoute>} />
        <Route path="/d4g" element={<ProtectedRoute><D4GMessagesPage /></ProtectedRoute>} />
        <Route path="/forecast" element={<ProtectedRoute><ForecastPage /></ProtectedRoute>} />
        <Route path="/baseline" element={<ProtectedRoute><BaselineFlexPage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/network" replace />} />
      </Routes>
    </>
  )
}
