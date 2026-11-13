import clsx from 'clsx'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/app/auth'
import { useBrand } from '@/hooks/useBrand'
import { Logo } from './Logo'
import { NAV } from './nav'

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { can } = useAuth()
  const brand = useBrand()
  return (
    <aside className="no-print flex h-full w-[236px] shrink-0 flex-col bg-side text-stone-300" aria-label="Primary">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <Logo />
        <div className="min-w-0 leading-none">
          <p className="font-display text-[20px] leading-[1.05] font-semibold tracking-wide text-gold-300" title={brand.name}>{brand.name}</p>
          <p className="mt-0.5 text-[10px] tracking-[0.18em] text-stone-500 uppercase">Jewellery ERP</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(i.perm))
          if (!items.length) return null
          return (
            <div key={g.title} className="mt-3">
              <p className="px-2.5 pb-1 text-[10px] font-semibold tracking-[0.14em] text-stone-500 uppercase">{g.title}</p>
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.to === '/'} onClick={onNavigate}
                  className={({ isActive }) => clsx('relative flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors',
                    isActive ? 'bg-side-2 font-medium text-white' : 'text-stone-400 hover:bg-side-2/70 hover:text-stone-200')}>
                  {({ isActive }) => (
                    <>
                      {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-r bg-gold-400" aria-hidden />}
                      <i.icon size={16} className={isActive ? 'text-gold-300' : 'text-stone-500'} aria-hidden />
                      {i.label}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )
        })}
      </nav>
    </aside>
  )
}
