from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    return JsonResponse({'status': 'ok'})

urlpatterns = [
    path('health', health),
    path('health/', health),
    path('admin/', admin.site.urls),
    path('api/', include('labs.urls')),
    path('api/runtime/', include('runtime.urls')),
]
