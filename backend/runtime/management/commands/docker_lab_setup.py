from django.core.management.base import BaseCommand, CommandError

from runtime.docker_manager import IMAGE_BY_LAB, ensure_image, ensure_network, DockerError


class Command(BaseCommand):
    help = 'Подготавливает Docker-сеть и собирает учебные образы WebSec Lab.'

    def add_arguments(self, parser):
        parser.add_argument('--lab', choices=['all', *IMAGE_BY_LAB.keys()], default='all')

    def handle(self, *args, **options):
        try:
            ensure_network()
            labs = IMAGE_BY_LAB.keys() if options['lab'] == 'all' else [options['lab']]
            for lab_id in labs:
                self.stdout.write(f'Сборка/проверка образа: {lab_id} ...')
                image = ensure_image(lab_id)
                self.stdout.write(self.style.SUCCESS(f'OK: {image}'))
        except DockerError as exc:
            raise CommandError(str(exc)) from exc
