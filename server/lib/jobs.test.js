import test from "node:test";
import assert from "node:assert/strict";
import { mergeDiscoveredNodes, syncBlacklistRecords } from "./jobs.js";

test("mergeDiscoveredNodes imports remote managed node and usernames without secrets", () => {
  const state = { nodes: [], users: [], audit: [] };
  const server = { id: "srv-1", name: "Tokyo", host: "203.0.113.10" };

  const summary = mergeDiscoveredNodes(state, server, [{
    protocol: "hysteria2",
    remoteKey: "hysteria2:/etc/hysteria/config.yaml:8443",
    domain: "node.example.com",
    connectHost: "node.example.com",
    listenPort: 8443,
    tlsMode: "acme-http",
    active: "active",
    users: [{ username: "alice", password: "should-not-persist" }]
  }], { timestamp: "2026-05-09T00:00:00.000Z" });

  assert.equal(summary.imported, 1);
  assert.equal(state.nodes.length, 1);
  assert.equal(state.nodes[0].serverId, "srv-1");
  assert.equal(state.nodes[0].endpoint, "node.example.com:8443");
  assert.equal(state.nodes[0].status, "online");
  assert.equal(state.users.length, 1);
  assert.deepEqual(state.users[0].nodeIds, [state.nodes[0].id]);
  assert.equal(JSON.stringify(state).includes("should-not-persist"), false);
});

test("mergeDiscoveredNodes refreshes an existing remote node instead of duplicating it", () => {
  const state = { nodes: [], users: [], audit: [] };
  const server = { id: "srv-1", name: "HK", host: "2001:db8::10" };
  const discovered = {
    protocol: "trojan",
    remoteKey: "trojan:/usr/src/trojan/server.conf:443",
    domain: "trojan.example.com",
    listenPort: 443,
    active: "active",
    users: ["bob"]
  };

  mergeDiscoveredNodes(state, server, [discovered], { timestamp: "2026-05-09T00:00:00.000Z" });
  const firstNodeId = state.nodes[0].id;
  const summary = mergeDiscoveredNodes(state, server, [{ ...discovered, active: "inactive" }], {
    timestamp: "2026-05-09T00:01:00.000Z"
  });

  assert.equal(summary.imported, 0);
  assert.equal(summary.updated, 1);
  assert.equal(state.nodes.length, 1);
  assert.equal(state.nodes[0].id, firstNodeId);
  assert.equal(state.nodes[0].status, "warning");
  assert.deepEqual(state.users[0].nodeIds, [firstNodeId]);
});

test("mergeDiscoveredNodes imports sing-box monitor-only protocols", () => {
  const state = { nodes: [], users: [], audit: [] };
  const server = { id: "srv-1", name: "Osaka", host: "198.51.100.8" };

  const summary = mergeDiscoveredNodes(state, server, [{
    protocol: "vless",
    name: "VLESS vless-in",
    remoteKey: "sing-box:/etc/sing-box/config.json:inbound:vless-in:443",
    listenPort: 443,
    service: "sing-box.service",
    serviceProtocol: "tcp",
    configPath: "/etc/sing-box/config.json",
    active: "active",
    users: ["alice"],
    managedBy: "sing-box",
    importSource: "sing-box-discovery",
    monitorOnly: true
  }], { timestamp: "2026-05-09T00:02:00.000Z" });

  assert.equal(summary.imported, 1);
  assert.equal(state.nodes[0].protocol, "vless");
  assert.equal(state.nodes[0].monitorOnly, true);
  assert.equal(state.nodes[0].managedBy, "sing-box");
  assert.equal(state.nodes[0].serviceProtocol, "tcp");
  assert.equal(state.nodes[0].endpoint, "198.51.100.8:443");
  assert.deepEqual(state.users[0].nodeIds, [state.nodes[0].id]);
});

test("syncBlacklistRecords maps remote blacklist records onto rediscovered nodes", () => {
  const state = {
    nodes: [{
      id: "node-1",
      serverId: "srv-1",
      protocol: "hysteria2",
      remoteKey: "hysteria2:/etc/hysteria/config.yaml:8443",
      listenPort: 8443
    }],
    bans: [],
    audit: []
  };
  const server = { id: "srv-1", name: "Tokyo" };

  const summary = syncBlacklistRecords(state, server, [{
    remoteKey: "hysteria2:/etc/hysteria/config.yaml:8443",
    target: "203.0.113.44",
    ipFamily: 4,
    source: "simpleui",
    createdAt: "2026-05-09T00:03:00.000Z"
  }], { timestamp: "2026-05-09T00:04:00.000Z" });

  assert.equal(summary.active, 1);
  assert.equal(state.bans.length, 1);
  assert.equal(state.bans[0].serverId, "srv-1");
  assert.equal(state.bans[0].nodeId, "node-1");
  assert.equal(state.bans[0].target, "203.0.113.44");
  assert.equal(state.bans[0].status, "active");
  assert.equal(state.bans[0].lastSeenAt, "2026-05-09T00:04:00.000Z");
});

test("syncBlacklistRecords marks missing remote blacklist entries as removed", () => {
  const state = {
    nodes: [{
      id: "node-1",
      serverId: "srv-1",
      protocol: "trojan",
      remoteKey: "trojan:/usr/src/trojan/server.conf:443",
      listenPort: 443
    }],
    bans: [{
      id: "ban-1",
      serverId: "srv-1",
      nodeId: "node-1",
      remoteKey: "trojan:/usr/src/trojan/server.conf:443",
      targetKind: "source-ip",
      target: "198.51.100.8",
      ipFamily: 4,
      status: "active"
    }],
    audit: []
  };
  const server = { id: "srv-1", name: "HK" };

  const summary = syncBlacklistRecords(state, server, [], { timestamp: "2026-05-09T00:05:00.000Z" });

  assert.equal(summary.removed, 1);
  assert.equal(state.bans[0].status, "removed");
  assert.equal(state.bans[0].removedAt, "2026-05-09T00:05:00.000Z");
});
