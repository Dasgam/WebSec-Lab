from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse
from html import escape

import os, json, urllib.request

def proof():
    token = os.environ.get('WEBSECLAB_PROOF_TOKEN')
    if not token:
        return
    # Reliable proof channel for the isolated lab: the backend reads this marker
    # from the container's writable /tmp. This does not depend on iframe/network
    # callbacks, which can be blocked by the embedded Browser sandbox.
    try:
        with open('/tmp/.webseclab-proof', 'w', encoding='utf-8') as marker:
            marker.write(token)
    except Exception:
        pass
    callback = os.environ.get('WEBSECLAB_CALLBACK_URL')
    if not callback:
        return
    try:
        data = json.dumps({'token': token}).encode()
        req = urllib.request.Request(callback, data=data, headers={'Content-Type': 'application/json'}, method='POST')
        urllib.request.urlopen(req, timeout=2).read()
    except Exception:
        pass

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query).get('q', [''])[0]
        # Deliberately unsafe training sink: the value is inserted into HTML as-is.
        reflected = q
        if any(x in q.lower() for x in ('<script', 'onerror=', 'onload=', 'javascript:')):
            proof()
        body = f'''<!doctype html><html><head><meta charset="utf-8"><title>Reflected XSS Lab</title>
<style>body{{font-family:Arial;background:#101820;color:#dce7ee;max-width:760px;margin:50px auto}}input{{width:70%;padding:10px}}button{{padding:10px}}.box{{margin-top:25px;padding:18px;background:#172530;border-radius:8px}}.note{{color:#8fa7b3}}</style></head><body>
<h1>Search Lab</h1><p class="note">Training environment: reflected user input.</p>
<form><input name="q" value="{escape(q)}" placeholder="Учебное значение"><button>Search</button></form>
<div class="box"><strong>Server response:</strong><div>{reflected}</div></div></body></html>'''
        data=body.encode()
        self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def log_message(self,*a): pass
HTTPServer(('0.0.0.0',5000),Handler).serve_forever()
