import { join } from 'path';
import http from 'http';
import https from 'https';
import { URL } from 'url';

const ADMIN_PATHS = [
  "/admin",
  "/node/add",
  "/media/add",
  "/user/login",
  "/user/logout",
  "/user/password",
  "/user/register"
];
function normalise(path) {
  const trimmed = String(path || "").split("?")[0].split("#")[0];
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}
function isAdminPath(path, paths = ADMIN_PATHS) {
  const subject = normalise(path);
  if (!subject) return false;
  return paths.some((prefix) => {
    const p = normalise(prefix);
    return subject === p || subject.startsWith(`${p}/`);
  });
}
function backendPath(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  if (!base) return "";
  const subject = String(path || "/");
  return `${base}${subject.startsWith("/") ? subject : `/${subject}`}`;
}
const MODES = ["link", "proxy"];
function resolveMode(mode) {
  return MODES.includes(mode) ? mode : "link";
}

const BACKEND_PATHS = [
  // Assets: core's own, contributed, themes, and the public files directory.
  "/core",
  "/libraries",
  "/modules",
  "/profiles",
  "/themes",
  // The endpoints an administration screen talks to while it is open.
  "/batch",
  "/system",
  "/session",
  "/file",
  "/views/ajax",
  "/contextual",
  "/editor",
  "/toolbar",
  "/entity_reference_autocomplete",
  "/update.php",
  // The whole of /user, because a login form that posts to the backend on
  // another origin sets its cookie there, which is the problem the proxy
  // exists to solve.
  "/user"
];
const FILES_PATH = /^\/sites\/[^/]+\/files(\/|$)/;
const EDIT_PATH = /^\/(node|media|taxonomy\/term|comment|user)\/[^/]+\/(edit|delete|revisions|translations|devel|layout)(\/|$)/;
const HOP_BY_HOP = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade"
];
function shouldProxy(path, options = {}) {
  const subject = String(path || "").split("?")[0];
  if (!subject) return false;
  if (isAdminPath(subject, options.paths || ADMIN_PATHS)) return true;
  if (EDIT_PATH.test(subject)) return true;
  if (FILES_PATH.test(subject)) return true;
  const prefixes = options.backendPaths || BACKEND_PATHS;
  return prefixes.some(
    (prefix) => subject === prefix || subject.startsWith(`${prefix}/`)
  );
}
function upstreamHeaders(headers = {}, { protocol = "http", remoteAddress = "" } = {}) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    if (HOP_BY_HOP.includes(name.toLowerCase())) continue;
    out[name] = value;
  }
  out["x-forwarded-host"] = headers["x-forwarded-host"] || headers.host || "";
  out["x-forwarded-proto"] = protocol;
  const chain = [headers["x-forwarded-for"], remoteAddress].filter(Boolean);
  if (chain.length) out["x-forwarded-for"] = chain.join(", ");
  return out;
}
function readerProtocol(req = {}) {
  const forwarded = String((req.headers || {})["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (forwarded === "https" || forwarded === "http") return forwarded;
  return (req.socket || {}).encrypted ? "https" : "http";
}
function rewriteCookie(value, { secure = false } = {}) {
  return String(value).split(";").map((part) => part.trim()).filter((part) => {
    const name = part.split("=")[0].toLowerCase();
    if (name === "domain") return false;
    if (name === "secure" && !secure) return false;
    return true;
  }).join("; ");
}
function rewriteLocation(value, baseUrl, host) {
  const location = String(value || "");
  const bases = [String(baseUrl || "").replace(/\/+$/, "")];
  if (host) bases.push(`http://${host}`, `https://${host}`);
  for (const base of bases) {
    if (!base) continue;
    if (location === base) return "/";
    if (location.startsWith(`${base}/`) || location.startsWith(`${base}?`)) {
      return location.slice(base.length);
    }
  }
  return location;
}
function downstreamHeaders(headers = {}, { baseUrl, secure, host } = {}) {
  const out = {};
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase();
    if (HOP_BY_HOP.includes(key)) continue;
    if (key === "set-cookie") {
      const cookies = Array.isArray(value) ? value : [value];
      out[name] = cookies.map((cookie) => rewriteCookie(cookie, { secure }));
      continue;
    }
    if (key === "location") {
      out[name] = rewriteLocation(value, baseUrl, host);
      continue;
    }
    out[name] = value;
  }
  return out;
}
function createProxy(options = {}) {
  const baseUrl = String(options.baseUrl || "").replace(/\/+$/, "");
  const target = baseUrl ? new URL(baseUrl) : null;
  const transport = target && target.protocol === "https:" ? https : http;
  const onError = options.onError || ((error, req, res) => {
    res.statusCode = 502;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    res.end(`The backend could not be reached: ${error.message}
`);
  });
  return function druxtAdminProxy(req, res, next) {
    if (!target || !shouldProxy(req.url, options)) return next();
    const protocol = readerProtocol(req);
    const secure = typeof options.secure === "boolean" ? options.secure : protocol === "https";
    const upstream = transport.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        method: req.method,
        path: `${target.pathname.replace(/\/$/, "")}${req.url}`,
        headers: upstreamHeaders(req.headers, {
          protocol,
          remoteAddress: req.socket.remoteAddress
        })
      },
      (response) => {
        res.writeHead(
          response.statusCode,
          downstreamHeaders(response.headers, {
            baseUrl,
            secure,
            host: req.headers.host
          })
        );
        response.pipe(res);
      }
    );
    upstream.on("error", (error) => onError(error, req, res));
    req.pipe(upstream);
  };
}

