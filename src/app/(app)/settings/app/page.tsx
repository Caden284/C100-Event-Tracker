import { requirePermission } from "@/lib/auth";
import { getSetting } from "@/lib/data/settings";
import { PageHeader } from "@/components/ui/misc";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { saveAppSettings } from "../actions";

export const metadata = { title: "Indicators & limits" };

export default async function AppSettingsPage() {
  const s = await requirePermission("settings.manage");
  const [eng, risk, lim] = await Promise.all([getSetting(s.supabase, "prospect_engagement"), getSetting(s.supabase, "at_risk"), getSetting(s.supabase, "import_limits")]);
  return (
    <>
      <PageHeader title="Indicators & limits" back={{ href: "/settings", label: "Settings" }} />
      <Card><CardBody>
        <ActionForm action={saveAppSettings} className="grid gap-4 sm:grid-cols-2">
          <Field label="Prospect “High” interest at (events)" htmlFor="h" hint="Workbook: 3+"><Input id="h" name="high_min_events" type="number" min={1} defaultValue={eng.high_min_events} /></Field>
          <Field label="Prospect “Medium” interest at (events)" htmlFor="m" hint="Workbook: 2"><Input id="m" name="medium_min_events" type="number" min={1} defaultValue={eng.medium_min_events} /></Field>
          <Field label="Behind-pace margin (0–1)" htmlFor="b" hint="Flag when requirement progress trails the share of the semester elapsed by more than this."><Input id="b" name="behind_pace_margin" type="number" step="0.05" min={0} max={1} defaultValue={risk.behind_pace_margin} /></Field>
          <div />
          <Field label="Max upload size (MB, ≤10)" htmlFor="f"><Input id="f" name="max_file_mb" type="number" min={1} max={10} defaultValue={lim.max_file_mb} /></Field>
          <Field label="Max rows per upload" htmlFor="r"><Input id="r" name="max_rows" type="number" min={100} max={20000} defaultValue={lim.max_rows} /></Field>
          <div className="sm:col-span-2"><SubmitButton>Save</SubmitButton></div>
        </ActionForm>
      </CardBody></Card>
    </>
  );
}
