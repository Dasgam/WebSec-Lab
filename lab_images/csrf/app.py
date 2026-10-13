from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs
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
state={'email':'student@example.local','changed':False}

def page(note=''):
    return f'''<!doctype html><html><head><meta charset="utf-8"><title>CSRF Lab</title><style>body{{font-family:Arial;background:#101820;color:#dce7ee;max-width:760px;margin:50px auto}}input{{padding:10px;width:70%}}button{{padding:10px}}.box{{padding:18px;background:#172530;border-radius:8px;margin-top:20px}}.note{{color:#8fa7b3}}</style></head><body><h1>Account Settings</h1><p class="note">Training environment: state-changing request.</p><div class="box"><p>Current email: <b>{escape(state['email'])}</b></p><form method="post"><input name="email" placeholder="new email"><button>Save</button></form><p>{escape(note)}</p></div><p>Security mode: token validation is intentionally absent in this training scenario.</p><p><a href="http://localhost:8083/attacker">Открыть учебную страницу-атакер</a></p></body></html>'''
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/attacker'):
            self.reply('''<!doctype html><html><body><h1>Training attacker page</h1><p>Отправляем межсайтовый POST без CSRF-токена…</p><form id="f" action="http://127.0.0.1:8083/" method="POST"><input name="email" value="csrf-attacker@example.local"></form><script>document.getElementById('f').submit()</script></body></html>''')
        else:
            self.reply(page())
    def do_POST(self):
        n=int(self.headers.get('Content-Length','0')); data=parse_qs(self.rfile.read(n).decode()); state['email']=data.get('email',[state['email']])[0]; state['changed']=True
        # The task is to demonstrate the missing CSRF protection by performing
        # a state-changing POST. The embedded Browser may omit/alter Origin or
        # Referer, so verification intentionally depends on the POST action itself.
        proof()
        self.reply(page('State changed by POST.'))
    def reply(self,b):
        d=b.encode(); self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(d))); self.end_headers(); self.wfile.write(d)
    def log_message(self,*a): pass
HTTPServer(('0.0.0.0',5000),Handler).serve_forever()
