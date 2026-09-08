import test from "node:test";
import assert from "node:assert/strict";
import { nodeSchema, applySharedCertificatePolicy } from "./deployment.js";

const node = { protocol: "trojan", name: "test", domain: "node.example.com", tlsMode: "acme-http" };

test("Trojan rejects unsupported TLS modes and incomplete manual certificates", () => {
  for (const tlsMode of ["self-signed", "acme-dns", "manual-cert"]) {
    assert.equal(nodeSchema.safeParse({ ...node, tlsMode }).success, false);
  }
  assert.equal(nodeSchema.safeParse({ ...node, tlsMode: "manual-cert", certPath: "/cert.pem", keyPath: "/key.pem" }).success, true);
  assert.equal(nodeSchema.safeParse({ ...node, tlsMode: "shared-cert" }).success, true);
  assert.equal(nodeSchema.safeParse({ ...node, domain: "a.example.com; return 200" }).success, false);
});

test("both co-deployment orders share the certificate while preserving connection addresses", () => {
  for (const [protocol, peer] of [["hysteria2", "trojan"], ["trojan", "hysteria2"]]) {
    const nodes = [{ serverId: "one", protocol: peer, managedBy: "simpleui", domain: "node.example.com" }];
    assert.equal(applySharedCertificatePolicy(nodes, "one", { ...node, protocol, domain: "Node.Example.Com." }).tlsMode, "shared-cert");
    const differentAddress = applySharedCertificatePolicy(nodes, "one", { ...node, protocol, domain: "other.example.com" });
    assert.equal(differentAddress.tlsMode, "shared-cert");
    assert.equal(differentAddress.domain, "other.example.com");
    assert.equal(applySharedCertificatePolicy(nodes, "another", { ...node, protocol }).tlsMode, "acme-http");
    assert.equal(applySharedCertificatePolicy([{ ...nodes[0], monitorOnly: true }], "one", { ...node, protocol }).tlsMode, "acme-http");
  }
});
