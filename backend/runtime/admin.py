from django.contrib import admin
from .models import LabSession

@admin.register(LabSession)
class LabSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'user', 'lab', 'status', 'host_port', 'created_at', 'stopped_at')
    list_filter = ('status', 'lab')
    search_fields = ('container_name', 'user__username', 'lab__id')
