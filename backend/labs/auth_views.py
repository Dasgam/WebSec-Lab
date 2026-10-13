from django.contrib.auth import authenticate, get_user_model
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

User = get_user_model()


def user_payload(user):
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
    }


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def register(request):
    username = str(request.data.get('username', '')).strip()
    email = str(request.data.get('email', '')).strip()
    password = str(request.data.get('password', ''))

    if len(username) < 3:
        return Response({'detail': 'Логин должен содержать минимум 3 символа.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(password) < 6:
        return Response({'detail': 'Пароль должен содержать минимум 6 символов.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username__iexact=username).exists():
        return Response({'detail': 'Пользователь с таким логином уже существует.'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, email=email, password=password)
    token = Token.objects.create(user=user)
    return Response({'token': token.key, 'user': user_payload(user)}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def login(request):
    username = str(request.data.get('username', '')).strip()
    password = str(request.data.get('password', ''))
    user = authenticate(username=username, password=password)
    if not user:
        return Response({'detail': 'Неверный логин или пароль.'}, status=status.HTTP_400_BAD_REQUEST)

    token, _ = Token.objects.get_or_create(user=user)
    return Response({'token': token.key, 'user': user_payload(user)})


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(user_payload(request.user))


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def profile(request):
    username = str(request.data.get('username', request.user.username)).strip()
    email = str(request.data.get('email', request.user.email or '')).strip()
    if len(username) < 3:
        return Response({'detail': 'Логин должен содержать минимум 3 символа.'}, status=status.HTTP_400_BAD_REQUEST)
    if User.objects.filter(username__iexact=username).exclude(pk=request.user.pk).exists():
        return Response({'detail': 'Пользователь с таким логином уже существует.'}, status=status.HTTP_400_BAD_REQUEST)
    request.user.username = username
    request.user.email = email
    request.user.save(update_fields=['username', 'email'])
    return Response(user_payload(request.user))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    current_password = str(request.data.get('current_password', ''))
    new_password = str(request.data.get('new_password', ''))
    confirm_password = str(request.data.get('confirm_password', ''))

    if not current_password or not request.user.check_password(current_password):
        return Response({'detail': 'Текущий пароль указан неверно.'}, status=status.HTTP_400_BAD_REQUEST)
    if len(new_password) < 8:
        return Response({'detail': 'Новый пароль должен содержать минимум 8 символов.'}, status=status.HTTP_400_BAD_REQUEST)
    if new_password != confirm_password:
        return Response({'detail': 'Новые пароли не совпадают.'}, status=status.HTTP_400_BAD_REQUEST)
    if new_password == current_password:
        return Response({'detail': 'Новый пароль должен отличаться от текущего.'}, status=status.HTTP_400_BAD_REQUEST)

    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])

    # Token auth has one active token per account in this project.
    # Rotate it after a password change so the current session stays usable.
    Token.objects.filter(user=request.user).delete()
    token = Token.objects.create(user=request.user)
    return Response({'token': token.key, 'user': user_payload(request.user), 'detail': 'Пароль успешно изменён.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response({'detail': 'Вы вышли из системы.'})
