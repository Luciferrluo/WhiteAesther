import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScanCandidate } from "../core/api.ts";
import { byNetwork, networkOf, summarise } from "./grouping.ts";

function candidate(peer: string, rttMs: number): ScanCandidate {
  return { peer, rttMs };
}

test("an IPv4 gateway is grouped by its /24", () => {
  assert.equal(networkOf("162.159.198.127:443"), "162.159.198.0/24");
  assert.equal(networkOf("188.114.96.3:8443"), "188.114.96.0/24");
  // The port must not leak into the network label.
  assert.ok(!networkOf("162.159.198.2:443").includes("443"));
});

test("an IPv6 gateway is grouped by its /48", () => {
  // Bracketed with a port, which is how the core reports a v6 gateway.
  assert.equal(networkOf("[2606:4700:102:abcd::1]:443"), "2606:4700:102::/48");
  assert.equal(networkOf("[2606:4700:d0:1::9]:443"), "2606:4700:d0::/48");
});

test("networks are ordered by their fastest gateway, not by size", () => {
  const groups = byNetwork([
    candidate("188.114.96.1:443", 90),
    candidate("162.159.198.2:443", 200),
    candidate("162.159.198.9:443", 205),
    candidate("162.159.198.7:443", 210),
  ]);
  assert.deepEqual(
    groups.map((group) => group.network),
    ["188.114.96.0/24", "162.159.198.0/24"],
    "a single fast gateway must outrank a slower crowd",
  );
  assert.equal(groups[0].members.length, 1);
  assert.equal(groups[1].members.length, 3);
});

test("nothing is dropped by grouping", () => {
  const candidates = [
    candidate("162.159.198.2:443", 200),
    candidate("188.114.96.1:443", 90),
    candidate("[2606:4700:102::1]:443", 150),
  ];
  const total = byNetwork(candidates).reduce((count, group) => count + group.members.length, 0);
  assert.equal(total, candidates.length);
});

test("the summary says whether there is any real choice", () => {
  // One network answering is the case worth naming: it means no alternative if
  // that range gets throttled.
  assert.match(summarise([candidate("162.159.198.2:443", 200)]), /1 gateway answered, all on one network/);
  assert.match(
    summarise([candidate("162.159.198.2:443", 200), candidate("162.159.198.9:443", 210)]),
    /2 gateways answered, all on one network/,
  );
  assert.match(
    summarise([candidate("162.159.198.2:443", 200), candidate("188.114.96.1:443", 90)]),
    /2 gateways answered across 2 networks/,
  );
});
