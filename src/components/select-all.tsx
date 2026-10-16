"use client";

/** A checkbox that ticks or clears every checkbox with the given name in the same form. */
export function SelectAll({ name, label = "Select all" }: { name: string; label?: string }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
      <input
        type="checkbox"
        onChange={(e) => {
          const form = e.currentTarget.form;
          if (!form) return;
          for (const el of Array.from(form.elements)) {
            if (el instanceof HTMLInputElement && el.type === "checkbox" && el.name === name) el.checked = e.currentTarget.checked;
          }
        }}
      />
      {label}
    </label>
  );
}
