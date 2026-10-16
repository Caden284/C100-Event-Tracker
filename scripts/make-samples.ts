/** Writes samples/sample-membership-tracker.xlsx (fictional data). Usage: npm run samples */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildSampleWorkbook } from "../tests/fixtures/sample-workbook";

buildSampleWorkbook().then((buf) => {
  mkdirSync("samples", { recursive: true });
  writeFileSync("samples/sample-membership-tracker.xlsx", buf);
  console.log("Wrote samples/sample-membership-tracker.xlsx (fictional data)");
});
