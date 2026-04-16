import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useGridStore } from '../stores/gridStore'
import {
  Map, Activity, Radio, LogOut, Zap, Bell, MessageSquare,
  Layers, Users, Cpu, Shield, Database, Settings,
} from 'lucide-react'
import clsx from 'clsx'

// OPERATOR nav items (all users see these)
const OPERATOR_NAV = [
  { path: '/network',    label: 'Network',            icon: Map },
  { path: '/lookahead',  label: 'Look-Ahead & Flow',  icon: Activity },
  { path: '/oe',         label: 'OE Dispatch',        icon: Radio },
  { path: '/messages',   label: 'IEC Messages',       icon: MessageSquare },
]

// ADMIN nav items (only for admin/superuser)
const ADMIN_NAV = [
  { path: '/admin/programs',       label: 'Programs',       icon: Layers },
  { path: '/admin/counterparties', label: 'Counterparties', icon: Users },
  { path: '/admin/assets',         label: 'Assets',         icon: Cpu },
  { path: '/admin/schema',         label: 'DB Schema',      icon: Database },
  { path: '/admin/settings',       label: 'Settings',       icon: Settings },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore()
  const { alerts, wsConnected } = useGridStore()
  const navigate = useNavigate()
  const criticalAlerts = alerts.filter((a) => !a.is_acknowledged && a.severity === 'CRITICAL')

  // Derive user role from deployment_roles
  const userRole = user?.deployments?.[0]?.role || ''
  const isAdmin = user?.is_superuser || ['DEPLOY_ADMIN', 'PROG_MGR', 'CONTRACT_MGR'].includes(userRole)

  return (
    <div className="flex h-screen bg-gray-950 overflow-hidden">
      <aside className="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Neural Grid</div>
            <div className="text-[10px] text-gray-400">DERMS Lite</div>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {OPERATOR_NAV.map(({ path, label, icon: Icon }) => (
            <NavLink key={path} to={path}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}

          {isAdmin && (
            <>
              <div className="pt-3 pb-1 px-3 flex items-center gap-2">
                <div className="flex-1 h-px bg-gray-700" />
                <div className="flex items-center gap-1 text-[10px] text-gray-500 font-medium uppercase tracking-wide flex-shrink-0">
                  <Shield className="w-3 h-3" />
                  Admin
                </div>
                <div className="flex-1 h-px bg-gray-700" />
              </div>
              {ADMIN_NAV.map(({ path, label, icon: Icon }) => (
                <NavLink key={path} to={path}
                  className={({ isActive }) => clsx(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                    isActive ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-gray-100 hover:bg-gray-800'
                  )}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  {label}
                </NavLink>
              ))}
            </>
          )}
        </nav>
        <div className="p-3 border-t border-gray-800">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
              {user?.full_name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-gray-200 truncate">{user?.full_name || 'User'}</div>
              <div className="text-xs text-gray-500 truncate">{user?.email}</div>
            </div>
          </div>
          <button onClick={() => { useAuthStore.getState().logout(); navigate('/login') }}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={clsx('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full',
              wsConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
              <div className={clsx('w-1.5 h-1.5 rounded-full', wsConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
              {wsConnected ? 'Live' : 'Reconnecting...'}
            </div>
            <span className="text-sm text-gray-500">Auzance Distribution Network · EDF Réseau</span>
          </div>
          {criticalAlerts.length > 0 && (
            <div className="flex items-center gap-1.5 bg-red-100 text-red-600 px-3 py-1 rounded-full text-xs border border-red-200">
              <Bell className="w-3.5 h-3.5 animate-pulse" />
              {criticalAlerts.length} Critical
            </div>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-6 bg-gray-50">{children}</main>
      </div>
    </div>
  )
}
