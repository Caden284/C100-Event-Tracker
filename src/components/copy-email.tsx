"use client";

import { useState } from "react";
import { Button, buttonClass } from "@/components/ui/button";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and some in-app browsers block the clipboard API.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button size="sm" variant="secondary" onClick={async () => {
      setState((await copyText(text)) ? "copied" : "failed");
      setTimeout(() => setState("idle"), 2000);
    }}>
      {state === "copied" ? "Copied ✓" : state === "failed" ? "Select and copy below" : label}
    </Button>
  );
}

/** Subject and body with copy buttons, plus an "open in mail app" link when an address is known. */
export function EmailPreview({ to, subject, body }: { to?: string | null; subject: string; body: string }) {
  const mailto = to ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <CopyButton text={body} label="Copy email" />
        <CopyButton text={subject} label="Copy subject" />
        {to ? <CopyButton text={to} label="Copy address" /> : null}
        {mailto ? <a href={mailto} className={buttonClass({ variant: "secondary", size: "sm" })}>Open in mail app</a> : null}
      </div>
      <div className="rounded-md border border-slate-200 bg-slate-50 text-sm">
        {to ? <p className="border-b border-slate-200 px-3 py-1.5 text-xs text-slate-600"><span className="font-medium text-slate-700">To:</span> {to}</p> : null}
        <p className="border-b border-slate-200 px-3 py-1.5 text-xs text-slate-600"><span className="font-medium text-slate-700">Subject:</span> {subject}</p>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words px-3 py-2 font-sans text-sm text-slate-800">{body}</pre>
      </div>
    </div>
  );
}

/** A small "Email" toggle for a table row that opens the filled-in email underneath. */
export function EmailToggle({ to, subject, body, label = "Email" }: { to?: string | null; subject: string; body: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button size="sm" variant={open ? "ghost" : "secondary"} onClick={() => setOpen((o) => !o)} aria-expanded={open}>{open ? "Hide email" : label}</Button>
      {open ? <div className="mt-2"><EmailPreview to={to} subject={subject} body={body} /></div> : null}
    </div>
  );
}
