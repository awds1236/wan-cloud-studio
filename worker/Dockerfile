FROM pytorch/pytorch:2.8.0-cuda12.8-cudnn-runtime
WORKDIR /app
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY worker/handler.py .
ENV HF_HOME=/runpod-volume/huggingface
CMD ["python", "-u", "handler.py"]
