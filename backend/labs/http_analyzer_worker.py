import ipaddress
import json
import socket
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener

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
        original_url = newurl
        parsed = urlparse(newurl)
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
        if self.allow_local_lab and parsed.hostname in {'127.0.0.1', 'localhost'} and port in LAB_PORTS:
            newurl = newurl.replace(parsed.hostname, 'host.docker.internal', 1)
        validate_url(newurl, self.allow_local_lab)
        if len(self.history) >= MAX_REDIRECTS:
            raise ValueError('Превышено максимальное количество редиректов.')
        self.history.append({'status': code, 'from': req.full_url.replace('host.docker.internal', '127.0.0.1', 1), 'to': original_url})
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


def analyze(url, timeout):
    allow_local_lab = urlparse(url).hostname in {'127.0.0.1', 'localhost'} and (urlparse(url).port or 80) in LAB_PORTS
    parsed = validate_url(url, allow_local_lab)
    request_url = url
    if allow_local_lab:
        request_url = url.replace(parsed.hostname, 'host.docker.internal', 1)
        validate_url(request_url, allow_local_lab=True)

    started = time.perf_counter()
    tracker = SafeRedirectHandler(allow_local_lab=allow_local_lab)
    opener = build_opener(tracker)
    req = Request(request_url, headers={
        'User-Agent': 'WebSec-Lab-HTTP-Analyzer/3.0 sandbox',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Connection': 'close',
    }, method='GET')
    try:
        response = opener.open(req, timeout=timeout)
        body = response.read(MAX_BODY)
    except HTTPError as exc:
        response = exc
        body = exc.read(MAX_BODY)
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


def main():
    payload = json.load(sys.stdin)
    url = str(payload.get('url', '')).strip()
    timeout = min(max(int(payload.get('timeout', 12)), 3), 15)
    if not url:
        raise ValueError('Укажите URL для анализа.')
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    result = analyze(url, timeout)
    json.dump(result, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, URLError, TimeoutError, OSError) as exc:
        print(json.dumps({'error': str(exc)}, ensure_ascii=False))
        sys.exit(2)
    except Exception as exc:
        print(json.dumps({'error': f'Ошибка sandbox: {exc}'}, ensure_ascii=False))
        sys.exit(3)
