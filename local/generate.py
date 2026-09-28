"""Isolated local inference process; killing it cancels download/inference."""
import argparse
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ['HF_HOME'] = str(ROOT / '.cache-local' / 'huggingface')
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
BASE = 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers'
PRESETS = {'tiny': (256, 144, 9, 4), 'draft': (512, 288, 33, 20), 'standard': (832, 480, 81, 30)}


def generate(data, output):
    import torch
    from diffusers import AutoencoderKLWan, WanPipeline, WanTransformer3DModel
    from diffusers.utils import export_to_video
    from huggingface_hub import hf_hub_download
    gpu = torch.cuda.is_available()
    # CPU uses BF16 to reduce RAM pressure. This is experimental and slow on older CPUs.
    dtype = torch.bfloat16 if not gpu or torch.cuda.is_bf16_supported() else torch.float16
    torch.set_num_threads(max(1, (os.cpu_count() or 2) - 1))
    print('Preparing model files. First run downloads many GB; see terminal for progress.', flush=True)
    checkpoint = hf_hub_download('NSFW-API/NSFW_Wan_1.3b', 'wan_1.3B_exp_e14.safetensors')
    transformer = WanTransformer3DModel.from_single_file(checkpoint, config=BASE, subfolder='transformer', torch_dtype=dtype)
    vae = AutoencoderKLWan.from_pretrained(BASE, subfolder='vae', torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(BASE, transformer=transformer, vae=vae, torch_dtype=dtype)
    pipe.vae.enable_tiling()
    if gpu:
        pipe.enable_sequential_cpu_offload()
    else:
        pipe.to('cpu')
    width, height, frames, steps = PRESETS[data['preset']]
    def progress_callback(pipeline, step, timestep, kwargs):
        print(f'Generation step {step + 1}/{steps}', flush=True)
        return kwargs
    print('Generating with ' + ('CUDA GPU' if gpu else 'CPU (experimental)'), flush=True)
    with torch.inference_mode():
        video = pipe(prompt=data['prompt'], negative_prompt='blurry, low quality, distorted, watermark',
                     width=width, height=height, num_frames=frames, num_inference_steps=steps,
                     guidance_scale=5.0, generator=torch.Generator('cpu').manual_seed(data['seed']),
                     callback_on_step_end=progress_callback).frames[0]
    output.parent.mkdir(exist_ok=True)
    export_to_video(video, str(output), fps=16)
    print('MP4 saved.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--probe', action='store_true')
    parser.add_argument('--input')
    parser.add_argument('--output')
    args = parser.parse_args()
    if args.probe:
        import torch
        import diffusers
        from diffusers import WanPipeline, WanTransformer3DModel, AutoencoderKLWan
        from diffusers.utils import export_to_video
        print(json.dumps({'torch': torch.__version__, 'diffusers': diffusers.__version__,
                          'device': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'}))
    else:
        generate(json.loads(Path(args.input).read_text(encoding='utf-8')), Path(args.output))
