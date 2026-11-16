import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { Text } from '@react-pdf/renderer';

/* Test-only helpers that read a react-pdf element tree without rendering it. */

export type StyleValue = Record<string, unknown> | StyleValue[] | null | undefined | false;

export const flatten = (style: StyleValue): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : ((style || {}) as Record<string, unknown>);

export const includes = (style: StyleValue, wanted: object): boolean =>
  Array.isArray(style) ? style.some((s) => includes(s, wanted)) : style === wanted;

export const textOf = (node: ReactNode): string =>
  Array.isArray(node)
    ? node.map(textOf).join('')
    : typeof node === 'string' || typeof node === 'number'
      ? String(node)
      : '';

export type Cell = { text: string; style: Record<string, unknown>; raw: StyleValue };

/** Every `Text` in the tree, with its text and its style flattened. */
export function textCells(node: ReactNode, out: Cell[] = []): Cell[] {
  if (Array.isArray(node)) {
    node.forEach((n) => textCells(n, out));
  } else if (isValidElement(node)) {
    const el = node as ReactElement<{ style?: StyleValue; children?: ReactNode }>;
    if (el.type === Text) {
      out.push({
        text: textOf(el.props.children),
        style: flatten(el.props.style),
        raw: el.props.style,
      });
    } else {
      textCells(el.props.children, out);
    }
  }
  return out;
}

export const monoCells = (cells: Cell[]) => cells.filter((c) => c.style.fontFamily === 'DM Mono');