const DEFAULTS = {
  /**
   * `link`, or `proxy` where the deployment has been set up for it.
   *
   * `link` by default because it works on every deployment with no
   * configuration. A proxy means serving Drupal's admin from this site's
   * origin, which erases the cross-origin problems an iframe cannot and costs
   * a running server in exchange.
   */
  mode: "link",
  /** Prefixes that count as admin, if the site has moved Drupal's. */
  paths: null,
  /** The backend, if not the one `druxt.baseUrl` names. */
  baseUrl: null,
  /**
   * Whether a `Secure` flag survives on a proxied session cookie.
   *
   * Left null, it is decided per request from the scheme the reader used:
   * kept over HTTPS, dropped over plain HTTP, where the browser would discard
   * the cookie and the login form would loop back to itself.
   */
  secure: null
};
function resolveOptions(moduleOptions = {}, nuxtOptions = {}) {
  const druxt = nuxtOptions.druxt || {};
  const options = {
    ...DEFAULTS,
    ...druxt.admin || {},
    ...moduleOptions
  };
  if (!options.baseUrl) options.baseUrl = druxt.baseUrl || null;
  return options;
}
const NuxtModule = function(moduleOptions = {}) {
  const options = resolveOptions(moduleOptions, this.options);
  this.options.publicRuntimeConfig = this.options.publicRuntimeConfig || {};
  this.options.publicRuntimeConfig.druxtAdmin = options;
  this.nuxt.hook("components:dirs", (dirs) => {
    dirs.push({ path: join(__dirname, "components") });
  });
  if (resolveMode(options.mode) !== "proxy") return;
  this.nuxt.hook("generate:before", () => {
    const warn = (this.nuxt.options.consola || console).warn;
    warn(
      "druxt-admin: proxy mode is server middleware, and neither the generated files nor `nuxt start` on them run it. Build with `target: 'server'` to run it, or proxy the admin paths in the deployment."
    );
  });
  this.addServerMiddleware(createProxy(options));
};

export { ADMIN_PATHS, BACKEND_PATHS, DEFAULTS, EDIT_PATH, FILES_PATH, MODES, backendPath, createProxy, NuxtModule as default, downstreamHeaders, isAdminPath, readerProtocol, resolveMode, resolveOptions, rewriteCookie, rewriteLocation, shouldProxy, upstreamHeaders };
