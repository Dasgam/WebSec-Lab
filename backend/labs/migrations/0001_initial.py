from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]
    operations = [
        migrations.CreateModel(
            name='Lab',
            fields=[
                ('id', models.SlugField(primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=120)),
                ('type', models.CharField(max_length=80)),
                ('difficulty', models.CharField(choices=[('easy', 'Легкий'), ('medium', 'Средний'), ('hard', 'Сложный')], max_length=20)),
                ('time_minutes', models.PositiveIntegerField(default=15)),
                ('description', models.TextField()),
                ('objective', models.TextField()),
                ('theory', models.TextField()),
                ('task', models.TextField()),
                ('hints', models.JSONField(default=list)),
                ('xp', models.PositiveIntegerField(default=50)),
                ('is_active', models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name='LabProgress',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('completed', models.BooleanField(default=False)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('xp_earned', models.PositiveIntegerField(default=0)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('lab', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='labs.lab')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name='labprogress',
            constraint=models.UniqueConstraint(fields=('user', 'lab'), name='unique_user_lab'),
        ),
    ]
