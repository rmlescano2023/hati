type Props = {
  className?: string;
  title?: string;
};

/**
 * The Hati mark: a circle split down the middle, one half dark and one half
 * green, ringed in green the whole way round.
 *
 * The dark half is the page's own background rather than a colour of its own,
 * so the mark sits on the page instead of on a plate — the ring is what keeps
 * the circle readable where the fill and the background meet.
 */
export function HatiLogo({ className, title = 'Hati' }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M32 5a27 27 0 0 0 0 54Z" fill="var(--bg)" />
      <path d="M32 5a27 27 0 0 1 0 54Z" fill="var(--accent)" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
    </svg>
  );
}
