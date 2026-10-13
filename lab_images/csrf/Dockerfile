# Offline-friendly: use the already-built local WebSec Lab base image.
# This avoids Docker Hub and does not require internet access.
FROM webseclab/lab-reflected-xss:0.12
WORKDIR /app
COPY app.py /app/app.py
EXPOSE 5000
CMD ["python", "app.py"]
