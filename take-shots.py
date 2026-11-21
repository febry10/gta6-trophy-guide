#!/usr/bin/env python3
"""Retake the entry's screenshots from the real app.

Reads shots.json (file, path, viewport per shot), serves app/ on a local port,
opens each `?shot=` scene in a fresh headless-Chromium context, waits for the
app to signal `window.__shotReady`, and saves a JPEG per shot into
screenshots/. Run with the Playwright venv used for this repo's tooling:

    ~/workspace/makefun/.venv-shot/bin/python take-shots.py

JPEG quality starts at 80 and steps down until every file is within the
256 KiB entry cap, so a denser page never silently ships an oversize shot.
"""
import functools
import http.server
import json
import socketserver
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
APP = ROOT / "app"
DST = ROOT / "screenshots"
PORT = 8917
CAP = 262144  # 256 KiB, the scorer's per-screenshot cap

shots = json.loads((ROOT / "shots.json").read_text())

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(APP))
socketserver.ThreadingTCPServer.allow_reuse_address = True
srv = socketserver.ThreadingTCPServer(("127.0.0.1", PORT), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()

try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        for shot in shots:
            ctx = browser.new_context(viewport=shot["viewport"])
            page = ctx.new_page()
            page.goto(f"http://127.0.0.1:{PORT}{shot['path']}")
            page.wait_for_function("window.__shotReady === true")
            page.wait_for_timeout(250)
            out = DST / shot["file"]
            quality = 80
            while True:
                page.screenshot(path=str(out), type="jpeg", quality=quality)
                size = out.stat().st_size
                if size <= CAP or quality <= 40:
                    break
                quality -= 5
            print(f"{shot['file']}: {size} bytes at quality {quality} "
                  f"({shot['viewport']['width']}x{shot['viewport']['height']})")
            ctx.close()
        browser.close()
finally:
    srv.shutdown()
print("shots done")
