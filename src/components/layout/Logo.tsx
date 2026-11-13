export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" fill="#1c1917" stroke="#3a342b" />
      <path d="M16 6l7 6-7 14-7-14z" fill="none" stroke="#c9a45c" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 12h14M16 6l-3 6 3 14 3-14-3-6z" fill="none" stroke="#c9a45c" strokeWidth="1.2" strokeLinejoin="round" opacity=".75" />
    </svg>
  )
}
