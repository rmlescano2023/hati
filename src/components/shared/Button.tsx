import type { ButtonHTMLAttributes } from 'react';
import styles from './Button.module.css';

type Variant = 'default' | 'primary' | 'danger' | 'ghost' | 'icon';
type Size = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  block?: boolean;
};

const VARIANT_CLASS: Record<Variant, string> = {
  default: '',
  primary: styles.primary,
  danger: styles.danger,
  ghost: styles.ghost,
  icon: styles.icon,
};

const SIZE_CLASS: Record<Size, string> = {
  sm: styles.sm,
  md: '',
  lg: styles.lg,
};

export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  className,
  type = 'button',
  ...rest
}: Props) {
  const classes = [
    styles.btn,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    block ? styles.block : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return <button type={type} className={classes} {...rest} />;
}
