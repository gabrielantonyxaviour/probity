"use client";

import { Menu, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { PillLink } from "./PillLink";
import { Wordmark } from "./Wordmark";
import { NAV_ITEMS, CTA_LABEL, GITHUB_LABEL } from "./copy";
import { APP_HOME, REPO_URL } from "./routes";

/** Header: fixed pill nav at >= 1120 (CTA grows in after 100px of scroll), a modal sheet below that. */
export function Header() {
  const headerRef = useRef<HTMLElement>(null);
  const sheetRef = useRef<HTMLDialogElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const onScroll = () => el.toggleAttribute("data-scrolled", window.scrollY > 100);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const onClose = () => burgerRef.current?.focus();
    const wide = window.matchMedia("(min-width: 1120px)");
    const onWide = () => wide.matches && sheet.open && sheet.close();
    sheet.addEventListener("close", onClose);
    wide.addEventListener("change", onWide);
    return () => {
      sheet.removeEventListener("close", onClose);
      wide.removeEventListener("change", onWide);
    };
  }, []);

  const closeSheet = () => sheetRef.current?.close();

  return (
    <header className="l-header" ref={headerRef}>
      <div className="l-frame l-header-row">
        <Wordmark href="/" />
        <nav className="l-nav" aria-label="Primary">
          <ul className="l-nav-list">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a className="l-nav-item" href={item.href}>
                  {item.label}
                </a>
              </li>
            ))}
            <li className="l-nav-cta">
              <PillLink href={APP_HOME} variant="accent">
                {CTA_LABEL}
              </PillLink>
            </li>
          </ul>
        </nav>
        <div className="l-header-right">
          <PillLink href={REPO_URL} variant="ghost" className="l-hide-sm">
            {GITHUB_LABEL}
          </PillLink>
          <PillLink href={APP_HOME} variant="accent" className="l-hide-sm">
            {CTA_LABEL}
          </PillLink>
          <button
            ref={burgerRef}
            type="button"
            className="l-burger"
            aria-label="Open menu"
            aria-haspopup="dialog"
            onClick={() => sheetRef.current?.showModal()}
          >
            <Menu size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      <dialog
        ref={sheetRef}
        className="l-sheet"
        aria-label="Menu"
        onClick={(e) => e.target === sheetRef.current && closeSheet()}
      >
        <div className="l-sheet-head">
          <Wordmark href="/" />
          <button type="button" className="l-sheet-close" aria-label="Close menu" onClick={closeSheet}>
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="l-sheet-body" onClick={(e) => (e.target as HTMLElement).closest("a") && closeSheet()}>
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <a className="l-sheet-link" href={item.href}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <div className="l-sheet-actions">
            <PillLink href={APP_HOME} variant="accent" size="md">
              {CTA_LABEL}
            </PillLink>
            <PillLink href={REPO_URL} size="md">
              {GITHUB_LABEL}
            </PillLink>
          </div>
        </div>
      </dialog>
    </header>
  );
}
