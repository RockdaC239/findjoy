export function AccountAvatar({ className = "" }: { className?: string }) {
  return <span className={`account-avatar ${className}`} aria-hidden="true">
    <svg viewBox="0 0 40 40" width="100%" height="100%" fill="none">
      <circle cx="20" cy="20" r="20" fill="#ffe4d7" />
      <circle cx="20" cy="14" r="6" fill="#ff5a1f" />
      <path d="M8 34c0-7 5-12 12-12s12 5 12 12a19 19 0 0 1-24 0Z" fill="#ff5a1f" />
    </svg>
  </span>;
}
