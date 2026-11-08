/**
 * Copy-and-paste notice emails for members who have received strikes.
 * The wording follows the chapter's strike levels: 1 = written warning,
 * 2 = probation and a meeting, 3 = executive board review. Nothing here sends
 * anything: officers copy the text into their own email.
 */

export type StrikeEmailLevel = 1 | 2 | 3;

export const STRIKE_EMAIL_LEVELS: { level: StrikeEmailLevel; label: string; when: string }[] = [
  { level: 1, label: "First strike: written warning", when: "Send when a member reaches 1 strike." },
  { level: 2, label: "Second strike: probation", when: "Send when a member reaches 2 strikes." },
  { level: 3, label: "Third strike: executive board review", when: "Send when a member reaches 3 strikes (the final threshold)." },
];

export type StrikeEmailInput = {
  /** Greeting name, e.g. the member's first or preferred name. */
  firstName: string;
  strikes: number;
  reasons: { reason: string; date?: string | null }[];
  semesterName?: string | null;
  senderName?: string | null;
  senderRole?: string | null;
};

export type StrikeEmail = { level: StrikeEmailLevel; subject: string; body: string };

/** Which template applies to a strike count, or null when there are no active strikes. */
export function strikeEmailLevel(strikes: number): StrikeEmailLevel | null {
  if (strikes <= 0) return null;
  return strikes >= 3 ? 3 : (strikes as StrikeEmailLevel);
}

/** "Hi Jordan" from "Jordan Smith"; empty names become a placeholder. */
export function greetingName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first || "[First name]";
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function reasonLines(reasons: StrikeEmailInput["reasons"]): string {
  if (!reasons.length) return "- [Reason for the strike]";
  return reasons.map((r) => `- ${r.reason.trim()}${r.date ? ` (recorded ${formatShortDate(r.date)})` : ""}`).join("\n");
}

function signature(input: StrikeEmailInput): string {
  return [input.senderName?.trim() || "[Your name]", input.senderRole?.trim() || "[Your role]", "Collegiate 100 at Georgia State University"].join("\n");
}

const APPEAL = "If you believe this is a mistake, or there was a reason you couldn't be there that we should know about, reply to this email within 7 days and we will review it.";

export function strikeEmail(input: StrikeEmailInput, level: StrikeEmailLevel = strikeEmailLevel(input.strikes) ?? 1): StrikeEmail {
  const name = input.firstName.trim() || "[First name]";
  const count = Math.max(input.strikes, level);
  const strikesText = `${count} strike${count === 1 ? "" : "s"}`;
  const term = input.semesterName?.trim() ? ` for ${input.semesterName.trim()}` : " this semester";
  const reasons = reasonLines(input.reasons);
  const sign = signature(input);

  if (level === 1) {
    return {
      level,
      subject: "Collegiate 100: Strike notice (1 of 3)",
      body: `Hi ${name},

I'm reaching out on behalf of the Collegiate 100 executive board. You have received 1 strike${term} for the following:

${reasons}

Under our strike policy, a first strike is a written warning, and this email is that notice. Nothing else changes right now. For reference, a second strike places a member on probation with a meeting with the President or Membership Chair, and a third strike goes to the executive board for review.

${APPEAL}

We want you active and successful in the chapter. If something is making it hard to meet the requirements, let me know and we can talk about it.

Thank you,
${sign}`,
    };
  }

  if (level === 2) {
    return {
      level,
      subject: "Collegiate 100: Probation notice (2 of 3 strikes)",
      body: `Hi ${name},

I'm following up on behalf of the Collegiate 100 executive board. You now have ${strikesText}${term}:

${reasons}

Under our strike policy, a second strike places you on probation. Please reply within the next 7 days to set up a meeting with the President or Membership Chair, so we can talk through what's going on and make a plan for the rest of the semester.

Please keep in mind that a third strike would send your membership to the executive board for review.

${APPEAL}

We would much rather help you get back on track than lose you as a member, so please reach out.

Thank you,
${sign}`,
    };
  }

  return {
    level,
    subject: "Collegiate 100: Executive board review (3 strikes)",
    body: `Hi ${name},

I'm writing on behalf of the Collegiate 100 executive board. You have now reached ${strikesText}${term}, which is the final threshold under our strike policy:

${reasons}

Your membership will now be reviewed by the executive board. No decision has been made yet, and nothing is automatic. You will have the chance to share your side before the board decides.

Please reply within 7 days with anything you would like the board to consider, including if you believe a strike was recorded by mistake, or to set up a time to meet. If we don't hear from you, the board will make its decision based on the information it has.

Thank you,
${sign}`,
  };
}
