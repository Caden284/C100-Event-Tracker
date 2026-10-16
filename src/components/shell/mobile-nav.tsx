"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { NavLinks } from "./nav-links";
import type { NavItem } from "./nav-config";
import { Brand } from "./brand";

export function MobileNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
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
      {open ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <nav className="relative flex w-72 max-w-[85vw] flex-col bg-ink px-3 py-4">
            <div className="mb-4 flex items-center justify-between px-2">
              <Brand />
              <button type="button" onClick={() => setOpen(false)} className="rounded-md p-1 text-slate-300 hover:bg-white/10" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            <NavLinks items={items} onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      ) : null}
    </div>
  );
}
