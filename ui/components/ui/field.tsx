"use client";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { RadioGroup, Switch as RSwitch } from "radix-ui";
import { cn } from "@/lib/utils";

export function Field({ label, help, error, children, htmlFor }: { label: ReactNode; help?: ReactNode; error?: string | null; children: (p: { id: string; describedBy?: string; invalid: boolean }) => ReactNode; htmlFor?: string }) {
  const id = useId();
  const fid = htmlFor ?? id;
  const describedBy = error ? `${fid}-err` : help ? `${fid}-help` : undefined;
  return (
    <div>
      <label htmlFor={fid} className="p-label t-eyebrow">{label}</label>
      {children({ id: fid, describedBy, invalid: !!error })}
      {error ? (
        <p id={`${fid}-err`} className="p-err t-ui-xs"><span aria-hidden>✕</span><span>{error}</span></p>
      ) : help ? (
        <p id={`${fid}-help`} className="p-help t-ui-xs">{help}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input({ invalid, className, ...rest }, ref) {
  return <input ref={ref} className={cn("p-field", className)} aria-invalid={invalid || undefined} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea({ invalid, className, ...rest }, ref) {
  return <textarea ref={ref} className={cn("p-field", className)} aria-invalid={invalid || undefined} {...rest} />;
});

export type RadioOption<T extends string> = { id: T; label: ReactNode; help?: ReactNode; testId?: string };

/** Radio cards: option tiles, selected = inset 1px --fg-2 (RULES section 5). */
export function RadioTiles<T extends string>({ value, onChange, options, label, danger }: { value: T | ""; onChange: (v: T) => void; options: RadioOption<T>[]; label: string; danger?: boolean }) {
  return (
    <RadioGroup.Root value={value} onValueChange={(v) => onChange(v as T)} aria-label={label} className="grid gap-2">
      {options.map((o) => (
        <RadioGroup.Item key={o.id} value={o.id} className="p-tile" data-testid={o.testId} data-danger={danger ? "true" : undefined}>
          <span className="t-ui text-fg block">{o.label}</span>
          {o.help ? <span className="t-ui-xs text-fg-muted block mt-1">{o.help}</span> : null}
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}

export function Switch({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <RSwitch.Root id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} className="p-switch">
      <RSwitch.Thumb className="p-switch__thumb" />
    </RSwitch.Root>
  );
}
