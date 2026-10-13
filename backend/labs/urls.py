from django.urls import path
from .views import labs, lab_detail, progress, complete, check_lab, analyze_url
from .auth_views import login, register, me, logout, profile, change_password

urlpatterns = [
    path('analyze/', analyze_url),
    path('labs/', labs),
    path('labs/<slug:lab_id>/', lab_detail),
    path('progress/', progress),
    path('labs/<slug:lab_id>/complete/', complete),
    path('labs/<slug:lab_id>/check/', check_lab),
    path('auth/register/', register),
    path('auth/login/', login),
    path('auth/me/', me),
    path('auth/profile/', profile),
    path('auth/change-password/', change_password),
    path('auth/logout/', logout),
]
