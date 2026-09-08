import { z } from "zod";
import { hasNoControlChars, isValidServerHost } from "./security.js";

export const nodeSchema = z.object({
  id: z.string().optional(),
  protocol: z.enum(["hysteria2", "trojan"]),
  name: z.string().min(1).max(80),
  group: z.string().max(80).optional(),
  domain: z.string().max(253).refine(hasNoControlChars, "Domain cannot contain control characters").optional().default(""),
  listenPort: z.coerce.number().int().min(1).max(65535).default(443),
  masqueradeUrl: z.string().max(512).refine(hasNoControlChars, "Masquerade URL cannot contain control characters").optional(),
  tlsMode: z.enum(["self-signed", "acme-http", "acme-dns", "acme-dns-cloudflare", "manual-cert", "shared-cert"]).default("acme-http"),
  acmeEmail: z.string().max(254).refine(hasNoControlChars, "Email cannot contain control characters").optional(),
  dnsProvider: z.string().max(80).optional(),
  dnsToken: z.string().max(4096).refine(hasNoControlChars, "DNS token cannot contain control characters").optional(),
  dnsOverrideDomain: z.string().max(253).refine(hasNoControlChars, "DNS override cannot contain control characters").optional(),
  dnsUser: z.string().max(128).refine(hasNoControlChars, "DNS user cannot contain control characters").optional(),
  dnsServer: z.string().max(253).refine(hasNoControlChars, "DNS server cannot contain control characters").optional(),
  selfSignedDomain: z.string().max(253).refine(hasNoControlChars, "Self-signed domain cannot contain control characters").optional(),
  selfSignedIpMode: z.enum(["ipv4", "ipv6"]).optional(),
  selfSignedHost: z.string().max(253).refine(hasNoControlChars, "Self-signed host cannot contain control characters").optional(),
  certPath: z.string().max(512).refine(hasNoControlChars, "Certificate path cannot contain control characters").optional(),
  keyPath: z.string().max(512).refine(hasNoControlChars, "Key path cannot contain control characters").optional(),
  ignoreClientBandwidth: z.coerce.boolean().optional(),
  obfsEnabled: z.coerce.boolean().optional(),
  obfsPassword: z.string().max(256).refine(hasNoControlChars, "Obfs password cannot contain control characters").optional(),
  sniffEnabled: z.coerce.boolean().optional(),
  portHoppingEnabled: z.coerce.boolean().optional(),
  jumpPortStart: z.coerce.number().int().min(1).max(65535).optional(),
  jumpPortEnd: z.coerce.number().int().min(1).max(65535).optional(),
  jumpPortInterface: z.string().max(80).refine(hasNoControlChars, "Network interface cannot contain control characters").optional(),
  jumpPortIpv6Enabled: z.coerce.boolean().optional(),
  jumpPortIpv6Interface: z.string().max(80).refine(hasNoControlChars, "IPv6 network interface cannot contain control characters").optional()
}).superRefine((node, ctx) => {
  if (!(node.protocol === "hysteria2" && node.tlsMode === "self-signed") && !node.domain?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["domain"], message: "Domain or endpoint is required" });
  }
  if (node.domain && !isValidServerHost(node.domain.trim().replace(/\.$/, ""))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["domain"], message: "Domain must be a hostname or IP address" });
  }
  if (node.protocol === "trojan" && !["acme-http", "shared-cert", "manual-cert"].includes(node.tlsMode)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["tlsMode"], message: "Trojan requires HTTP, shared or manual certificate mode" });
  }
  if ((node.tlsMode === "acme-dns" || node.tlsMode === "acme-dns-cloudflare") && !node.dnsToken?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["dnsToken"], message: "ACME DNS requires provider token" });
  }
  if (node.tlsMode === "manual-cert") {
    if (!node.certPath?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["certPath"], message: "Certificate path is required" });
    if (!node.keyPath?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["keyPath"], message: "Private key path is required" });
  }
  if (node.protocol !== "hysteria2") return;
  if (node.obfsEnabled && !node.obfsPassword?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["obfsPassword"], message: "Obfs password is required" });
  }
  if (node.portHoppingEnabled) {
    if (!node.jumpPortInterface?.trim()) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortInterface"], message: "Network interface is required" });
    if (!node.jumpPortStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortStart"], message: "Start port is required" });
    if (!node.jumpPortEnd) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortEnd"], message: "End port is required" });
    if (node.jumpPortStart && node.jumpPortEnd && node.jumpPortStart > node.jumpPortEnd) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortStart"], message: "Start port must be less than or equal to end port" });
    }
    if (node.jumpPortIpv6Enabled && !node.jumpPortIpv6Interface?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["jumpPortIpv6Interface"], message: "IPv6 network interface is required" });
    }
  }
});


export function applySharedCertificatePolicy(nodes, serverId, node) {
  const peer = nodes.find((item) => item.serverId === serverId && item.protocol !== node.protocol
    && ["hysteria2", "trojan"].includes(item.protocol) && !item.monitorOnly && item.managedBy !== "sing-box");
  if (!peer) return node;
  const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\.$/, "");
  // The connection address may differ; generated links carry the shared certificate's SNI.
  return { ...node, domain: normalize(node.domain), tlsMode: "shared-cert" };
}
