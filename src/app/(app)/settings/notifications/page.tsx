import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { ActionForm } from "@/components/action-form";
import { setNotificationPref } from "../actions";

export const metadata = { title: "Notification settings" };
const NOTIFICATION_TYPES = [
  ["unmatched_scans", "Unmatched scans after an import"], ["discipline_proposed", "Disciplinary action proposed"], ["policy_approval", "Policy awaiting approval"],
  ["nominations_open", "Nominations open"], ["voting_open", "Voting open"],
] as const;

export default async function NotificationSettings() {
  const s = await requirePermission("users.manage");
  const [{ data: roles }, { data: prefs }] = await Promise.all([s.supabase.from("roles").select("key, name").order("name"), s.supabase.from("notification_preferences").select("*")]);
  const off = new Set((prefs ?? []).filter((p) => !p.enabled).map((p) => `${p.role_key}|${p.type}`));
  return (
    <>
      <PageHeader title="Notifications" back={{ href: "/settings", label: "Settings" }} description="In-app alerts are sent only to officers whose role has the related permission. Repeated alerts are grouped." />
      <Callout tone="info" className="mb-4">Email notifications are not sent: no email service is configured. The hub never notifies members about probation.</Callout>
      <Card>
        <div className="overflow-x-auto p-3">
          <table className="text-sm">
            <thead><tr><th className="px-2 py-1 text-left">Alert</th>{(roles ?? []).map((r) => <th key={r.key} className="px-2 py-1 text-xs font-medium">{r.name}</th>)}</tr></thead>
            <tbody>{NOTIFICATION_TYPES.map(([t, label]) => (
              <tr key={t} className="border-t border-slate-100"><td className="px-2 py-2">{label}</td>
                {(roles ?? []).map((r) => {
                  const on = !off.has(`${r.key}|${t}`);
                  return <td key={r.key} className="px-2 text-center"><ActionForm action={setNotificationPref} showMessage={false}><input type="hidden" name="role_key" value={r.key} /><input type="hidden" name="type" value={t} /><input type="hidden" name="enabled" value={on ? "false" : "true"} />
                    <button className={`rounded px-2 py-0.5 text-xs ${on ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`} aria-label={`${label} for ${r.name}: ${on ? "on" : "off"}`}>{on ? "On" : "Off"}</button></ActionForm></td>;
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
