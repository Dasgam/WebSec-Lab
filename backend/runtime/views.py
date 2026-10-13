from django.utils import timezone
from django.http import HttpResponse
from rest_framework.authtoken.models import Token
import html
import json
import re
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode, urljoin
import urllib.error
import urllib.request
from rest_framework.decorators import api_view
from rest_framework.response import Response

from labs.models import Lab
from .docker_manager import DockerError, IMAGE_BY_LAB, container_has_proof, container_status, start_lab, stop_lab
from .models import LabSession


@api_view(['POST'])
def start(request, lab_id):
    if not request.user.is_authenticated:
        return Response({'detail': 'Для запуска учебного окружения нужна авторизация.'}, status=401)

    lab = Lab.objects.filter(pk=lab_id, is_active=True).first()
    if not lab:
        return Response({'detail': 'Лаборатория не найдена.'}, status=404)
    if lab_id not in IMAGE_BY_LAB:
        return Response({'detail': 'Для этой лаборатории ещё нет Docker-окружения.'}, status=409)

    # Если у пользователя уже есть рабочая сессия этой лаборатории — переиспользуем её.
    existing = LabSession.objects.filter(
        user=request.user, lab=lab, status='running'
    ).first()
    if existing:
        state = container_status(existing.container_name)
        if state == 'running' and existing.host_port:
            return Response({
                'session_id': existing.id,
                'status': 'running',
                'url': f'http://127.0.0.1:{existing.host_port}/',
                'verified': bool(existing.verified_at),
            })

        stop_lab(existing.container_name)
        existing.status = 'stopped'
        existing.stopped_at = timezone.now()
        existing.save(update_fields=['status', 'stopped_at'])

    # Старые незавершённые записи больше не должны блокировать запуск.
    LabSession.objects.filter(
        user=request.user,
        lab=lab,
        status__in=['starting', 'error'],
    ).update(status='stopped', stopped_at=timezone.now())

    try:
        # Контейнер запускаем ДО записи в БД. Поэтому больше нет повторяющегося
        # pending-{user}-{lab_id}, который раньше вызывал UNIQUE constraint failed.
        container_name, host_port, proof_token = start_lab(lab_id)
        try:
            session = LabSession.objects.create(
                user=request.user,
                lab=lab,
                container_name=container_name,
                host_port=host_port,
                proof_token=proof_token,
                status='running',
            )
        except Exception:
            stop_lab(container_name)
            raise

        return Response({
            'session_id': session.id,
            'status': 'running',
            'url': f'http://127.0.0.1:{host_port}/',
            'verified': False,
        })
    except DockerError as exc:
        return Response({'detail': str(exc), 'status': 'error'}, status=503)
    except Exception as exc:
        return Response({'detail': f'Не удалось сохранить сессию лаборатории: {exc}', 'status': 'error'}, status=500)


@api_view(['GET'])
def status(request, lab_id):
    if not request.user.is_authenticated:
        return Response({'detail': 'Требуется авторизация.'}, status=401)

    session = LabSession.objects.filter(
        user=request.user, lab__id=lab_id, status='running'
    ).first()
    if not session:
        return Response({'status': 'stopped', 'url': None})

    state = container_status(session.container_name)
    if state == 'running' and not session.verified_at and container_has_proof(session.container_name, session.proof_token):
        session.verified_at = timezone.now()
        session.save(update_fields=['verified_at'])

    if state != 'running' or not session.host_port:
        stop_lab(session.container_name)
        session.status = 'stopped'
        session.stopped_at = timezone.now()
        session.save(update_fields=['status', 'stopped_at'])
        return Response({'status': 'stopped', 'url': None})

    return Response({
        'session_id': session.id,
        'status': 'running',
        'url': f'http://127.0.0.1:{session.host_port}/',
        'verified': bool(session.verified_at),
    })


@api_view(['POST'])
def proof(request, lab_id):
    token = request.data.get('token')
    if not token:
        return Response({'detail': 'Proof token required.'}, status=400)
    session = LabSession.objects.filter(lab__id=lab_id, status='running', proof_token=token).first()
    if not session:
        return Response({'detail': 'Invalid proof token.'}, status=403)
    if not session.verified_at:
        session.verified_at = timezone.now()
        session.save(update_fields=['verified_at'])
    return Response({'verified': True})


@api_view(['POST'])
def stop(request, lab_id):
    if not request.user.is_authenticated:
        return Response({'detail': 'Требуется авторизация.'}, status=401)

    sessions = LabSession.objects.filter(
        user=request.user, lab__id=lab_id, status='running'
    )
    for session in sessions:
        stop_lab(session.container_name)
        session.status = 'stopped'
        session.stopped_at = timezone.now()
        session.save(update_fields=['status', 'stopped_at'])

    return Response({'status': 'stopped'})

