"""Static dev server for the town, plus a tiny viewport log endpoint.

- Disables browser caching (phones otherwise mix stale and new modules).
- POST /api/state  {state}            -> logs/latest.json + logs/viewport.jsonl
- POST /api/flag   {state, note, image} -> logs/flags/<stamp>.json (+ .png)

Usage: python3 scripts/serve.py [port] [bind]
"""
import base64
import datetime
import functools
import http.server
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGS = os.path.join(ROOT, "logs")
MAX_BODY = 6 * 1024 * 1024
MAX_JSONL = 5 * 1024 * 1024


def stamp():
    return datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]


class TownHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, fmt, *args):
        # keep the log quiet except for the API
        if "/api/" in (self.path or ""):
            super().log_message(fmt, *args)

    def reply(self, code, payload):
        body = json.dumps(payload).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return self.reply(413, {"ok": False})
        try:
            data = json.loads(self.rfile.read(length))
        except ValueError:
            return self.reply(400, {"ok": False})
        os.makedirs(LOGS, exist_ok=True)
        now = datetime.datetime.now().isoformat(timespec="seconds")

        if self.path == "/api/state":
            entry = {"received": now, **data}
            with open(os.path.join(LOGS, "latest.json"), "w") as f:
                json.dump(entry, f, indent=2, ensure_ascii=False)
            jsonl = os.path.join(LOGS, "viewport.jsonl")
            if os.path.exists(jsonl) and os.path.getsize(jsonl) > MAX_JSONL:
                os.replace(jsonl, jsonl + ".1")
            with open(jsonl, "a") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
            return self.reply(200, {"ok": True})

        if self.path == "/api/flag":
            flags = os.path.join(LOGS, "flags")
            os.makedirs(flags, exist_ok=True)
            name = stamp()
            image = data.pop("image", None)
            if isinstance(image, str) and image.startswith("data:image/png;base64,"):
                with open(os.path.join(flags, name + ".png"), "wb") as f:
                    f.write(base64.b64decode(image.split(",", 1)[1]))
                data["image"] = name + ".png"
            with open(os.path.join(flags, name + ".json"), "w") as f:
                json.dump({"received": now, **data}, f, indent=2, ensure_ascii=False)
            print(f"[flag] {name}: {data.get('note', '')!r}", flush=True)
            return self.reply(200, {"ok": True, "id": name})

        return self.reply(404, {"ok": False})


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8010
    bind = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    handler = functools.partial(TownHandler, directory=ROOT)
    http.server.ThreadingHTTPServer((bind, port), handler).serve_forever()


if __name__ == "__main__":
    main()
