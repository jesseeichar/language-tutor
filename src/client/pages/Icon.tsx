/** Path data for the 16×16 line icons, so every control draws the same glyph for the same meaning. */
export const ICONS = {
  plus: "M8 3v10M3 8h10",
  check: "M3 8.5l3 3 7-7",
  chevron: "M4 6l4 4 4-4",
  cross: "M4 4l8 8M12 4l-8 8",
  /** Two overlapping sheets. */
  copy: "M6 6h7v7H6zM3 10V3h7",
} as const;

/** A decorative stroked icon; the button around it carries the accessible name. */
export const Icon = ({ d }: { d: string }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);
