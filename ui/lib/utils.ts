import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** shadcn class merger. Components follow DESIGN_SYSTEM_RULES.md §5 anatomy (pills, hairlines, no shadows). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
