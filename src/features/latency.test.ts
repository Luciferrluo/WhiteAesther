import assert from "node:assert/strict";
import { test } from "node:test";
import { WINDOW, append, scaleOf, summarise } from "./latency.ts";

test("the window keeps the newest samples and no more", () => {
  let history: Array<number | null> = [];
  for (let index = 0; index < WINDOW + 5; index += 1) history = append(history, index);
  assert.equal(history.length, WINDOW);
  assert.equal(history[history.length - 1], WINDOW + 4, "the newest sample must survive");
  assert.equal(history[0], 5, "the oldest must fall off the front");
});

test("a failed probe is kept as a gap, not dropped", () => {
  const history = append(append([70], null), 80);
  assert.deepEqual(history, [70, null, 80]);
  // Dropping it would report no loss on a window that lost a third of its probes.
  assert.equal(summarise(history).loss, 1 / 3);
});

test("the summary ignores gaps when averaging", () => {
  const summary = summarise([100, null, 200]);
  assert.equal(summary.min, 100);
  assert.equal(summary.max, 200);
  assert.equal(summary.avg, 150, "a gap must not be averaged in as zero");
  assert.equal(summary.last, 200);
});

test("a window that never answered reports total loss and no figures", () => {
  const summary = summarise([null, null]);
  assert.equal(summary.loss, 1);
  assert.equal(summary.avg, null);
  assert.equal(summary.last, null, "the last sample is a gap, not a stale number");
});

test("an empty window reports nothing rather than pretending", () => {
  assert.deepEqual(summarise([]), { min: null, avg: null, max: null, loss: 0, last: null });
});

test("the scale pads so a flat line does not sit on the floor", () => {
  const { lo, hi } = scaleOf([80, 80, 80]);
  assert.ok(lo < 80 && hi > 80, "a constant series still needs a range to draw in");
  assert.ok(lo >= 0, "latency cannot be negative, so neither can the axis");
});

test("the scale never goes below zero for a fast route", () => {
  assert.ok(scaleOf([2, 3]).lo >= 0);
});
