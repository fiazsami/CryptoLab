import fs from "node:fs";
import path from "node:path";
import type http from "node:http";

/**
 * Serves the built client in production. Anything that is not a file falls back
 * to index.html so that client-side routes such as /pair/ETHUSDT survive a reload.
 */

const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".json": "application/json; charset=utf-8",
    ".woff2": "font/woff2",
    ".map": "application/json; charset=utf-8",
};

/**
 * Maps a request path to a file inside `root`, or null when the path would
 * escape it. `path.resolve` collapses `..` segments, so the containment check
 * runs on the final location rather than on the raw string.
 */
export function resolveStatic(root: string, pathname: string): string | null {
    let decoded: string;
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    if (decoded.includes("\0")) return null;
    const absoluteRoot = path.resolve(root);
    const file = path.resolve(absoluteRoot, "." + path.posix.normalize("/" + decoded));
    return file === absoluteRoot || file.startsWith(absoluteRoot + path.sep) ? file : null;
}

export function createStatic(root: string) {
    const index = path.join(root, "index.html");
    if (!fs.existsSync(index)) {
        throw new Error(`no built client at ${root}; run \`npm run build\` first`);
    }

    return function serve(req: http.IncomingMessage, res: http.ServerResponse): void {
        const { pathname } = new URL(req.url ?? "/", "http://localhost");
        const file = resolveStatic(root, pathname);
        if (file === null) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("bad path");
            return;
        }

        const isFile = fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
        // A missing path with an extension is a missing asset, not a client route.
        if (!isFile && path.extname(pathname) !== "") {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("not found");
            return;
        }

        const target = isFile ? file : index;
        const hashed = target.includes(`${path.sep}assets${path.sep}`);
        res.writeHead(200, {
            "content-type": TYPES[path.extname(target)] ?? "application/octet-stream",
            "cache-control": hashed ? "public, max-age=31536000, immutable" : "no-cache",
        });
        fs.createReadStream(target).pipe(res);
    };
}
