import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const port = Number.parseInt(process.env.PORT || process.argv[2] || "4173", 10);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  throw new RangeError("Lab server port must be between 1 and 65535");
}

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".hal", "text/plain; charset=utf-8"],
]);

const resolveRequest = (requestUrl) => {
  const pathname = decodeURIComponent(new URL(requestUrl, "http://127.0.0.1").pathname);
  const requested = pathname === "/" ? "/apps/lab/index.html" : pathname;
  const candidate = path.resolve(root, `.${requested}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) return null;
  try {
    const stat = fs.statSync(candidate);
    return stat.isDirectory() ? path.join(candidate, "index.html") : candidate;
  } catch {
    return null;
  }
};

const server = http.createServer((request, response) => {
  const file = resolveRequest(request.url || "/");
  if (!file) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }
  const type = types.get(path.extname(file).toLowerCase()) || "application/octet-stream";
  response.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store",
    "cross-origin-resource-policy": "cross-origin",
  });
  fs.createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Alumbra lab: http://127.0.0.1:${port}/apps/lab/`);
});
