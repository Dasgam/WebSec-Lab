from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion

class Migration(migrations.Migration):
    initial = True
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('labs', '0002_lab_checker'),
    ]
    operations = [
        migrations.CreateModel(
            name='LabSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('container_name', models.CharField(max_length=180, unique=True)),
                ('host_port', models.PositiveIntegerField(blank=True, null=True)),
                ('status', models.CharField(choices=[('starting','Запускается'),('running','Работает'),('stopped','Остановлена'),('error','Ошибка')], default='starting', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('stopped_at', models.DateTimeField(blank=True, null=True)),
                ('lab', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='labs.lab')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
    ]