def _browser_user(request):
    token_key = str(request.query_params.get('token', '')).strip()
    if not token_key:
        return None
    try:
        return Token.objects.select_related('user').get(key=token_key).user
    except Token.DoesNotExist:
        return None


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _rewrite_lab_html(body, target_url, proxy_prefix):
    text = body.decode('utf-8', errors='replace')

    def rewrite_attr(match):
        attr, quote, value = match.group(1), match.group(2), match.group(3).strip()
        if not value or value.startswith(('#', 'data:', 'javascript:', 'mailto:', 'tel:')):
            return match.group(0)
        absolute = urljoin(target_url, value)
        parsed = urlparse(absolute)
        base = urlparse(target_url)
        same_lab = (
            parsed.hostname in {'127.0.0.1', 'localhost'}
            and base.hostname in {'127.0.0.1', 'localhost'}
            and (parsed.port or 80) == (base.port or 80)
        )
        if not same_lab:
            return match.group(0)
        if attr.lower() == 'action' and re.match(r'^https?://', value, re.I):
            return match.group(0)
        proxied = f'{proxy_prefix}?{urlencode({"url": absolute})}&token={{TOKEN}}'
        return f'{attr}={quote}{html.escape(proxied, quote=True)}{quote}'

    text = re.sub(r"""(href|src|action)\s*=\s*(['"])(.*?)\2""", rewrite_attr, text, flags=re.I)

    marker = f'{proxy_prefix}?{urlencode({"url": target_url})}&token={{TOKEN}}'
    text = re.sub(
        r'<form(\s+)(?![^>]*\baction\s*=)([^>]*)>',
        lambda m: f'<form{m.group(1)}action="{html.escape(marker, quote=True)}" {m.group(2)}>',
        text, flags=re.I
    )

    bridge = f"""<script>
(function() {{
  try {{
    parent.postMessage({{type:"webseclab-browser-url", url:{json.dumps(target_url)}}},"*");
  }} catch(e) {{}}
}})();
</script>"""
    if re.search(r'</head>', text, re.I):
        text = re.sub(r'</head>', bridge + '</head>', text, count=1, flags=re.I)
    else:
        text = bridge + text
    return text.encode('utf-8')


@api_view(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
def browser_proxy(request, lab_id):
    user = _browser_user(request)
    if not user or not user.is_authenticated:
        return HttpResponse('Browser session expired. Open the lab again.', status=401)

    session = LabSession.objects.filter(
        user=user, lab__id=lab_id, status='running'
    ).first()
    if not session or not session.host_port or container_status(session.container_name) != 'running':
        return HttpResponse('Учебное окружение не запущено.', status=409)

    target = str(request.query_params.get('url', '')).strip()
    if not target:
        target = f'http://127.0.0.1:{session.host_port}/'

    parsed = urlparse(target)
    allowed_host = parsed.hostname in {'127.0.0.1', 'localhost'}
    allowed_port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    if parsed.scheme not in {'http', 'https'} or not allowed_host or allowed_port != session.host_port:
        return HttpResponse('Недопустимый адрес учебного окружения.', status=403)

    if request.method == 'GET':
        extras = []
        for key, values in request.query_params.lists():
            if key in {'url', 'token'}:
                continue
            for value in values:
                extras.append((key, value))
        if extras:
            existing = parse_qs(parsed.query, keep_blank_values=True)
            for key, value in extras:
                existing.setdefault(key, []).append(value)
            target = urlunparse(parsed._replace(query=urlencode(existing, doseq=True)))

    headers = {
        'User-Agent': 'WebSec-Lab-Embedded-Browser/1.0',
        'Accept': request.headers.get('Accept', 'text/html,application/xhtml+xml,*/*;q=0.8'),
    }
    if request.method != 'GET' and request.headers.get('Content-Type'):
        headers['Content-Type'] = request.headers['Content-Type']
    body = request.body if request.method in {'POST', 'PUT', 'PATCH', 'DELETE'} else None

    try:
        opener = urllib.request.build_opener(_NoRedirect())
        upstream = opener.open(
            urllib.request.Request(target, data=body, headers=headers, method=request.method),
            timeout=8,
        )
        status, response_body, response_headers = upstream.status, upstream.read(2 * 1024 * 1024), upstream.headers
    except urllib.error.HTTPError as exc:
        status, response_body, response_headers = exc.code, exc.read(2 * 1024 * 1024), exc.headers
    except Exception as exc:
        return HttpResponse(f'Не удалось открыть учебную страницу: {exc}', status=502)

    content_type = response_headers.get('Content-Type', 'text/plain; charset=utf-8')
    if 'text/html' in content_type.lower():
        proxy_prefix = f'{request.scheme}://{request.get_host()}/api/runtime/{lab_id}/browser/'
        response_body = _rewrite_lab_html(response_body, target, proxy_prefix)
        token = str(request.query_params.get('token', ''))
        response_body = response_body.replace(b'{TOKEN}', token.encode('utf-8'))

    response = HttpResponse(response_body, status=status, content_type=content_type)
    for name in ('Cache-Control', 'Pragma', 'Expires', 'ETag'):
        if response_headers.get(name):
            response[name] = response_headers.get(name)
    return response
