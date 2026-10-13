from django.utils import timezone
import re
from urllib.parse import urlparse
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import Lab, LabProgress
from runtime.models import LabSession
from .serializers import LabSerializer



@api_view(['POST'])
def analyze_url(request):
    raw_url = str(request.data.get('url', '')).strip()
    if not raw_url:
        return Response({'detail': 'Укажите URL для анализа.'}, status=400)
    if not re.match(r'^https?://', raw_url, re.I):
        raw_url = 'https://' + raw_url

    parsed = urlparse(raw_url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return Response({'detail': 'Поддерживаются только корректные HTTP/HTTPS URL.'}, status=400)
    if parsed.username or parsed.password:
        return Response({'detail': 'URL с логином и паролем не поддерживается.'}, status=400)

    # Defense-in-depth: the same SSRF policy is enforced again inside the sandbox worker.
    # Local lab ports are explicitly allowed so the analyzer can inspect WebSec Lab itself.
    try:
        port = parsed.port or (443 if parsed.scheme == 'https' else 80)
    except ValueError:
        return Response({'detail': 'Некорректный номер порта в URL.'}, status=400)
    if parsed.hostname.lower() in {'localhost', '127.0.0.1'} and port not in {8081, 8082, 8083, 8084}:
        return Response({'detail': 'Доступ к локальным сервисам запрещён. Разрешены только порты учебных лабораторий 8081–8084.'}, status=403)

    try:
        timeout = min(max(int(request.data.get('timeout', 12)), 3), 15)
    except (TypeError, ValueError):
        timeout = 12
    try:
        from runtime.docker_manager import run_http_analyzer
        result = run_http_analyzer(raw_url, timeout)
    except Exception as exc:
        message = str(exc)
        status_code = 504 if 'врем' in message.lower() or 'timeout' in message.lower() else 502
        return Response({'detail': message, 'url': raw_url}, status=status_code)
    return Response(result)


@api_view(['GET'])
def labs(request):
    return Response(LabSerializer(Lab.objects.filter(is_active=True), many=True).data)

@api_view(['GET'])
def lab_detail(request, lab_id):
    lab = Lab.objects.filter(pk=lab_id, is_active=True).first()
    if not lab:
        return Response({'detail': 'Лаборатория не найдена.'}, status=404)
    return Response(LabSerializer(lab).data)

@api_view(['GET'])
def progress(request):
    items = LabProgress.objects.filter(user=request.user) if request.user.is_authenticated else LabProgress.objects.none()
    completed_items = items.filter(completed=True).select_related('lab')
    completed_ids = list(completed_items.values_list('lab_id', flat=True))
    xp = sum(items.values_list('xp_earned', flat=True))
    details = list(items.values('lab_id', 'completed', 'attempts', 'xp_earned', 'completed_at'))
    return Response({'completed_labs': completed_ids, 'completed_count': len(completed_ids), 'xp': xp, 'details': details})

def _normalize_answer(value):
    value = (value or '').lower().replace('ё', 'е')
    return re.sub(r"\s+", " ", value).strip()


def _matches_group(answer, variants):
    return any(str(item).lower().replace('ё', 'е') in answer for item in variants)


@api_view(['POST'])
def check_lab(request, lab_id):
    lab = Lab.objects.filter(pk=lab_id, is_active=True).first()
    if not lab:
        return Response({'detail': 'Лаборатория не найдена.'}, status=404)
    if not request.user.is_authenticated:
        return Response({'detail': 'Для проверки и сохранения результата нужна авторизация.'}, status=401)

    answer = _normalize_answer(request.data.get('answer', ''))
    if not answer:
        return Response({'passed': False, 'feedback': 'Сначала запишите свой вывод в поле ответа.', 'xp_awarded': 0}, status=400)

    config = lab.checker or {}
    min_length = int(config.get('min_length', 60))
    if len(answer) < min_length:
        return Response({
            'passed': False,
            'feedback': f'Ответ слишком короткий. Нужен связный вывод минимум из {min_length} символов: опишите наблюдение, механизм уязвимости и защиту.',
            'xp_awarded': 0,
        })

    groups = config.get('required_groups') or []
    matched_groups = [group for group in groups if _matches_group(answer, group.get('variants', []))]
    required_groups = int(config.get('min_groups', len(groups) if groups else 1))

    if not groups:
        keywords = [str(x).lower().replace('ё', 'е') for x in config.get('keywords', [])]
        min_matches = int(config.get('min_matches', max(1, len(keywords))))
        matched_groups = [word for word in keywords if word in answer]
        required_groups = min_matches

    passed = len(matched_groups) >= required_groups
    item, _ = LabProgress.objects.get_or_create(user=request.user, lab=lab)
    item.attempts += 1
    xp_awarded = 0

    if passed:
        if not item.completed:
            item.completed = True
            item.xp_earned = lab.xp
            item.completed_at = timezone.now()
            xp_awarded = lab.xp
        feedback = config.get('success_feedback', 'Ответ принят. Вы правильно объяснили механизм уязвимости.')
    else:
        missing = [group.get('label', 'ключевой признак') for group in groups if group not in matched_groups]
        feedback = config.get('fail_feedback', 'Ответ пока недостаточно точный. Свяжите наблюдение с механизмом уязвимости.')
        if missing:
            feedback += ' Не хватает: ' + ', '.join(missing[:2]) + '.'

    item.save()
    return Response({
        'passed': passed,
        'feedback': feedback,
        'xp_awarded': xp_awarded,
        'attempts': item.attempts,
        'matched': len(matched_groups),
        'required': required_groups,
    })


@api_view(['POST'])
def complete(request, lab_id):
    lab = Lab.objects.filter(pk=lab_id, is_active=True).first()
    if not lab:
        return Response({'detail': 'Лаборатория не найдена.'}, status=404)
    if not request.user.is_authenticated:
        return Response({'detail': 'Для сохранения прогресса нужна авторизация.'}, status=401)
    session = LabSession.objects.filter(
        user=request.user, lab=lab, status='running'
    ).first()
    if not session:
        return Response({
            'detail': 'Сначала запустите лабораторию.',
            'verified': False,
        }, status=409)

    # Повторно проверяем proof непосредственно перед завершением.
    # Это устраняет гонку между polling во frontend и нажатием кнопки.
    verified = bool(session.verified_at)
    if not verified:
        from runtime.docker_manager import container_has_proof
        if container_has_proof(session.container_name, session.proof_token):
            session.verified_at = timezone.now()
            session.save(update_fields=['verified_at'])
            verified = True

    if not verified:
        return Response({
            'detail': 'Практическое действие ещё не подтверждено. Выполните действие в Browser и нажмите «Проверить выполнение».',
            'verified': False,
        }, status=409)
    item, _ = LabProgress.objects.get_or_create(user=request.user, lab=lab)
    if not item.completed:
        item.completed = True
        item.xp_earned = lab.xp
        item.completed_at = timezone.now()
        item.save(update_fields=['completed', 'xp_earned', 'completed_at'])
    total_xp = sum(LabProgress.objects.filter(user=request.user).values_list('xp_earned', flat=True))
    return Response({
        'lab_id': item.lab_id,
        'completed': item.completed,
        'attempts': item.attempts,
        'xp_earned': item.xp_earned,
        'total_xp': total_xp,
        'completed_at': item.completed_at,
        'verified': True,
    })
