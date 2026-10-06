export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <circle cx="16" cy="16" r="16" className="fill-fg" />
      <path d="M8 20.5l4.5-4.5 3.5 3 7.5-8" className="stroke-accent-fill" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.5" cy="11" r="1.9" className="fill-accent-fill" />
    </svg>
  );
}
