"use client";
import type { ReactNode } from "react";
import { Dialog as RDialog, Popover as RPopover, DropdownMenu as RMenu } from "radix-ui";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFocusReturn } from "@/lib/url-state";
import { IconButton } from "./button";

/** Right sheet (bottom sheet below 768), solid canvas, clip-path open (RULES section 5). Controlled by the URL. */
export function Sheet({ open, onOpenChange, eyebrow, title, children, side = "right", testId, closeLabel = "Close", wide }: { open: boolean; onOpenChange: (o: boolean) => void; eyebrow: string; title: ReactNode; children: ReactNode; side?: "right" | "left"; testId?: string; closeLabel?: string; wide?: boolean }) {
  useFocusReturn(open);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="p-scrim" />
        <RDialog.Content className={cn("p-sheet", side === "left" && "p-sheet--left", wide && "p-sheet--wide")} data-overlay data-testid={testId} aria-describedby={undefined} onCloseAutoFocus={(e) => e.preventDefault()}>
          <span className="p-sheet__handle" aria-hidden />
          <div className="p-sheet__head">
            <div className="grid min-w-0 gap-2">
              <span className="t-eyebrow">{eyebrow}</span>
              <RDialog.Title className="t-app-title text-fg break-words">{title}</RDialog.Title>
            </div>
            <RDialog.Close asChild>
              <IconButton label={closeLabel}><X /></IconButton>
            </RDialog.Close>
          </div>
          <div className="p-sheet__body">{children}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Dialog({ open, onOpenChange, title, children, footer, testId, closeLabel = "Close" }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; footer: ReactNode; testId?: string; closeLabel?: string }) {
  useFocusReturn(open);
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="p-scrim" />
        <RDialog.Content className="p-dialog" data-overlay data-testid={testId} aria-describedby={undefined} onCloseAutoFocus={(e) => e.preventDefault()}>
          <div className="p-dialog__head">
            <RDialog.Title className="t-app-title text-fg">{title}</RDialog.Title>
          </div>
          <RDialog.Close asChild>
            <IconButton label={closeLabel} className="p-dialog__close"><X /></IconButton>
          </RDialog.Close>
          <div className="p-dialog__body">{children}</div>
          <div className="p-dialog__foot">{footer}</div>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

export function Popover({ trigger, children, label, align = "end", className, open, onOpenChange }: { trigger: ReactNode; children: ReactNode; label: string; align?: "start" | "center" | "end"; className?: string; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content className={cn("p-popover", className)} align={align} sideOffset={8} collisionPadding={12} aria-label={label} data-overlay>
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  );
}

export type MenuEntry = { type: "item"; id: string; label: string; onSelect: () => void; disabled?: boolean } | { type: "group"; label: string };

export function Menu({ trigger, entries, label }: { trigger: ReactNode; entries: MenuEntry[]; label: string }) {
  return (
    <RMenu.Root>
      <RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
      <RMenu.Portal>
        <RMenu.Content className="p-menu" align="end" sideOffset={10} aria-label={label} data-overlay>
          {entries.map((e, i) =>
            e.type === "group" ? (
              <RMenu.Label key={`g${i}`} className="p-menu__group">{e.label}</RMenu.Label>
            ) : (
              <RMenu.Item key={e.id} className="p-menu__item" disabled={e.disabled} onSelect={e.onSelect}>
                {e.label}
              </RMenu.Item>
            ),
          )}
        </RMenu.Content>
      </RMenu.Portal>
    </RMenu.Root>
  );
}
