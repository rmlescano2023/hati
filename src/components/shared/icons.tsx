import type { ReactNode } from 'react';

type Props = {
  className?: string;
};

/**
 * Line icons for the tab bars and the New Session button. Stroked in
 * currentColor, so each one takes the colour of the text beside it, including
 * a tab's active colour. Decorative: the label next to them carries the name.
 */
function Icon({ className, children }: Props & { children: ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
}

export function HomeIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1Z" />
    </Icon>
  );
}

export function HistoryIcon(props: Props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  );
}

export function ExpensesIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H17v2.5" />
      <rect x="4" y="7.5" width="16" height="11.5" rx="2" />
      <path d="M16 13.25h.01" />
    </Icon>
  );
}

export function BreakdownIcon(props: Props) {
  return (
    <Icon {...props}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 10h16M4 15h16M10 4v16" />
    </Icon>
  );
}

export function SummaryIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M5 20V14M12 20V9M19 20V4" />
    </Icon>
  );
}

export function PlusIcon(props: Props) {
  return (
    <Icon {...props}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}
