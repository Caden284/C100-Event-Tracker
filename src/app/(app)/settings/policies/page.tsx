import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PageHeader, Callout } from "@/components/ui/misc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";

export const metadata = { title: "Membership policies" };

export default async function PoliciesPage() {
  const s = await requirePermission("policies.read");
  const { data } = await s.supabase.from("membership_policies").select("id, name, version, status, source, created_at, approved_at, approval_requested_at, semesters!membership_policies_effective_semester_id_fkey(name)").order("created_at", { ascending: false });
  return (
    <>
      <PageHeader title="Membership policies" back={{ href: "/settings", label: "Settings" }} description="Versioned rules: Draft → Approved (locked) → Retired. Only an approved policy can support formal decisions." />
      <Callout tone="draft" className="mb-4">Policies imported from the workbook are drafts. They reflect the workbook’s existing values, not rules the executive board has approved.</Callout>
      <Card>
        <Table>
          <THead><tr><TH>Policy</TH><TH>Semester</TH><TH>Status</TH><TH>Source</TH><TH>Created</TH></tr></THead>
          <TBody>{(data ?? []).map((p) => (
            <TR key={p.id}><TD><Link href={`/settings/policies/${p.id}`} className="font-medium hover:text-brand">{p.name} v{p.version}</Link></TD><TD>{(p.semesters as { name: string } | null)?.name ?? "—"}</TD>
              <TD><Badge tone={p.status === "approved" ? "green" : p.status === "draft" ? "draft" : "neutral"}>{p.status === "draft" ? "Draft — pending approval" : p.status}</Badge>{p.approval_requested_at && p.status === "draft" ? <Badge tone="amber" className="ml-1">approval requested</Badge> : null}</TD>
              <TD className="text-xs">{p.source.replace("_", " ")}</TD><TD className="text-xs">{new Date(p.created_at).toLocaleDateString("en-US")}</TD></TR>
          ))}</TBody>
        </Table>
      </Card>
    </>
  );
}
