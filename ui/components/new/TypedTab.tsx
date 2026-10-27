"use client";
import { Field, Input } from "@/components/ui/field";
import { Alert } from "@/components/ui/misc";
import { NEW } from "@/lib/copy";
import type { Errors, TypedForm } from "./validation";

export function TypedTab({ f, set, errors, tries, onTry }: { f: TypedForm; set: (u: Partial<TypedForm>) => void; errors: Errors; tries: string[]; onTry: (name: string) => void }) {
  const text = (key: keyof TypedForm, label: string, extra: { help?: string; placeholder?: string; max?: number; type?: string; testId?: string } = {}) => (
    <Field label={label} help={extra.help} error={errors[key]}>
      {(x) => <Input id={x.id} type={extra.type ?? "text"} value={f[key]} onChange={(e) => set({ [key]: e.target.value } as Partial<TypedForm>)} invalid={x.invalid} aria-describedby={x.describedBy} placeholder={extra.placeholder} maxLength={extra.max} data-testid={extra.testId} autoComplete="off" />}
    </Field>
  );
  return (
    <div className="grid gap-5">
      {text("name", NEW.nameLabel, { testId: "typed-name" })}
      {tries.length ? (
        <p className="t-ui-sm text-fg-muted flex flex-wrap gap-x-4 gap-y-1">{NEW.try}{tries.map((t) => <button key={t} type="button" className="p-link text-fg-2" onClick={() => onTry(t)}>{t}</button>)}</p>
      ) : null}
      {text("uei", NEW.ueiLabel, { help: NEW.ueiHelp, placeholder: "JCBMLGPE6Z71", max: 12, testId: "typed-uei" })}
      <fieldset className="grid gap-4 border-0 p-0 m-0">
        <legend className="t-eyebrow mb-3">{NEW.claimsGroup}</legend>
        {text("line1", NEW.addrLine1)}
        <div className="grid-2">{text("unit", NEW.addrUnit)}{text("city", NEW.addrCity)}</div>
        <div className="grid-2">{text("state", NEW.addrState, { max: 2 })}{text("zip", NEW.addrZip, { max: 10 })}</div>
        <div className="grid-2">{text("routing", NEW.routing, { max: 9 })}{text("account", NEW.account, { help: NEW.accountHelp, max: 12 })}</div>
        <div className="grid-2">{text("email", NEW.senderEmail, { type: "email" })}{text("phone", NEW.phone)}</div>
      </fieldset>
      <Alert tone="info" testId="typed-notice">{NEW.typedNotice}</Alert>
    </div>
  );
}
