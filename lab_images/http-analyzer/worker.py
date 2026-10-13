import ipaddress
import json
import socket
import ssl
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener

MAX_BODY = 1024 * 1024
MAX_REDIRECTS = 5
BLOCKED_LOCAL_PORTS = {8000, 8001, 8002, 8003, 8004, 8080, 8443, 5432, 6379, 27017}
LAB_PORTS = {8081, 8082, 8083, 8084}


def is_public_host(hostname, port=None):
    host = (hostname or '').strip().lower().rstrip('.')
    if not host:
        return False, 'Пустое имя хоста.'
    if host in {'localhost', 'localhost.localdomain', 'host.docker.internal', 'gateway.docker.internal'}:
        if host == 'host.docker.internal' and port in LAB_PORTS:
            return True, ''
        return False, 'Локальные адреса запрещены.'
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as exc:
        return False, f'Не удалось разрешить имя хоста: {exc}'
    for value in addresses:
        try:
            ip = ipaddress.ip_address(value)
        except ValueError:
            return False, 'Некорректный IP-адрес.'
        if not ip.is_global:
            return False, f'Адрес {value} относится к локальной/служебной сети и заблокирован.'
    if port in BLOCKED_LOCAL_PORTS:
        return False, f'Порт {port} запрещён политикой sandbox.'
    return True, ''


def validate_url(url, allow_local_lab=False):
    parsed = urlparse(url)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise ValueError('Поддерживаются только HTTP/HTTPS URL.')
    if parsed.username or parsed.password:
        raise ValueError('URL с логином и паролем не поддерживается.')
    port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    if allow_local_lab and parsed.hostname in {'127.0.0.1', 'localhost'} and port in LAB_PORTS:
        return parsed
    ok, reason = is_public_host(parsed.hostname, port)
    if not ok:
        raise ValueError(reason)
    return parsed


class SafeRedirectHandler(HTTPRedirectHandler):
    def __init__(self, allow_local_lab=False):
        super().__init__()
        self.allow_local_lab = allow_local_lab
        self.history = []

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl, self.allow_local_lab)
        if len(self.history) >= MAX_REDIRECTS:
            raise ValueError('Превышено максимальное количество редиректов.')
        self.history.append({'status': code, 'from': req.full_url, 'to': newurl})
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def headers_to_raw(response):
    version = getattr(response, 'version', 11)
    status = f'HTTP/{version / 10:.1f} {response.status} {response.reason}'
    lines = [status]
    for key in response.headers:
        values = response.headers.get_all(key) or [response.headers.get(key, '')]
        for value in values:
            lines.append(f'{key}: {value}')
    return '\n'.join(lines)


def _ssl_context(tls12=False):
    context = ssl.create_default_context()
    if tls12:
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.maximum_version = ssl.TLSVersion.TLSv1_2
    # Do not advertise HTTP/2 to urllib's HTTP/1.1 client.
    try:
        context.set_alpn_protocols(['http/1.1'])
    except NotImplementedError:
        pass
    return context


