import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from './Header'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const [open, setOpen] = useState(false)
  return (
    <div className="app-shell flex h-screen overflow-hidden">
      <div className="hidden lg:block"><Sidebar /></div>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="absolute inset-0 bg-ink/50" aria-hidden />
          <div className="relative h-full w-[236px] shadow-[var(--shadow-pop)]"><Sidebar onNavigate={() => setOpen(false)} /></div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onMenu={() => setOpen(true)} />
        <main className="flex-1 overflow-y-auto px-3 py-5 sm:px-6"><div className="mx-auto max-w-[1480px]"><Outlet /></div></main>
      </div>
    </div>
  )
}
