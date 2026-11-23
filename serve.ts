// A tiny static server for game/ (Node 22, standard library only), so an entry can be played
// locally without a build step: `node serve.ts` serves game/ on http://localhost:8080.
// It sends the MIME types a browser game needs, answers HEAD as well as GET, refuses any
// path outside game/, and otherwise does nothing clever: this is a development convenience,
// not a web server for the internet.
//
//   node serve.ts                 serve game/ on 127.0.0.1:8080
//   node serve.ts --port 9000     pick another port
//   node serve.ts --host 0.0.0.0  listen on every interface (LAN play)
//   node serve.ts --quiet         log nothing but the startup line
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);

function flagValue(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

const requestedPort = Number(flagValue('--port', '8080'));
const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536 ? requestedPort : 8080;
const host = flagValue('--host', '127.0.0.1');
const quiet = args.includes('--quiet');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.txt': 'text/plain; charset=utf-8',
};

function log(method: string, pathname: string, status: number) {
  if (!quiet) console.log(`${method} ${pathname} -> ${status}`);
}

createServer((request, response) => {
  const method = request.method ?? 'GET';
  const url = new URL(request.url ?? '/', 'http://localhost');
  // A health check for scripts and for the finalist review: it answers
  // without touching the file tree, so a monitor never has to fetch a page.
  if (url.pathname === '/healthz') {
    const body = JSON.stringify({ ok: true, game: 'solmar-bay' });
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    log(method, url.pathname, 200);
    response.end(body);
    return;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end('bad request');
    log(method, url.pathname, 400);
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end('forbidden');
    log(method, pathname, 403);
    return;
  }
  let size: number;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    log(method, pathname, 404);
    return;
  }
  response.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  log(method, pathname, 200);
  // HEAD asks only whether the file is there; GET streams it.
  if (method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}).listen(port, host, () => {
  console.log(`Solmar Bay: game/ is on http://${host}:${port} — open it in a desktop browser to play.`);
});