def analyze(url, timeout):
    parsed = urlparse(url)
    allow_local_lab = parsed.hostname in {'127.0.0.1', 'localhost'} and (parsed.port or 80) in LAB_PORTS
    parsed = validate_url(url, allow_local_lab)
    request_url = url
    if allow_local_lab:
        request_url = url.replace(parsed.hostname, 'host.docker.internal', 1)
        validate_url(request_url, allow_local_lab=True)

    started = time.perf_counter()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                      '(KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 WebSecLabAnalyzer/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
        'Cache-Control': 'no-cache',
    }

    # Try normal TLS first, then strict TLS 1.2. Both keep certificate
    # verification enabled. A small compatibility retry handles servers or
    # middleboxes that terminate one TLS profile early.
    contexts = [_ssl_context(False)] if parsed.scheme == 'https' else [None]
    if parsed.scheme == 'https':
        contexts.append(_ssl_context(True))

    last_error = None
    for context in contexts:
        tracker = SafeRedirectHandler(allow_local_lab=allow_local_lab)
        handlers = [tracker]
        if context is not None:
            handlers.append(HTTPSHandler(context=context))
        opener = build_opener(*handlers)
        req = Request(request_url, headers=headers, method='GET')
        try:
            response = opener.open(req, timeout=timeout)
            body = response.read(MAX_BODY)
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            final_url = response.geturl().replace('host.docker.internal', parsed.hostname, 1) if allow_local_lab else response.geturl()
            return {
                'url': url,
                'final_url': final_url,
                'status': response.status,
                'reason': response.reason,
                'protocol': f"HTTP/{getattr(response, 'version', 11) / 10:.1f}",
                'raw': headers_to_raw(response),
                'headers': dict(response.headers.items()),
                'set_cookies': response.headers.get_all('Set-Cookie') or [],
                'content_type': response.headers.get('Content-Type', ''),
                'content_length': response.headers.get('Content-Length', ''),
                'server': response.headers.get('Server', ''),
                'elapsed_ms': elapsed_ms,
                'redirects': tracker.history,
                'body_bytes_read': len(body),
                'body_truncated': len(body) >= MAX_BODY,
            }
        except HTTPError as exc:
            body = exc.read(MAX_BODY)
            elapsed_ms = round((time.perf_counter() - started) * 1000)
            return {
                'url': url,
                'final_url': exc.geturl(),
                'status': exc.code,
                'reason': exc.reason,
                'protocol': f"HTTP/{getattr(exc, 'version', 11) / 10:.1f}",
                'raw': headers_to_raw(exc),
                'headers': dict(exc.headers.items()),
                'set_cookies': exc.headers.get_all('Set-Cookie') or [],
                'content_type': exc.headers.get('Content-Type', ''),
                'content_length': exc.headers.get('Content-Length', ''),
                'server': exc.headers.get('Server', ''),
                'elapsed_ms': elapsed_ms,
                'redirects': tracker.history,
                'body_bytes_read': len(body),
                'body_truncated': len(body) >= MAX_BODY,
            }
        except (ssl.SSLError, ConnectionResetError, BrokenPipeError, URLError, TimeoutError, OSError) as exc:
            last_error = exc
            continue

    if isinstance(last_error, ssl.SSLError):
        raise RuntimeError(
            'Удалённый сервер или сетевой посредник завершил TLS-соединение до HTTP-ответа. '
            'Analyzer не отключает проверку сертификата и не переводит HTTPS в HTTP. '
            f'Детали: {last_error}'
        )
    raise RuntimeError(f'Не удалось получить HTTP-ответ: {last_error}')


class Handler(BaseHTTPRequestHandler):
    server_version = 'WebSecLabHTTPAnalyzer/5.0'

    def _send_json(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path == '/health':
            self._send_json({'status': 'ok', 'service': 'webseclab-http-analyzer'})
        else:
            self._send_json({'error': 'Not found'}, 404)

    def do_POST(self):
        if self.path != '/analyze':
            self._send_json({'error': 'Not found'}, 404)
            return
        try:
            length = min(int(self.headers.get('Content-Length', '0')), 8192)
            payload = json.loads(self.rfile.read(length) or b'{}')
            url = str(payload.get('url', '')).strip()
            timeout = min(max(int(payload.get('timeout', 12)), 3), 15)
            if not url:
                raise ValueError('Укажите URL для анализа.')
            if not url.startswith(('http://', 'https://')):
                url = 'https://' + url
            self._send_json(analyze(url, timeout))
        except (ValueError, URLError, TimeoutError, OSError) as exc:
            self._send_json({'error': str(exc)}, 400)
        except Exception as exc:
            self._send_json({'error': f'Ошибка sandbox: {exc}'}, 500)

    def log_message(self, *_args):
        pass


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8765), Handler).serve_forever()
