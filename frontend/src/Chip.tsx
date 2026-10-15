import type { HTMLAttributes, ReactNode } from "react";

import { chipClass, type ChipSize, type ChipTone } from "./chipStyle";
import { Icon } from "./Icon";

type ChipProps = Omit<HTMLAttributes<HTMLElement>, "className" | "children"> & {
  tone?: ChipTone;
  size?: ChipSize;
  /** A leading icon name from Icon.tsx (decorative; the text carries the meaning). */
  icon?: string;
  /** A leading status dot (decorative; the text carries the meaning). */
  dot?: boolean;
  /** Pulse the dot (only while agents are working; off under reduced motion). */
  pulse?: boolean;
  as?: "span" | "li" | "strong";
  className?: string;
  children: ReactNode;
};

/** The one chip: every badge, pill, tag and value chip in the console renders through it. */
export function Chip({ tone = "neutral", size = "md", icon, dot = false, pulse = false, as: Tag = "span", className, children, ...rest }: ChipProps) {
  return <Tag className={chipClass({ tone, size, className: [pulse && "pulse", className].filter(Boolean).join(" ") || undefined })} {...rest}>
    {dot && <span className="chip-dot" aria-hidden="true" />}
    {icon && <Icon name={icon} />}
    {children}
  </Tag>;
}

/**
 * Marks reviewer-only content (riders and drivers never see it) next to a heading: a lock
 * and "Internal", with the full sentence in the tooltip and for screen readers.
 */
export function InternalBadge({ detail }: { detail: string }) {
  const sentence = `${detail}. Riders and drivers never see this.`;
  return <Chip size="sm" icon="lock" className="internal-badge" title={sentence}>
    Internal<span className="sr-only">: {sentence}</span>
  </Chip>;
}
