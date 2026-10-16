import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { listSemesters } from "@/lib/data/semesters";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { EventForm } from "../../event-form";

export const metadata = { title: "Edit event" };

export default async function EditEvent({ params }: PageProps<"/events/[id]/edit">) {
  const { id } = await params;
  const s = await requirePermission("events.write");
  const [{ data: ev }, { data: cats }, semesters, { data: pin }] = await Promise.all([
    s.supabase.from("events").select("*").eq("id", id).maybeSingle(),
    s.supabase.from("event_categories").select("key, name, is_active").order("sort_order"),
    listSemesters(s.supabase),
    s.supabase.from("event_pin_names").select("pin_name").eq("event_id", id).eq("is_primary", true).maybeSingle(),
  ]);
  if (!ev) notFound();
  return (
    <>
      <PageHeader title={`Edit: ${ev.name}`} back={{ href: `/events/${id}`, label: ev.name }} />
      <Card><CardBody>
        <EventForm values={{ ...ev, pin_name: pin?.pin_name ?? null }} categories={cats ?? []} semesters={semesters} canOverride={s.can("policies.approve")} />
      </CardBody></Card>
    </>
  );
}
