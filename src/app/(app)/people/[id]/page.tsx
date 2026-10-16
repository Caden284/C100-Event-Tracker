import { notFound, redirect } from "next/navigation";
import { requireOfficer } from "@/lib/auth";

/** Resolves a person id to their member or prospective-member page. */
export default async function PersonRedirect({ params }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const s = await requireOfficer();
  const { data } = await s.supabase.from("v_people_directory").select("member_id, prospect_id").eq("person_id", id).maybeSingle();
  if (data?.member_id) redirect(`/members/${data.member_id}`);
  if (data?.prospect_id) redirect(`/prospects/${data.prospect_id}`);
  notFound();
}
