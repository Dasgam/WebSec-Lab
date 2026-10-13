from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('labs', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='lab',
            name='checker',
            field=models.JSONField(default=dict),
        ),
    ]
