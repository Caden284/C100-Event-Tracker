import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Checkbox, Input } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveAbsenceReason, saveCategoryConfig, saveStatusConfig } from "../actions";

export const metadata = { title: "Categories & statuses" };

export default async function CategoriesPage() {
  const s = await requirePermission("settings.manage");
  const [{ data: cats }, { data: ms }, { data: as }, { data: reasons }] = await Promise.all([
    s.supabase.from("event_categories").select("*").order("sort_order"),
    s.supabase.from("member_statuses").select("*").order("sort_order"),
    s.supabase.from("attendance_statuses").select("*").order("sort_order"),
    s.supabase.from("absence_reasons").select("*").order("sort_order"),
  ]);
  return (
    <>
      <PageHeader title="Categories & statuses" back={{ href: "/settings", label: "Settings" }} />
      <Callout tone="info" className="mb-4">How a category counts toward requirements is set in the <Link className="underline" href="/settings/policies">membership policy</Link>, so changing it is always a recorded, versioned decision. Deactivating a category hides it from new events but keeps history intact.</Callout>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Event categories" />
          <CardBody className="space-y-3">
            {[...(cats ?? []), null].map((c, i) => (
              <ActionForm key={c?.key ?? `new${i}`} action={saveCategoryConfig} className="grid items-end gap-2 rounded-md border border-slate-200 p-3 sm:grid-cols-[1fr_2fr_auto]">
                {c ? <><input type="hidden" name="existing" value="1" /><input type="hidden" name="key" value={c.key} /></> : null}
                <Input name="name" defaultValue={c?.name ?? ""} placeholder="New category name" aria-label="Name" required />
                <Input name="description" defaultValue={c?.description ?? ""} placeholder="Description" aria-label="Description" />
                <input type="hidden" name="sort_order" value={c?.sort_order ?? 20} />
                <div className="flex items-center gap-3">
                  <Checkbox name="is_active" defaultChecked={c?.is_active ?? true} label="Active" className="text-xs" />
                  <Checkbox name="is_recruitment" defaultChecked={c?.is_recruitment ?? false} label="Recruitment" className="text-xs" />
                  <SubmitButton size="sm" variant="secondary">{c ? "Save" : "Add"}</SubmitButton>
                </div>
                {c?.is_legacy ? <p className="text-xs text-slate-500 sm:col-span-3">Legacy category from the workbook — counts toward nothing unless a policy adds it.</p> : null}
              </ActionForm>
            ))}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Membership statuses" description="Workbook values preserved: Active, Not Verified, Inactive, Graduated, Removed." />
            <CardBody className="space-y-2">
              {[...(ms ?? []), null].map((x, i) => (
                <ActionForm key={x?.key ?? `n${i}`} action={saveStatusConfig} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
                  <input type="hidden" name="table" value="member_statuses" />
                  {x ? <><input type="hidden" name="existing" value="1" /><input type="hidden" name="key" value={x.key} /></> : null}
                  <Input name="name" defaultValue={x?.name ?? ""} placeholder="New status" className="h-8 w-36 text-xs" aria-label="Name" required />
                  <Input name="description" defaultValue={x?.description ?? ""} className="h-8 flex-1 text-xs" aria-label="Description" />
                  <Checkbox name="counts_as_active" defaultChecked={x?.counts_as_active} label="Active" className="text-xs" />
                  <Checkbox name="is_tracked" defaultChecked={x?.is_tracked ?? true} label="Tracked" className="text-xs" />
                  <Checkbox name="is_active" defaultChecked={x?.is_active ?? true} label="In use" className="text-xs" />
                  <SubmitButton size="sm" variant="ghost">{x ? "Save" : "Add"}</SubmitButton>
                </ActionForm>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Attendance statuses" description="Only statuses marked as counting are treated as attendance. “Excused absence” is recorded by an officer with a reason, never from a PIN export." />
            <CardBody className="space-y-2">
              {(as ?? []).map((x) => (
                <ActionForm key={x.key} action={saveStatusConfig} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
                  <input type="hidden" name="table" value="attendance_statuses" /><input type="hidden" name="key" value={x.key} />
                  <span className="w-44 text-sm font-medium">{x.name}{x.counts_as_attended ? " · counts" : ""}</span>
                  {x.key === "excused" ? <span className="flex-1 text-xs text-slate-500">Recorded with “Record an absence”</span> : <Input name="pin_aliases" defaultValue={x.pin_aliases.join(", ")} className="h-8 flex-1 text-xs" aria-label="PIN values" title="Values in PIN exports that mean this status" />}
                  <Checkbox name="is_active" defaultChecked={x.is_active} label="In use" className="text-xs" />
                  <SubmitButton size="sm" variant="ghost">Save</SubmitButton>
                </ActionForm>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Absence reasons" description="Choices officers pick when excusing an absence. “Note required” makes them add a short explanation." />
            <CardBody className="space-y-2">
              {[...(reasons ?? []), null].map((x, i) => (
                <ActionForm key={x?.key ?? `r${i}`} action={saveAbsenceReason} className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 p-2">
                  {x ? <><input type="hidden" name="existing" value="1" /><input type="hidden" name="key" value={x.key} /></> : null}
                  <Input name="name" defaultValue={x?.name ?? ""} placeholder="New reason" className="h-8 w-52 text-xs" aria-label="Reason" required />
                  <Input name="description" defaultValue={x?.description ?? ""} className="h-8 flex-1 text-xs" aria-label="Description" />
                  <Checkbox name="requires_note" defaultChecked={x?.requires_note ?? false} label="Note required" className="text-xs" />
                  <Checkbox name="is_active" defaultChecked={x?.is_active ?? true} label="In use" className="text-xs" />
                  <SubmitButton size="sm" variant="ghost">{x ? "Save" : "Add"}</SubmitButton>
                </ActionForm>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
