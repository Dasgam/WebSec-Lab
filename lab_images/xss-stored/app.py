from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs
from html import escape
import sqlite3

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

DB='/tmp/comments.db'
conn=sqlite3.connect(DB); conn.execute('create table if not exists comments (id integer primary key, name text, body text)'); conn.commit()

def page(msg=''):
    rows=conn.execute('select name,body from comments order by id desc').fetchall()
    comments=''.join(f'<article><b>{escape(n)}</b><div>{b}</div></article>' for n,b in rows)
    if any(any(x in (b or '').lower() for x in ('<script', 'onerror=', 'onload=', 'javascript:')) for _, b in rows):
        proof()
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>Stored XSS Lab</title><style>body{{font-family:Arial;background:#101820;color:#dce7ee;max-width:760px;margin:50px auto}}input,textarea{{width:100%;box-sizing:border-box;padding:10px;margin:6px 0}}button{{padding:10px}}article{{margin-top:12px;padding:14px;background:#172530;border-radius:8px}}.note{{color:#8fa7b3}}</style></head><body><h1>Comments Lab</h1><p class="note">Training environment: comments are stored and later rendered.</p><form method="post"><input name="name" placeholder="Name"><textarea name="body" placeholder="Comment"></textarea><button>Add comment</button></form><p>{escape(msg)}</p><hr>{comments}</body></html>'''
class Handler(BaseHTTPRequestHandler):
    def do_GET(self): self.reply(page())
    def do_POST(self):
        n=int(self.headers.get('Content-Length','0')); data=parse_qs(self.rfile.read(n).decode()); name=data.get('name',['student'])[0]; body=data.get('body',[''])[0]
        conn.execute('insert into comments(name,body) values(?,?)',(name,body)); conn.commit(); self.reply(page('Comment stored.'))
    def reply(self,body):
        d=body.encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(d))); self.end_headers(); self.wfile.write(d)
    def log_message(self,*a): pass
HTTPServer(('0.0.0.0',5000),Handler).serve_forever()
