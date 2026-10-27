import assert from "node:assert/strict";
import test from "node:test";
import { memberAge } from "../src/shared/memberAge";

test("age uses completed years and responds correctly around birthdays", () => {
  assert.equal(memberAge("2000-10-28", "2026-10-27"), 25);
  assert.equal(memberAge("2000-10-27", "2026-10-27"), 26);
  assert.equal(memberAge("2000-10-26", "2026-10-27"), 26);
  assert.equal(memberAge("2026-10-27", "2026-10-27"), 0);
  assert.equal(memberAge("2000-02-29", "2025-02-28"), 24);
  assert.equal(memberAge("2000-02-29", "2025-03-01"), 25);
});
test("age is hidden for empty, invalid and future birth dates", () => {
  for (const value of ["", "invalid", "2025-02-30", "2026-10-28"])
    assert.equal(memberAge(value, "2026-10-27"), null);
});
