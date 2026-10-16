/**
 * Builds a SAMPLE workbook with the same structure as C100_Membership_Tracker.xlsx
 * but entirely FICTIONAL people. Used by tests; also written to samples/ by
 * `npm run samples`.
 */
import ExcelJS from "exceljs";

export async function buildSampleWorkbook(opts: { meetingsCached?: number } = {}): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const dash = wb.addWorksheet("Dashboard");
  dash.addRow(["Collegiate 100 at GSU - Fall 2026 Dashboard"]);
  dash.addRow([]); dash.addRow([]); dash.addRow(["MEMBERSHIP"]);
  dash.addRow(["Members on roster (Active)", { formula: 'COUNTIF(Members!$F$2:$F$300,"Active")', result: 2 }]);

  const set = wb.addWorksheet("Settings");
  set.addRow(["Collegiate 100 at GSU - Membership Tracker"]);
  set.addRow(["Fall 2026  |  Built Sep 4, 2026"]);
  set.addRow([]); set.addRow(["Active-member standards (per semester)"]);
  set.addRow(["Meetings required", 2]);
  set.addRow(["General events required", 3]);
  set.addRow(["Service events required", 3]);
  set.addRow(["Mentoring (Carver/BEST) required", 3]);
  set.addRow(["Dues deadline", new Date(Date.UTC(2026, 9, 8))]);

  const ev = wb.addWorksheet("Events");
  ev.addRow(["Date", "Event", "Time", "Location / Room", "Category", "PIN Event Name (exact, for matching)", "Status", "Members Scanned", "Prospects Scanned", "Total Scanned", "Notes"]);
  ev.addRow([new Date(Date.UTC(2026, 8, 2)), "Kickoff (GBM)", "5:30-7:00 PM", "Library Classroom 1", "Meeting", "Kickoff: General Body Meeting", { formula: 'IF(A2="","TBD","Logged")', result: "Logged" }, null, null, null, "General Body Meeting"]);
  ev.addRow([new Date(Date.UTC(2026, 8, 3)), "Meet The 100", "6:00-7:30 PM", "SCW 466", "Recruitment", "Meet the 100", null, null, null, null, "Prospective-member event"]);
  ev.addRow([new Date(Date.UTC(2026, 8, 18)), "Park Clean Up", "TBD", "TBD", "Service", "Park Clean Up", null, null, null, null, "Manual paper sign-in (no PIN scans)"]);
  ev.addRow([new Date(Date.UTC(2026, 9, 23)), "Wellness Pilates", "12:00-3:00 PM", "Veterans Hall", "General", null, null, null, null, null, "PENDING approval"]);
  ev.addRow([null, "Community Impact Day", null, null, "Service", null, null, null, null, null, "Date TBD"]);

  const log = wb.addWorksheet("Attendance Log");
  log.addRow(["PIN Event Name", "Event Date", "First Name", "Last Name", "Email", "Attendance Status", "Marked By", "Marked On", "Card ID", "Category", "Person Type"]);
  const d = (day: number) => new Date(Date.UTC(2026, 8, day));
  log.addRow(["Kickoff: General Body Meeting", d(2), "Alex", "Rivera", "arivera1@student.gsu.edu", "Attended", "Officer A", "9/2/2026 5:37 PM", "001000001", { formula: "x", result: "Meeting" }, { formula: "y", result: "Member" }]);
  log.addRow(["Kickoff: General Body Meeting", d(2), "Blair", "Chen", "bchen2@student.gsu.edu", "Attended", "Officer A", "9/2/2026 5:40 PM", "001000002"]);
  log.addRow(["Meet the 100", d(3), "Alex", "Rivera", "ARivera1@student.gsu.edu", "Attended", "Officer A", "9/3/2026 6:01 PM", "001000001"]);
  log.addRow(["Meet the 100", d(3), "Casey", "Diaz", "cdiaz3@student.gsu.edu", "Attended", "Officer A", "9/3/2026 6:02 PM", "001000003"]);
  log.addRow(["Park Clean Up", d(18), "Drew", "Evans", "MANUAL-devans", "Attended", "Manual (paper sign-in)", "09/25/2026", "MANUAL"]);
  log.addRow(["Park Clean Up", d(18), "Blair", "Chen", "bchen2@student.gsu.edu", "Attended", "Manual (paper sign-in)", "09/25/2026", "MANUAL"]);
  log.addRow(["Unknown Event Name", d(20), "Blair", "Chen", "bchen2@student.gsu.edu", "Attended", "Officer A", "9/20/2026", "001000002"]);

  const mem = wb.addWorksheet("Members");
  mem.addRow(["First Name", "Last Name", "Email", "E-Board Role", "Committee", "Member Status", "Dues Paid (Y/N)", "Dues Status", "Meetings", "General Events", "Service", "Mentoring", "Study Sessions", "Total (counted)", "Standing", "Strikes (0-3)", "Strike Status", "Notes"]);
  const cached = (v: number) => ({ formula: "COUNTIFS(...)", result: v });
  mem.addRow(["Alex", "Rivera", "arivera1@student.gsu.edu", "President", null, "Active", "Y", { formula: "IF(...)", result: "Paid" }, cached(opts.meetingsCached ?? 1), cached(0), cached(0), cached(0), cached(0), cached(1), { formula: "IF(...)", result: "In Progress" }, 0, { formula: "IF(...)", result: "" }, null]);
  mem.addRow(["Blair", "Chen", "bchen2@student.gsu.edu", null, "Service", "Active", null, null, cached(1), cached(0), cached(1), cached(0), cached(0), cached(2), null, 1, null, "Email captured from 9/2 scan"]);
  mem.addRow(["Jordan", null, null, null, null, "Not Verified", null, null, cached(0), cached(0), cached(0), cached(0), cached(0), cached(0), null, 0, null, "GroupMe only - email needed"]);

  const pros = wb.addWorksheet("Prospective Members");
  pros.addRow(["First Name", "Last Name", "Email", "Events Attended", "Interest Level", "First Seen (event)", "Converted to Member? (Y/N)", "Notes"]);
  pros.addRow(["Casey", "Diaz", "cdiaz3@student.gsu.edu", { formula: "COUNTIFS()", result: 1 }, { formula: "IF()", result: "Low" }, "Meet the 100", null, null]);
  pros.addRow(["Drew", "Evans", "MANUAL-devans", { formula: "COUNTIFS()", result: 1 }, null, "Park Clean Up", null, "MANUAL - no email on file"]);

  const um = wb.addWorksheet("Unmatched Scans");
  um.addRow(["First Name", "Last Name", "Email", "Event", "Date", "Action"]);
  um.addRow(["Sam", "Smith", "(no email - manual sign-in)", "Park Clean Up", d(18), "Name on paper sign-in doesn't match any record."]);

  const how = wb.addWorksheet("How To Use");
  how.addRow(["HOW THIS WORKBOOK WORKS"]);
  how.addRow(["Graduated (not tracked)", "Former Member A, Former Member B"]);

  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}
