/**
 * Retro 3.5" floppy-disk artwork.
 *
 * `FloppyDisk` is a filled, colourable diskette used as a game cover.
 * `FloppyGlyph` is a lucide-style line icon (currentColor) for inline badges.
 */

export function FloppyDisk({
  from,
  to,
  gradientId,
  className,
}: {
  from: string;
  to: string;
  gradientId: string;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-hidden xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={from} />
          <stop offset="100%" stopColor={to} />
        </linearGradient>
      </defs>
      {/* Disk body with the classic cut top-right corner */}
      <path
        d="M9 5h24l10 10v26a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        fill={`url(#${gradientId})`}
        stroke="rgba(0,0,0,0.35)"
        strokeWidth="1.5"
      />
      {/* Metal shutter + sliding window */}
      <rect x="26" y="5" width="12" height="15" rx="1" fill="#cdd2da" stroke="rgba(0,0,0,0.3)" strokeWidth="1" />
      <rect x="30" y="7" width="3.5" height="11" rx="1" fill="rgba(0,0,0,0.35)" />
      {/* Paper label with handwriting lines */}
      <rect x="12" y="24" width="24" height="17" rx="1.5" fill="#f6f3e8" stroke="rgba(0,0,0,0.15)" strokeWidth="1" />
      <line x1="15" y1="29" x2="33" y2="29" stroke="rgba(0,0,0,0.28)" strokeWidth="1.5" />
      <line x1="15" y1="33" x2="33" y2="33" stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />
      <line x1="15" y1="37" x2="27" y2="37" stroke="rgba(0,0,0,0.18)" strokeWidth="1.5" />
    </svg>
  );
}

export function FloppyGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* body with cut corner */}
      <path d="M6 3h10l4 4v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      {/* label */}
      <path d="M8 21v-6h8v6" />
      {/* shutter */}
      <path d="M9 3v4h6V3" />
    </svg>
  );
}
