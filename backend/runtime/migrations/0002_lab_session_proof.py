from django.db import migrations, models

class Migration(migrations.Migration):
    dependencies = [('runtime', '0001_initial')]
    operations = [
        migrations.AddField(model_name='labsession', name='proof_token', field=models.CharField(blank=True, max_length=64, null=True, unique=True)),
        migrations.AddField(model_name='labsession', name='verified_at', field=models.DateTimeField(blank=True, null=True)),
    ]
