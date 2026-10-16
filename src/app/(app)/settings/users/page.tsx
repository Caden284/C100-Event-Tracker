import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { createRole, inviteOfficer, setActive, setRole, togglePermission } from "../actions";

export const metadata = { title: "Users & roles" };

export default async function UsersPage() {
  const s = await requirePermission("users.manage");
  const [{ data: profiles }, { data: roles }, { data: userRoles }, { data: perms }, { data: rolePerms }] = await Promise.all([
    s.supabase.from("profiles").select("id, email, full_name, is_active, created_at").order("full_name"),
    s.supabase.from("roles").select("*").order("is_system", { ascending: false }).order("name"),
    s.supabase.from("user_roles").select("user_id, role_key"),
    s.supabase.from("permissions").select("*").order("category").order("key"),
    s.supabase.from("role_permissions").select("role_key, permission_key"),
  ]);
  const rolesOf = (id: string) => (userRoles ?? []).filter((r) => r.user_id === id).map((r) => r.role_key);
  const has = new Set((rolePerms ?? []).map((r) => `${r.role_key}|${r.permission_key}`));
  const assignable = (roles ?? []).filter((r) => r.key !== "super_admin" || s.isSuperAdmin);
  return (
    <>
      <PageHeader title="Users & roles" back={{ href: "/settings", label: "Settings" }} description="Only invited executive board officers can sign in. There is no public registration." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Officers" />
          <Table>
            <THead><tr><TH>Officer</TH><TH>Roles</TH><TH>Add / remove role</TH><TH>Account</TH></tr></THead>
            <TBody>{(profiles ?? []).map((p) => {
              const mine = rolesOf(p.id);
              return (
                <TR key={p.id}>
                  <TD><span className="font-medium text-ink">{p.full_name ?? "—"}</span><span className="block text-xs text-slate-500">{p.email}</span></TD>
                  <TD className="space-x-1">{mine.length ? mine.map((r) => <Badge key={r} tone={r === "super_admin" ? "red" : "blue"}>{r.replace(/_/g, " ")}</Badge>) : <Badge tone="amber">no role</Badge>}</TD>
                  <TD>
                    <ActionForm action={setRole} className="flex gap-1" showMessage>
                      <input type="hidden" name="user_id" value={p.id} />
                      <Select name="role_key" className="h-8 w-36 text-xs" aria-label="Role">{assignable.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</Select>
                      <SubmitButton size="sm" variant="secondary" name="grant" value="true">Add</SubmitButton>
                      <SubmitButton size="sm" variant="ghost" name="grant" value="false">Remove</SubmitButton>
                    </ActionForm>
                  </TD>
                  <TD>{p.id === s.userId ? <span className="text-xs text-slate-400">you</span> : (
                    <ActionForm action={setActive} showMessage={false} confirm={p.is_active ? { title: `Deactivate ${p.email}?`, body: "They will immediately lose access. Their history is kept.", danger: true, confirmLabel: "Deactivate" } : undefined}>
                      <input type="hidden" name="user_id" value={p.id} /><input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
                      <SubmitButton size="sm" variant={p.is_active ? "danger-outline" : "secondary"}>{p.is_active ? "Deactivate" : "Re-activate"}</SubmitButton>
                    </ActionForm>)}</TD>
                </TR>
              );
            })}</TBody>
          </Table>
        </Card>
        <Card>
          <CardHeader title="Add an officer" />
          <CardBody>
            <ActionForm action={inviteOfficer} className="space-y-3" resetOnSuccess>
              <Field label="Email" htmlFor="ie"><Input id="ie" name="email" type="email" required /></Field>
              <Field label="Full name" htmlFor="in"><Input id="in" name="full_name" /></Field>
              <fieldset><legend className="text-xs font-medium text-slate-700">Roles</legend><div className="mt-1 space-y-1">{assignable.map((r) => <Checkbox key={r.key} name="roles" value={r.key} label={r.name} hint={r.description ?? undefined} />)}</div></fieldset>
              <Field label="How to share access" htmlFor="im"><Select id="im" name="method"><option value="password">Create with a one-time password (works without email setup)</option><option value="invite">Email an invitation (needs an email provider in Supabase)</option></Select></Field>
              <SubmitButton size="sm">Add officer</SubmitButton>
            </ActionForm>
          </CardBody>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader title="Role permissions" description={s.isSuperAdmin ? "Click to grant or revoke. Enforced by the database, not just the interface." : "Only a super administrator can change these."}
          actions={<ActionForm action={createRole} className="flex gap-1" showMessage><Input name="name" placeholder="New role name" className="h-8 w-40 text-xs" aria-label="New role" required /><SubmitButton size="sm" variant="secondary">Add role</SubmitButton></ActionForm>} />
        <Callout tone="info" className="mx-5 mt-4">Super administrators always hold every permission.</Callout>
        <div className="overflow-x-auto p-2">
          <table className="text-xs">
            <thead><tr><th className="sticky left-0 bg-white px-2 py-1 text-left">Permission</th>{(roles ?? []).filter((r) => r.key !== "super_admin").map((r) => <th key={r.key} className="px-2 py-1 font-medium">{r.name}</th>)}</tr></thead>
            <tbody>{(perms ?? []).map((p) => (
              <tr key={p.key} className="border-t border-slate-100">
                <td className="sticky left-0 bg-white px-2 py-1" title={p.description}><span className="text-slate-400">{p.category} · </span>{p.description}</td>
                {(roles ?? []).filter((r) => r.key !== "super_admin").map((r) => {
                  const on = has.has(`${r.key}|${p.key}`);
                  return (
                    <td key={r.key} className="px-2 py-1 text-center">
                      {s.isSuperAdmin ? (
                        <ActionForm action={togglePermission} showMessage={false}>
                          <input type="hidden" name="role_key" value={r.key} /><input type="hidden" name="permission_key" value={p.key} /><input type="hidden" name="grant" value={on ? "false" : "true"} />
                          <button className={`h-5 w-5 rounded border ${on ? "border-brand bg-brand text-white" : "border-slate-300 bg-white"}`} aria-label={`${on ? "Revoke" : "Grant"} ${p.key} for ${r.name}`}>{on ? "✓" : ""}</button>
                        </ActionForm>
                      ) : on ? "✓" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
