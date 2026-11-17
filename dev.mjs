// Local zero-dependency development server. Live data requires .env pointing to Supabase.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
function option(name) {
  const i = process.argv.indexOf("--" + name);
  return i < 0 ? undefined : process.argv[i + 1];
}
const previewHost = option("host") || process.env.HOST || "127.0.0.1";
const previewPort = Number(option("port") || process.env.PORT || 3000);
const envPath = path.resolve(".env");
if (fs.existsSync(envPath))
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
  }
process.env.NODE_ENV = "development";
const [{ default: api }, { default: webhook }, { default: cron }] =
  await Promise.all([
    import("./api/index.mjs"),
    import("./api/webhook.mjs"),
    import("./api/cron.mjs"),
  ]);
const publicDir = path.resolve("public");
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
const aliases = new Set([
  "/",
  "/booking",
  "/shop",
  "/staff",
  "/admin",
  "/manager",
  "/appointments",
  "/orders",
  "/account",
  "/medications",
]);
http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/"))
      return url.pathname === "/api/line/webhook"
        ? webhook(req, res)
        : url.pathname === "/api/cron/notifications"
          ? cron(req, res)
          : api(req, res);
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    const loc = aliases.has(url.pathname) ? "/index.html" : url.pathname;
    let requested;
    try {
      requested = decodeURIComponent(loc);
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    const file = path.resolve(publicDir, "." + requested);
    if (
      !(file === publicDir || file.startsWith(publicDir + path.sep)) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile()
    ) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type":
        contentTypes[path.extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    });
    if (req.method === "HEAD") res.end();
    else fs.createReadStream(file).pipe(res);
  })
  .listen(previewPort, previewHost, () =>
    console.log(`Suwat Clinic → http://${previewHost}:${previewPort}`),
  );
