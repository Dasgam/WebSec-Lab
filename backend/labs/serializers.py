from rest_framework import serializers
from .models import Lab, LabProgress


class LabSerializer(serializers.ModelSerializer):
    time = serializers.IntegerField(source='time_minutes')

    class Meta:
        model = Lab
        fields = ['id', 'title', 'type', 'difficulty', 'time', 'description', 'objective', 'theory', 'task', 'hints', 'checker', 'xp']


class ProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabProgress
        fields = ['lab_id', 'completed', 'attempts', 'xp_earned', 'completed_at']
