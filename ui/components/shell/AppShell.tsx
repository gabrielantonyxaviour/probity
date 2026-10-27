import type { ReactNode } from "react";
import { ToastHost } from "@/components/ui/toast";
import { Footer } from "./Footer";
import { Header } from "./Header";
import { ModeBanner } from "./ModeBanner";
import { ReadyProvider } from "./ReadyProvider";
import { ShellStateProvider } from "./shell-state";
import { SHELL } from "@/lib/copy";

/** Every /app route: header 56, mode banner, ruled frame, footer bar (PRODUCT_UI_GUIDE section 1). */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ReadyProvider>
      <ShellStateProvider>
        <div className="app-shell">
          <a className="skip-link t-mono-ui" href="#main">{SHELL.skip}</a>
          <Header />
          <ModeBanner />
          <main id="main" className="app-main">
            <div className="frame">{children}</div>
          </main>
          <Footer />
          <ToastHost />
        </div>
      </ShellStateProvider>
    </ReadyProvider>
  );
}
