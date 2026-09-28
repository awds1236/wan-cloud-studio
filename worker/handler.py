"""Single-job Runpod worker. Run on a GPU server, not the desktop."""
import os
import secrets
import tempfile
import time
from pathlib import Path

import boto3
import runpod
import torch
from diffusers import AutoencoderKLWan, WanPipeline, WanTransformer3DModel
from diffusers.utils import export_to_video
from huggingface_hub import hf_hub_download

BASE = 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers'
REPO = 'NSFW-API/NSFW_Wan_1.3b'
CHECKPOINT = 'wan_1.3B_exp_e14.safetensors'
PRESETS = {'draft': (512, 288, 33, 20), 'standard': (832, 480, 81, 30)}
pipeline = None


def load_pipeline():
    global pipeline
    if pipeline is None:
        checkpoint = hf_hub_download(REPO, CHECKPOINT)
        transformer = WanTransformer3DModel.from_single_file(
            checkpoint, config=BASE, subfolder='transformer', torch_dtype=torch.bfloat16)
        vae = AutoencoderKLWan.from_pretrained(BASE, subfolder='vae', torch_dtype=torch.float32)
        candidate = WanPipeline.from_pretrained(
            BASE, transformer=transformer, vae=vae, torch_dtype=torch.bfloat16)
        candidate.enable_model_cpu_offload()
        candidate.vae.enable_tiling()
        pipeline = candidate
    return pipeline


def handler(job):
    data = job['input']
    prompt = data.get('prompt')
    preset = data.get('preset', 'draft')
    seed = data.get('seed', 42)
    if not isinstance(prompt, str) or not 1 <= len(prompt.strip()) <= 2000:
        raise ValueError('Prompt must contain 1–2000 characters.')
    if preset not in PRESETS or type(seed) is not int or not 0 <= seed <= 2147483647:
        raise ValueError('Invalid preset or seed.')
    # Fail before loading the model if durable result storage is not configured.
    required = ['S3_ENDPOINT_URL', 'S3_BUCKET', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY']
    missing = [name for name in required if not os.environ.get(name)]
    if missing:
        raise ValueError('Missing worker environment variables: ' + ', '.join(missing))
    started = time.monotonic()
    client = boto3.client('s3', endpoint_url=os.environ['S3_ENDPOINT_URL'],
                          region_name=os.getenv('AWS_DEFAULT_REGION', 'auto'))
    pipe = load_pipeline()
    width, height, frames, steps = PRESETS[preset]
    with torch.inference_mode():
        video = pipe(prompt=prompt.strip(), negative_prompt='blurry, low quality, distorted, subtitles, watermark',
                     width=width, height=height, num_frames=frames,
                     num_inference_steps=steps, guidance_scale=5.0,
                     generator=torch.Generator(device='cpu').manual_seed(seed)).frames[0]
    with tempfile.TemporaryDirectory() as folder:
        output = str(Path(folder) / 'video.mp4')
        export_to_video(video, output, fps=16)
        key = 'videos/' + secrets.token_hex(16) + '.mp4'
        client.upload_file(output, os.environ['S3_BUCKET'], key,
                           ExtraArgs={'ContentType': 'video/mp4'})
    url = client.generate_presigned_url('get_object',
        Params={'Bucket': os.environ['S3_BUCKET'], 'Key': key}, ExpiresIn=86400)
    return {'video_url': url, 'seed': seed, 'preset': preset,
            'duration_seconds': frames / 16, 'worker_seconds': round(time.monotonic() - started, 2)}


if __name__ == '__main__':
    runpod.serverless.start({'handler': handler})
