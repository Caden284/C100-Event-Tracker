import { requirePermission } from "@/lib/auth";
import { listSemesters } from "@/lib/data/semesters";
import { formatDate } from "@/lib/domain/dates";
import { policyLabel } from "@/lib/domain/policy";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { assignPolicy, rollover, saveSemester } from "../actions";

export const metadata = { title: "Semesters" };

export default async function SemestersPage() {
  const s = await requirePermission("semesters.manage", "policies.approve");
  const semesters = await listSemesters(s.supabase);
  const [{ data: policies }, { data: evCounts }] = await Promise.all([
    s.supabase.from("membership_policies").select("id, name, version, status").neq("status", "retired").order("created_at", { ascending: false }),
    s.supabase.from("events").select("semester_id"),
  ]);
  const evBy = new Map<string, number>();
  for (const e of evCounts ?? []) if (e.semester_id) evBy.set(e.semester_id, (evBy.get(e.semester_id) ?? 0) + 1);
  const pol = new Map((policies ?? []).map((p) => [p.id, p]));
  const active = semesters.find((x) => x.status === "active");
  const upcoming = semesters.filter((x) => x.status === "upcoming");
  return (
    <>
      <PageHeader title="Semesters" back={{ href: "/settings", label: "Settings" }} description="Each semester has its own dates, dues deadline and policy. Attendance is always tied to its own semester and never carries over." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {semesters.map((x) => (
            <Card key={x.id}>
              <CardHeader title={`${x.name} · ${x.academic_year}`} description={`${formatDate(x.start_date)} – ${formatDate(x.end_date)} · ${evBy.get(x.id) ?? 0} events`}
                actions={<Badge tone={x.status === "active" ? "green" : x.status === "archived" ? "neutral" : "blue"}>{x.status}</Badge>} />
              <CardBody className="space-y-4">
                <p className="text-sm">Policy: <strong>{policyLabel(x.policy_id ? pol.get(x.policy_id) ?? null : null)}</strong></p>
                {s.can("semesters.manage") ? (
                  <ActionForm action={saveSemester} className="grid gap-3 sm:grid-cols-5">
                    <input type="hidden" name="id" value={x.id} />
                    <Field label="Term" htmlFor={`t${x.id}`}><Select id={`t${x.id}`} name="term" defaultValue={x.term}><option>Fall</option><option>Spring</option><option>Summer</option></Select></Field>
                    <Field label="Year" htmlFor={`y${x.id}`}><Input id={`y${x.id}`} name="year" type="number" defaultValue={x.name.match(/\d{4}/)?.[0]} /></Field>
                    <Field label="Start" htmlFor={`s${x.id}`}><Input id={`s${x.id}`} name="start_date" type="date" defaultValue={x.start_date} /></Field>
                    <Field label="End" htmlFor={`e${x.id}`}><Input id={`e${x.id}`} name="end_date" type="date" defaultValue={x.end_date} /></Field>
                    <Field label="Dues deadline" htmlFor={`d${x.id}`}><Input id={`d${x.id}`} name="dues_deadline" type="date" defaultValue={x.dues_deadline ?? ""} /></Field>
                    <div className="sm:col-span-5"><SubmitButton size="sm" variant="secondary">Save dates</SubmitButton></div>
                  </ActionForm>
                ) : null}
                <ActionForm action={assignPolicy} className="flex flex-wrap items-end gap-2" confirm={x.status === "archived" ? { title: "Change the policy of an archived semester?", body: "This is a retroactive change to past standing. It is recorded with your reason." } : undefined}>
                  <input type="hidden" name="semester_id" value={x.id} />
                  <Field label="Assign policy" htmlFor={`p${x.id}`}><Select id={`p${x.id}`} name="policy_id" defaultValue={x.policy_id ?? ""} className="w-72">{(policies ?? []).map((p) => <option key={p.id} value={p.id}>{p.name} v{p.version} ({p.status})</option>)}</Select></Field>
                  <Field label={x.status === "archived" ? "Recorded decision (required)" : "Reason"} htmlFor={`r${x.id}`}><Input id={`r${x.id}`} name="reason" className="w-64" /></Field>
                  <SubmitButton size="sm" variant="secondary">Assign</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
          ))}
        </div>
        {s.can("semesters.manage") ? (
          <div className="space-y-4">
            <Card>
              <CardHeader title="Add a semester" />
              <CardBody>
                <ActionForm action={saveSemester} className="space-y-3" resetOnSuccess>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Term" htmlFor="nt"><Select id="nt" name="term"><option>Spring</option><option>Fall</option><option>Summer</option></Select></Field>
                    <Field label="Year" htmlFor="ny"><Input id="ny" name="year" type="number" required /></Field>
                  </div>
                  <Field label="Start" htmlFor="ns"><Input id="ns" name="start_date" type="date" required /></Field>
                  <Field label="End" htmlFor="ne"><Input id="ne" name="end_date" type="date" required /></Field>
                  <Field label="Dues deadline" htmlFor="nd"><Input id="nd" name="dues_deadline" type="date" /></Field>
                  <SubmitButton size="sm">Add semester</SubmitButton>
                </ActionForm>
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Semester rollover" description="Archives the current semester and makes the next one current." />
              <CardBody className="space-y-3 text-sm">
                {!active || upcoming.length === 0 ? <p className="text-slate-500">Rollover needs an active semester and an upcoming one.</p> : (
                  <>
                    <Callout tone="info">
                      <ul className="list-disc pl-4">
                        <li>All attendance, recognition and disciplinary records are kept.</li>
                        <li>Members and prospects carry forward with their current status.</li>
                        <li>New calculations start fresh; old attendance never counts toward the new semester.</li>
                        <li>Assign and approve the new semester’s policy first (it’s labeled “draft” otherwise).</li>
                      </ul>
                    </Callout>
                    <ActionForm action={rollover} className="space-y-2" confirm={{ title: "Run semester rollover?", body: `${active.name} will be archived and become read-only for calculations.`, confirmLabel: "Roll over", danger: true }}>
                      <input type="hidden" name="from" value={active.id} />
                      <p>From <strong>{active.name}</strong> to:</p>
                      <Select name="to" aria-label="Next semester">{upcoming.map((u) => <option key={u.id} value={u.id}>{u.name} — {u.policy_id ? policyLabel(pol.get(u.policy_id)) : "no policy yet"}</option>)}</Select>
                      <Input name="reason" placeholder="Note (optional)" aria-label="Note" />
                      <Input name="confirm_text" placeholder="Type ROLLOVER" aria-label="Confirmation" required />
                      <SubmitButton size="sm" variant="danger-outline">Roll over</SubmitButton>
                    </ActionForm>
                  </>
                )}
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
