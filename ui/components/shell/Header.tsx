"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, Plus } from "lucide-react";
import { Dialog as RDialog } from "radix-ui";
import { useState } from "react";
import { IconButton, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/overlay";
import { SHELL } from "@/lib/copy";
import { RunChip } from "./RunChip";
import { SystemChip } from "./SystemChip";
import { ThemeToggle, applyTheme } from "./ThemeToggle";
import { Segmented } from "@/components/ui/tabs";
import { useBreakpoint } from "@/lib/hooks/use-breakpoint";

function Wordmark() {
  return (
    <Link href="/app" className="wordmark" aria-label="Probity, change requests">
      <span className="wordmark__box" aria-hidden>✓</span>
      <span className="wordmark__text">{SHELL.wordmark}</span>
    </Link>
  );
}

function NavPill({ path }: { path: string }) {
  return (
    <nav aria-label="Primary" className="p-tabs" style={{ padding: 4 }}>
      <Link href="/app" className="p-tab" aria-current={path === "/app" || path.startsWith("/app/review") ? "page" : undefined}>
        {SHELL.navRequests}
      </Link>
    </nav>
  );
}

function MenuSheet({ open, onOpenChange, path }: { open: boolean; onOpenChange: (o: boolean) => void; path: string }) {
  const [theme, setTheme] = useState<"light" | "dark" | "system">("dark");
  return (
    <Sheet open={open} onOpenChange={onOpenChange} eyebrow={SHELL.menu} title={SHELL.wordmark}>
      <div className="sheet-menu">
        <nav className="sheet-menu__nav t-mono-ui" aria-label="Primary">
          <RDialog.Close asChild>
            <Link href="/app" aria-current={path === "/app" ? "page" : undefined}>{SHELL.navRequests}</Link>
          </RDialog.Close>
        </nav>
        <RDialog.Close asChild>
          <LinkButton href="/app/new" block large icon={<Plus />}>{SHELL.newRequest}</LinkButton>
        </RDialog.Close>
        <div className="grid gap-2">
          <span className="t-eyebrow">{SHELL.theme}</span>
          <Segmented
            full
            large
            label={SHELL.theme}
            value={theme}
            onChange={(t) => {
              setTheme(t);
              applyTheme(t);
            }}
            items={[
              { id: "light", label: SHELL.themeLight },
              { id: "dark", label: SHELL.themeDark },
              { id: "system", label: SHELL.themeSystem },
            ]}
          />
        </div>
      </div>
    </Sheet>
  );
}

export function Header() {
  const path = usePathname() ?? "";
  const [menu, setMenu] = useState(false);
  const bp = useBreakpoint();
  return (
    <header className="app-header" data-testid="app-header">
      <div className="app-header__bar">
        <Wordmark />
        <div className="app-header__grow show-lg">{bp === "wide" || bp === "medium" ? <NavPill path={path} /> : null}</div>
        <div className="app-header__right">
          <span className="hide-sm"><RunChip /></span>
          <SystemChip />
          <span className="hide-sm"><ThemeToggle /></span>
          {path !== "/app/new" ? (
            <span className="hide-sm">
              <LinkButton href="/app/new" icon={<Plus />}>{SHELL.newRequest}</LinkButton>
            </span>
          ) : null}
          <span className="hide-lg">
            <IconButton label={SHELL.menu} onClick={() => setMenu(true)} data-testid="menu-button"><MenuIcon /></IconButton>
          </span>
        </div>
      </div>
      <MenuSheet open={menu} onOpenChange={setMenu} path={path} />
    </header>
  );
}
