from django.contrib import admin
from .models import Lab, LabProgress

@admin.register(Lab)
class LabAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'type', 'difficulty', 'is_active')
    list_filter = ('type', 'difficulty', 'is_active')
    search_fields = ('id', 'title')
    fieldsets = (
        (None, {'fields': ('id', 'title', 'type', 'difficulty', 'time_minutes', 'description', 'objective', 'theory', 'task')}),
        ('Проверка', {'fields': ('hints', 'checker', 'xp', 'is_active')}),
    )

@admin.register(LabProgress)
class LabProgressAdmin(admin.ModelAdmin):
    list_display = ('user', 'lab', 'completed', 'attempts', 'xp_earned', 'completed_at')
    list_filter = ('completed', 'lab')
