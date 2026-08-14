import assert from "node:assert/strict";
import { test } from "node:test";
import { SECTION_LABELS, SETTINGS, searchSettings } from "./settingsIndex.ts";

test("the terms the search box suggests all find something", () => {
  // The placeholder reads "try dns, kill switch, scan". An example that returns
  // nothing is the same broken promise the search box itself used to be.
  for (const suggested of ["dns", "kill switch", "scan"]) {
    assert.ok(searchSettings(suggested).length > 0, `the box suggests "${suggested}" and finds nothing`);
  }
});

test("the words people use reach the setting they mean", () => {
  const top = (query: string) => searchSettings(query)[0]?.label;
  assert.equal(top("kill switch"), "Block traffic if the tunnel drops");
  assert.equal(top("dns"), "DNS resolvers");
  assert.equal(top("auto reconnect"), "Keep me connected");
  assert.equal(top("whole machine"), "Set the system proxy while connected");
  assert.equal(top("mbps"), "Speed test");
});

test("a label match outranks a passing mention", () => {
  // "Routing rules" mentions splitting traffic; "Search depth" is named for it.
  assert.equal(searchSettings("search depth")[0].label, "Search depth");
  assert.equal(searchSettings("endpoint scanner")[0].label, "Endpoint scanner");
});

test("nothing matches nonsense", () => {
  assert.deepEqual(searchSettings("qqzzxx"), []);
});

test("an empty query offers a starting point rather than nothing", () => {
  assert.ok(searchSettings("").length > 0);
});

test("every entry points at a section that exists", () => {
  // A result that navigates nowhere is worse than no result: the palette closes
  // and the screen does not change, which reads as the search being broken.
  for (const entry of SETTINGS) {
    assert.ok(SECTION_LABELS[entry.section], `${entry.label} points at "${entry.section}"`);
  }
});

test("no two entries share a label", () => {
  // Labels are the React keys in the result list, and duplicates would collide.
  const labels = SETTINGS.map((entry) => entry.label);
  assert.equal(new Set(labels).size, labels.length);
});
