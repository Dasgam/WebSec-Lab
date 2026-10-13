from django.conf import settings
from django.db import models
from labs.models import Lab

class LabSession(models.Model):
    STATUS = [('starting','Запускается'),('running','Работает'),('stopped','Остановлена'),('error','Ошибка')]
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    lab = models.ForeignKey(Lab, on_delete=models.CASCADE)
    container_name = models.CharField(max_length=180, unique=True)
    host_port = models.PositiveIntegerField(null=True, blank=True)
    proof_token = models.CharField(max_length=64, unique=True, null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS, default='starting')
    created_at = models.DateTimeField(auto_now_add=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} / {self.lab_id} / {self.status}'
