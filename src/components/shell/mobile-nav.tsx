"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./nav-links";
import type { NavItem } from "./nav-config";
import { Brand } from "./brand";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  // Lock page scrolling behind the drawer and close it with Escape.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
        aria-label="Open navigation"
        aria-expanded={open}
      >
        <Menu className="h-5 w-5" />
      </button>
      {/* Rendered into <body>: the sticky header uses backdrop-blur, which would
          otherwise confine a fixed-position drawer to the header's own box. */}
      {open
        ? createPortal(
            <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
              <div className="absolute inset-0 bg-ink/60" onClick={() => setOpen(false)} />
              <nav className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto bg-ink px-3 py-4 shadow-xl">
                <div className="mb-4 flex items-center justify-between px-2">
                  <Brand />
                  <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-300 hover:bg-white/10" aria-label="Close navigation">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <NavLinks items={items} onNavigate={() => setOpen(false)} />
              </nav>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
