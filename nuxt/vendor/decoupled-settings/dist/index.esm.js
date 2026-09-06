import http from 'http';
import https from 'https';

const request = (url, { method = "GET", headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const lib = url.startsWith("https:") ? https : http;
  const req = lib.request(url, { method, headers }, (res) => {
    let data = "";
    res.on("data", (chunk) => {
      data += chunk;
    });
    res.on("end", () => resolve({ status: res.statusCode, body: data }));
  });
  req.on("error", reject);
  if (body) req.write(body);
  req.end();
});
const getToken = async (options, doRequest = request) => {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    // Simple OAuth 6 resolves no default scope for client_credentials, so
    // the scope must be named.
    scope: options.scope || "frontend_app"
  });
  const response = await doRequest(`${options.baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (response.status !== 200) {
    throw new Error(`[decoupled-settings] OAuth token request failed: HTTP ${response.status}`);
  }
  return JSON.parse(response.body).access_token;
};
const fetchSettings = async (options, doRequest = request) => {
  const headers = { Accept: "application/vnd.api+json" };
  if (options.consumerId) {
    headers["X-Consumer-ID"] = options.consumerId;
  }
  if (options.clientId && options.clientSecret) {
    headers.Authorization = `Bearer ${await getToken(options, doRequest)}`;
  }
  const response = await doRequest(`${options.baseUrl}/jsonapi/decoupled/settings`, { headers });
  if (response.status !== 200) {
    throw new Error(
      `[decoupled-settings] settings fetch failed: HTTP ${response.status}. Check the "read decoupled settings" permission and the consumer credentials.`
    );
  }
  return JSON.parse(response.body).data.attributes;
};
const assetProxy = (assets, { timeout = 1e4 } = {}) => (req, res) => {
  const key = (req.url || "").replace(/^\/+/, "").replace(/[?#].*$/, "");
  const target = assets[key];
  if (!target) {
    res.statusCode = 404;
    res.end("Not found");
    return;
  }
  const lib = target.startsWith("https:") ? https : http;
  const upstreamRequest = lib.get(target, { agent: false, timeout }, (upstream) => {
    res.statusCode = upstream.statusCode;
    if (upstream.headers["content-type"]) {
      res.setHeader("Content-Type", upstream.headers["content-type"]);
    }
    res.setHeader("Cache-Control", "public, max-age=3600");
    upstream.on("error", () => res.destroy());
    upstream.on("aborted", () => res.destroy());
    upstream.pipe(res);
  }).on("error", () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    res.statusCode = 502;
    res.end("Bad gateway");
  });
  upstreamRequest.on("timeout", () => upstreamRequest.destroy(new Error("upstream timeout")));
};
const collectAssets = (settings, baseUrl) => {
  const assets = {};
  for (const [group, values] of Object.entries(settings)) {
    if (group === "system.site" || !group.endsWith(".settings")) continue;
    for (const name of ["logo", "favicon"]) {
      const item = values[name];
      if (!item || !item.url) continue;
      if (assets[name]) {
        item.url = item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`;
        continue;
      }
      assets[name] = item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`;
      item.url = `/_decoupled/${name}`;
    }
  }
  return assets;
};
const applyToHead = (head = {}, attributes, baseUrl = "") => {
  const site = attributes.settings["system.site"] || {};
  const theme = Object.entries(attributes.settings).find(([group]) => group !== "system.site" && group.endsWith(".settings"));
  const themeSettings = theme ? theme[1] : {};
  if (site.name) {
    if (site.slogan) {
      head.title = site.slogan;
      head.titleTemplate = `%s | ${site.name}`;
    } else {
      head.title = site.name;
      delete head.titleTemplate;
    }
  }
  if (themeSettings.favicon && themeSettings.favicon.url) {
    const { url } = themeSettings.favicon;
    const href = url.startsWith("/") || url.startsWith("http") ? url : `${baseUrl}${url}`;
    head.link = (head.link || []).filter((link) => link.rel !== "icon").concat([{ rel: "icon", type: themeSettings.favicon.mimetype || "image/x-icon", href }]);
  }
  return head;
};
const DruxtDecoupledSettingsModule = async function(moduleOptions = {}) {
  const options = {
    baseUrl: (this.options.druxt || {}).baseUrl || process.env.BASE_URL,
    consumerId: process.env.DRUXT_CONSUMER_ID,
    clientId: process.env.OAUTH_CLIENT_ID,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
    scope: process.env.OAUTH_SCOPE,
    applyHead: true,
    ...this.options.decoupledSettings || {},
    ...moduleOptions
  };
  const attributes = await fetchSettings(options);
  const assets = collectAssets(attributes.settings, options.baseUrl);
  if (Object.keys(assets).length) {
    this.addServerMiddleware({ path: "/_decoupled", handler: assetProxy(assets) });
  }
  this.options.publicRuntimeConfig = this.options.publicRuntimeConfig || {};
  this.options.publicRuntimeConfig.decoupledSettings = attributes.settings;
  this.options.publicRuntimeConfig.decoupledConsumer = attributes.consumer;
  this.options.publicRuntimeConfig.decoupledBaseUrl = options.baseUrl;
  if (options.applyHead) {
    this.options.head = applyToHead(this.options.head, attributes, options.baseUrl);
  }
  console.info(
    `[decoupled-settings] loaded for consumer=${attributes.consumer || "(none)"}:`,
    Object.keys(attributes.settings).join(", ")
  );
};

export { applyToHead, assetProxy, collectAssets, DruxtDecoupledSettingsModule as default, fetchSettings, getToken, request };
