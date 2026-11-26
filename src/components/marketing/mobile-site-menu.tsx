"use client";

import Link from "next/link";
import { useEffect, useRef, type MouseEvent } from "react";
import { AccountLinks } from "./account-links";
import styles from "./mobile-site-menu.module.css";

type MenuPage = { path: string; label: string };

export function MobileSiteMenu({ pages }: { pages: readonly MenuPage[] }) {
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);

  useEffect(() => {
    const details = menu.current;
    if (!details) return;

    function dismissOnOutsidePress(event: PointerEvent) {
      if (details?.open && event.target instanceof Node && !details.contains(event.target)) {
        details.open = false;
      }
    }

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && details?.open) {
        details.open = false;
        trigger.current?.focus();
      }
    }

    // Match the header's lg breakpoint so the menu stays closed after resizing.
    const desktop = window.matchMedia("(min-width: 1024px)");
    function dismissOnDesktop(event: MediaQueryListEvent) {
      if (event.matches && details) details.open = false;
    }

    document.addEventListener("pointerdown", dismissOnOutsidePress);
    document.addEventListener("keydown", dismissOnEscape);
    desktop.addEventListener("change", dismissOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePress);
      document.removeEventListener("keydown", dismissOnEscape);
      desktop.removeEventListener("change", dismissOnDesktop);
    };
  }, []);

  function dismissOnNavigation(event: MouseEvent<HTMLDivElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element) || !event.target.closest("a[href]")) return;

    const details = menu.current;
    if (!details) return;
    if (event.currentTarget.contains(document.activeElement)) trigger.current?.focus();
    details.open = false;
  }

  return (
    <details ref={menu} className={`${styles.menu} relative shrink-0 lg:hidden`}>
      <summary
        ref={trigger}
        aria-label="Menu"
        className="grid h-11 w-11 cursor-pointer list-none place-items-center rounded-full border border-line bg-card text-paper shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
      >
        <span className={styles.icon} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </summary>
      <div
        className={`${styles.panel} absolute right-0 top-full z-40 mt-1 overflow-y-auto rounded-2xl border border-line bg-card p-3 shadow-lift`}
        onClick={dismissOnNavigation}
      >
        <nav aria-label="Main">
          <ul className="space-y-0.5">
            {pages.map(({ path, label }) => (
              <li key={path}>
                <Link
                  href={path}
                  className="flex min-h-11 items-center rounded-xl px-3 py-2.5 text-sm font-medium text-paper/80 hover:bg-paper/[0.06] hover:text-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-3 border-t border-line pt-3">
          <AccountLinks compact />
        </div>
      </div>
    </details>
  );
}
