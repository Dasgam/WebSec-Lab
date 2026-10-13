import json
import subprocess
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

from django.conf import settings

ANALYZER_IMAGE = 'webseclab/http-analyzer:2.2'
ANALYZER_NETWORK = 'webseclab-http-analyzer'
ANALYZER_CONTAINER = 'webseclab-http-analyzer'
ANALYZER_CONTAINER_PORT = 8765
ANALYZER_HOST_PORT = 8790

IMAGE_BY_LAB = {
    'xss-reflected': 'webseclab/lab-reflected-xss:0.12',
    'xss-stored': 'webseclab/lab-stored-xss:0.12',
    'csrf': 'webseclab/lab-csrf:0.12',
    'sqli': 'webseclab/lab-sqli:0.12',
}

NETWORK_NAME = 'webseclab-labnet-runtime'
CONTAINER_PORT = 5000
HOST_PORT_BY_LAB = {
    'xss-reflected': 8081,
    'xss-stored': 8082,
    'csrf': 8083,
    'sqli': 8084,
}
BASE = Path(settings.BASE_DIR).parent / 'lab_images'


class DockerError(RuntimeError):
    pass


def _run(args, timeout=60):
    try:
        process = subprocess.run(
            ['docker', *args],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except FileNotFoundError as exc:
        raise DockerError(
            'Команда docker не найдена. Убедитесь, что Docker Desktop установлен и запущен.'
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise DockerError('Docker не ответил вовремя. Проверьте Docker Desktop.') from exc

    if process.returncode != 0:
        message = (process.stderr or process.stdout or 'Неизвестная ошибка Docker').strip()
        raise DockerError(message[:1600])
    return process.stdout.strip()


def _image_exists(image):
    try:
        process = subprocess.run(
            ['docker', 'image', 'inspect', image],
            capture_output=True,
            text=True,
            timeout=20,
        )
        return process.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def ensure_image(lab_id):
    image = IMAGE_BY_LAB.get(lab_id)
    if not image:
        raise DockerError('Для этой лаборатории нет Docker-образа.')

    if not _image_exists(image):
        folder = BASE / lab_id
        if not folder.is_dir():
            raise DockerError(f'Не найден каталог лаборатории: {folder}')
        _run(['build', '-t', image, str(folder)], timeout=300)

    return image


def ensure_analyzer_image():
    if _image_exists(ANALYZER_IMAGE):
        return ANALYZER_IMAGE
    folder = BASE / 'http-analyzer'
    if not folder.is_dir():
        raise DockerError(f'Не найден каталог HTTP Analyzer: {folder}')
    _run(['build', '-t', ANALYZER_IMAGE, str(folder)], timeout=300)
    return ANALYZER_IMAGE


def ensure_analyzer_network():
    try:
        process = subprocess.run(
            ['docker', 'network', 'inspect', ANALYZER_NETWORK],
            capture_output=True, text=True, timeout=20,
        )
    except FileNotFoundError as exc:
        raise DockerError('Команда docker не найдена.') from exc
    except subprocess.TimeoutExpired as exc:
        raise DockerError('Docker не ответил при проверке сети Analyzer.') from exc
    if process.returncode != 0:
        _run(['network', 'create', '--driver', 'bridge', ANALYZER_NETWORK], timeout=30)


def _analyzer_container_running():
    try:
        result = _run([
            'inspect', '-f', '{{.State.Running}}', ANALYZER_CONTAINER
        ], timeout=20)
        return result.strip().lower() == 'true'
    except DockerError:
        return False


def ensure_analyzer_container():
    image = ensure_analyzer_image()
    ensure_analyzer_network()

    if _analyzer_container_running():
        return

    # A stopped container can be reused after a Docker Desktop restart.
    try:
        inspect = subprocess.run(
            ['docker', 'container', 'inspect', ANALYZER_CONTAINER],
            capture_output=True, text=True, timeout=20,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        inspect = None

    if inspect and inspect.returncode == 0:
        _run(['start', ANALYZER_CONTAINER], timeout=30)
        return

    _run([
        'run', '-d',
        '--name', ANALYZER_CONTAINER,
        '--network', ANALYZER_NETWORK,
        '--add-host', 'host.docker.internal:host-gateway',
        '-p', f'127.0.0.1:{ANALYZER_HOST_PORT}:{ANALYZER_CONTAINER_PORT}',
        '--cpus', '0.25',
        '--memory', '128m',
        '--pids-limit', '64',
        '--read-only',
        '--cap-drop', 'ALL',
        '--security-opt', 'no-new-privileges',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
        '--restart', 'unless-stopped',
        image,
    ], timeout=60)


def _wait_analyzer_ready(timeout=12):
    deadline = time.time() + timeout
    last_error = ''
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(
                f'http://127.0.0.1:{ANALYZER_HOST_PORT}/health', timeout=1.5
            ) as response:
                if response.status == 200:
                    return
        except Exception as exc:
            last_error = str(exc)
        time.sleep(0.35)
    raise DockerError(
        f'HTTP Analyzer Docker-контейнер запущен, но worker не отвечает на '
        f'127.0.0.1:{ANALYZER_HOST_PORT}. {last_error}'
    )


def run_http_analyzer(url, timeout=12):
    ensure_analyzer_container()
    _wait_analyzer_ready()
    payload = json.dumps({
        'url': url,
        'timeout': min(max(int(timeout), 3), 15),
    }, ensure_ascii=False).encode('utf-8')

    try:
        request = urllib.request.Request(
            f'http://127.0.0.1:{ANALYZER_HOST_PORT}/analyze',
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            method='POST',
        )
        with urllib.request.urlopen(request, timeout=min(max(int(timeout), 3), 15) + 3) as response:
            raw = response.read(2 * 1024 * 1024)
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read().decode('utf-8', errors='replace')).get('error')
        except Exception:
            detail = None
        raise DockerError(detail or f'HTTP Analyzer вернул HTTP {exc.code}.') from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise DockerError(f'HTTP Analyzer недоступен: {exc}') from exc

    try:
        result = json.loads(raw.decode('utf-8'))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise DockerError('HTTP Analyzer вернул некорректный JSON.') from exc
    if result.get('error'):
        raise DockerError(str(result['error']))
    return result

def ensure_network():
    try:
        process = subprocess.run(
            ['docker', 'network', 'inspect', NETWORK_NAME],
            capture_output=True,
            text=True,
            timeout=20,
        )
    except FileNotFoundError as exc:
        raise DockerError('Команда docker не найдена.') from exc
    except subprocess.TimeoutExpired as exc:
        raise DockerError('Docker не ответил при проверке сети.') from exc

    if process.returncode != 0:
        _run(['network', 'create', NETWORK_NAME], timeout=30)


def start_lab(lab_id):
    image = ensure_image(lab_id)
    ensure_network()

    host_port = HOST_PORT_BY_LAB.get(lab_id)
    if not host_port:
        raise DockerError('Для этой лаборатории не назначен локальный порт.')

    # Если контейнер с этим учебным портом уже остался от предыдущего запуска,
    # удаляем только контейнеры WebSec Lab для этой же лаборатории.
    existing_raw = _run(['ps', '-aq', '--filter', f'name=webseclab-{lab_id}-'], timeout=20)
    for existing_id in [x.strip() for x in existing_raw.splitlines() if x.strip()]:
        stop_lab(existing_id)

    name = f'webseclab-{lab_id}-{uuid.uuid4().hex[:10]}'
    proof_token = uuid.uuid4().hex
    callback_url = f'http://host.docker.internal:8000/api/runtime/{lab_id}/proof/'
    app_file = BASE / lab_id / 'app.py'
    if not app_file.is_file():
        raise DockerError(f'Не найден файл лаборатории: {app_file}')
    _run([
        'run', '-d',
        '--name', name,
        '--network', NETWORK_NAME,
        '--cpus', '0.50',
        '--memory', '256m',
        '--pids-limit', '128',
        '--read-only',
        '-e', f'WEBSECLAB_PROOF_TOKEN={proof_token}',
        '-e', f'WEBSECLAB_CALLBACK_URL={callback_url}',
        '--mount', f'type=bind,source={app_file.resolve()},target=/app/app.py,readonly',
        '--tmpfs', '/tmp:rw,noexec,nosuid,size=32m',
        '-p', f'127.0.0.1:{host_port}:{CONTAINER_PORT}',
        image,
    ], timeout=60)

    raw = _run(['port', name, f'{CONTAINER_PORT}/tcp'])
    if not raw:
        stop_lab(name)
        raise DockerError('Docker не назначил локальный порт лаборатории.')

    actual_port = int(raw.rsplit(':', 1)[1])

    # docker run возвращает контейнер сразу после старта процесса, но HTTP-сервер
    # внутри учебного контейнера может ещё несколько сотен миллисекунд запускаться.
    # Ждём реальной готовности HTTP, чтобы frontend не получил пустой/ошибочный iframe.
    deadline = time.monotonic() + 15
    url = f'http://127.0.0.1:{actual_port}/'
    last_error = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if 200 <= response.status < 500:
                    return name, actual_port, proof_token
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        time.sleep(0.25)

    stop_lab(name)
    detail = f' HTTP: {last_error}' if last_error else ''
    raise DockerError(f'Лаборатория запустила контейнер, но веб-сервис не стал доступен вовремя.{detail}')


def stop_lab(container_name):
    if not container_name or container_name.startswith('pending-'):
        return
    try:
        _run(['rm', '-f', container_name], timeout=30)
    except DockerError:
        # Сессия уже могла быть удалена вручную из Docker Desktop.
        pass


def container_status(container_name):
    try:
        raw = _run(['inspect', '--format', '{{json .State}}', container_name], timeout=20)
        state = json.loads(raw)
        return state.get('Status', 'unknown')
    except DockerError as exc:
        if 'No such object' in str(exc) or 'no such object' in str(exc).lower():
            return 'missing'
        return 'unknown'

def container_has_proof(container_name, proof_token):
    if not container_name or not proof_token:
        return False
    try:
        raw = _run(['exec', container_name, 'cat', '/tmp/.webseclab-proof'], timeout=5)
    except DockerError:
        return False
    return raw.strip() == proof_token
