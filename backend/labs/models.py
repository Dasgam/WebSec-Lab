from django.conf import settings
from django.db import models

class Lab(models.Model):
    DIFFICULTIES = [('easy', 'Легкий'), ('medium', 'Средний'), ('hard', 'Сложный')]
    id = models.SlugField(primary_key=True)
    title = models.CharField(max_length=120)
    type = models.CharField(max_length=80)
    difficulty = models.CharField(max_length=20, choices=DIFFICULTIES)
    time_minutes = models.PositiveIntegerField(default=15)
    description = models.TextField()
    objective = models.TextField()
    theory = models.TextField()
    task = models.TextField()
    hints = models.JSONField(default=list)
    checker = models.JSONField(default=dict)
    xp = models.PositiveIntegerField(default=50)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return self.title

class LabProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    lab = models.ForeignKey(Lab, on_delete=models.CASCADE)
    completed = models.BooleanField(default=False)
    attempts = models.PositiveIntegerField(default=0)
    xp_earned = models.PositiveIntegerField(default=0)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=['user', 'lab'], name='unique_user_lab')]
