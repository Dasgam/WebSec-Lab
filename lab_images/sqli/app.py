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

PRODUCTS=[('1','Keyboard','50'),('2','Mouse','25'),('3','Monitor','180')]

def page(q='',rows=None,note=''):
    rows=rows or []
    table=''.join(f'<tr><td>{escape(a)}</td><td>{escape(b)}</td><td>{escape(c)}</td></tr>' for a,b,c in rows) or '<tr><td colspan="3">No results</td></tr>'
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>SQLi Lab</title><style>body{{font-family:Arial;background:#101820;color:#dce7ee;max-width:760px;margin:50px auto}}input{{padding:10px;width:70%}}button{{padding:10px}}table{{width:100%;margin-top:20px;border-collapse:collapse}}td,th{{padding:10px;border:1px solid #30424e}}.note{{color:#8fa7b3}}.box{{margin-top:20px;padding:15px;background:#172530;border-radius:8px}}</style></head><body><h1>Product Search Lab</h1><p class="note">Training environment: study how input influences a query.</p><form><input name="id" value="{escape(q)}" placeholder="Product ID"><button>Search</button></form><div class="box"><b>Query template:</b><br><code>SELECT id, name, price FROM products WHERE id = '[user input]'</code></div><p>{escape(note)}</p><table><tr><th>ID</th><th>Name</th><th>Price</th></tr>{table}</table></body></html>'''
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q=parse_qs(urlparse(self.path).query).get('id',[''])[0]
        rows=[p for p in PRODUCTS if p[0]==q]
        if any(x in q.lower() for x in ("' or", '" or', 'union', '--', '1=1', '1 = 1')):
            proof()
        note='The lab exposes the query boundary for analysis; arbitrary SQL is not executed by this simulator.'
        self.reply(page(q,rows,note))
    def reply(self,b):
        d=b.encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(d))); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(d)
    def log_message(self,*a): pass
HTTPServer(('0.0.0.0',5000),Handler).serve_forever()
