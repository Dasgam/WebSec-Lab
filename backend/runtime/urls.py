from django.urls import path
from .views import start, status, stop, proof, browser_proxy

urlpatterns = [
    path('<slug:lab_id>/start/', start),
    path('<slug:lab_id>/status/', status),
    path('<slug:lab_id>/stop/', stop),
    path('<slug:lab_id>/proof/', proof),
    path('<slug:lab_id>/browser/', browser_proxy),
]
