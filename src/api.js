const jsonHeaders = { "Content-Type": "application/json" };

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof data.error === "string" ? data.error : "请求失败";
    throw new Error(message);
  }
  return data;
}

export const api = {
  bootstrap: () => request("/api/bootstrap"),
  sync: () =>
    request("/api/sync", {
      method: "POST"
    }),
  installServer: (payload) =>
    request("/api/servers", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  deleteServer: (id) =>
    request(`/api/servers/${id}`, {
      method: "DELETE"
    }),
  updateServer: (id, payload) =>
    request(`/api/servers/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  forceClearServer: (id) =>
    request(`/api/servers/${id}?force=1`, {
      method: "DELETE"
    }),
  deleteNode: (id) =>
    request(`/api/nodes/${id}`, {
      method: "DELETE"
    }),
  updateNode: (id, payload) =>
    request(`/api/nodes/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  forceClearNode: (id) =>
    request(`/api/nodes/${id}?force=1`, {
      method: "DELETE"
    }),
  deploy: (payload) =>
    request("/api/deployments", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  refreshStatus: (payload) =>
    request("/api/hooks/status", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  service: (payload) =>
    request("/api/hooks/service", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  optimize: (payload) =>
    request("/api/hooks/optimize", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  ipQuality: (payload) =>
    request("/api/hooks/ipquality", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  blockSourceIp: (payload) =>
    request("/api/hooks/ban", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload)
    }),
  job: (id) => request(`/api/jobs/${id}`),
  clearJobs: () =>
    request("/api/jobs", {
      method: "DELETE"
    })
};

export function subscribeJob(jobId, handlers) {
  const source = new EventSource(`/api/jobs/${jobId}/events`);
  source.addEventListener("log", (event) => handlers.onLog?.(JSON.parse(event.data)));
  source.addEventListener("done", (event) => {
    handlers.onDone?.(JSON.parse(event.data));
    source.close();
  });
  source.onerror = () => {
    handlers.onError?.();
  };
  return () => source.close();
}
