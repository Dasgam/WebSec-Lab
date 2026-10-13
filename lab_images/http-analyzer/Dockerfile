FROM webseclab/lab-reflected-xss:0.12
WORKDIR /app
COPY worker.py /app/worker.py
RUN rm -f /app/app.py
EXPOSE 8765
ENTRYPOINT ["python", "/app/worker.py"]
