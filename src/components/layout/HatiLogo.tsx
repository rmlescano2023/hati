type Props = {
  className?: string;
  title?: string;
};

/** The Hati mark: a circle split in two — one half solid, one half outlined. */
export function HatiLogo({ className, title = 'Hati' }: Props) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="64" height="64" rx="14" fill="var(--surface2)" />
      <path d="M32 10a22 22 0 0 0 0 44Z" fill="var(--accent)" />
      <path
        d="M32 10a22 22 0 0 1 0 44"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
