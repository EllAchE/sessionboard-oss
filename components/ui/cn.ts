/** Joins class names, dropping falsy entries. Caller-supplied `className` is merged last. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
