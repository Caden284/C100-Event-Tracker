import { requirePermission } from "@/lib/auth";
import { resolveSemester } from "@/lib/data/semesters";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { LinkButton } from "@/components/ui/button";
import { EventForm } from "../event-form";

export const metadata = { title: "New event" };

export default async function NewEvent({ searchParams }: PageProps<"/events/new">) {
  const params = await searchParams;
  const s = await requirePermission("events.write");
  const [{ current, all }, { data: cats }] = await Promise.all([resolveSemester(s.supabase), s.supabase.from("event_categories").select("key, name, is_active").order("sort_order")]);
  const date = typeof params.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : null;
  return (
    <>
      <PageHeader title="New event" back={{ href: "/events", label: "Events" }}
        actions={<><LinkButton href="/events/series">Recurring series</LinkButton><LinkButton href="/events/import">Import calendar (CSV)</LinkButton></>} />
      <Card><CardBody>
        <EventForm values={{ event_date: date, semester_id: current?.id ?? null }} categories={cats ?? []} semesters={all} canOverride={s.can("policies.approve")} />
      </CardBody></Card>
    </>
  );
}
