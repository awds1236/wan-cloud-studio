# Wan Cloud Studio

Windows PC에서 웹 화면을 열고 Runpod Serverless에 텍스트→영상 생성을 요청하는 개인용 초안입니다. 로컬 GPU와 Python 패키지 설치는 필요 없습니다. Node.js 22 이상이 필요합니다.

요청한 `NSFW-API/NSFW_Wan_1.3b`의 `wan_1.3B_exp_e14.safetensors`를 로드하도록 작성했습니다. 일반적인 비노골적 영상 용도를 전제로 합니다. 해당 모델의 일반 영상 품질은 보장되지 않으며, 체크포인트 호환성·GPU 메모리·생성 속도는 실제 GPU에서 아직 검증하지 않았습니다. 모델 다운로드/사용 조건은 모델 저장소를 확인하세요.

## 1. 로컬 화면 실행

1. `.env.example`을 `.env`로 복사합니다.
2. Runpod 배포 이후 API 키와 엔드포인트 ID를 `.env`에 입력합니다. 키를 대화창이나 Git에 올리지 마세요.
3. `start.cmd`를 실행합니다.
4. 브라우저에서 http://127.0.0.1:8787 을 엽니다.

키가 없어도 화면은 확인할 수 있습니다. 실제 생성은 아래 GPU 워커 배포가 필요합니다. 로컬 서버는 127.0.0.1에만 바인딩합니다.

## 2. 결과 저장소 준비

Cloudflare R2 또는 S3 호환 저장소에 비공개 버킷을 만듭니다. 버킷 전용 읽기/쓰기 자격 증명을 준비하세요. MP4는 버킷에 저장되고 유효기간 24시간의 서명 URL로 반환됩니다. 공개 버킷이나 CORS 설정은 필수가 아닙니다. 영상이 쌓이지 않도록 1일 또는 7일 후 삭제하는 수명 주기 규칙을 설정하세요. URL 만료는 객체 삭제와 다릅니다.

## 3. GPU 워커 이미지 배포

### Runpod에서 GitHub 연결로 배포

저장소: https://github.com/awds1236/wan-cloud-studio

Runpod의 **Deploy from a GitHub repository**에서 이 저장소를 선택하고 Branch는 `main`, Dockerfile path는 `worker/Dockerfile`, 빌드 컨텍스트를 지정하는 항목이 있다면 저장소 루트 `.`으로 설정하세요. Endpoint Type은 **Queue**입니다. 아래 GPU 설정과 저장소 환경 변수를 입력한 뒤 배포합니다. GitHub 코드가 업데이트되면 Runpod의 배포 상태와 적용 커밋을 확인하세요.

GitHub Actions는 커밋마다 로컬 API 테스트와 Python 문법 검사를 실행합니다. GPU 추론이나 컨테이너 빌드 검증을 대신하지 않습니다.

### Docker로 직접 배포하는 경우

Docker가 설치된 Linux 빌드 머신 또는 CI에서 프로젝트 루트를 기준으로 실행합니다. 이미지 빌드는 GPU가 필요하지 않습니다. YOUR_ACCOUNT를 본인 Docker Hub 계정으로 바꾸세요.

```sh
docker build --platform linux/amd64 -f worker/Dockerfile -t YOUR_ACCOUNT/wan-cloud-studio:0.1 .
docker push YOUR_ACCOUNT/wan-cloud-studio:0.1
```

Runpod에서 **Queue-based Serverless endpoint**를 만들고 위 이미지를 사용합니다.

| 항목 | 시작 설정 |
|---|---|
| GPU | 24GB급부터 시험, 메모리 부족 시 48GB |
| CPU RAM | 32GB 이상을 시작점으로 권장, 실제 사용량 확인 필요 |
| Active/min workers | 0 |
| Max workers | 1 |
| Idle timeout | 5초 정도로 시작 |
| Execution timeout | 900초 (요청 코드도 동일 제한) |
| 모델 캐시 | 네트워크 볼륨 50GB부터, `/runpod-volume`에 마운트 |

네트워크 볼륨 없이도 실행 가능하지만 워커가 새로 만들어질 때 모델을 다시 다운로드할 수 있어 대기 시간과 비용이 늘어납니다. 볼륨이 없으면 컨테이너 디스크를 충분히 확보하세요. CPU offload를 사용하므로 메모리와 CPU↔GPU 전송 속도도 성능에 영향을 줍니다.

워커 환경 변수:

```dotenv
S3_ENDPOINT_URL=https://YOUR_ACCOUNT.r2.cloudflarestorage.com
S3_BUCKET=wan-videos
AWS_ACCESS_KEY_ID=YOUR_BUCKET_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_BUCKET_SECRET_KEY
AWS_DEFAULT_REGION=auto
HF_HOME=/runpod-volume/huggingface
# 필요한 경우만 설정
# HF_TOKEN=YOUR_HUGGING_FACE_TOKEN
```

AWS S3라면 해당 리전의 S3 endpoint와 region으로 변경합니다. 자격 증명은 Runpod의 비밀 변수로 저장하세요. 로컬 `.env`에는 Runpod 키와 엔드포인트 ID만 필요합니다.

## 4. 첫 실사용 검증

빠른 시안으로 1건을 생성하고 Runpod 로그에서 체크포인트 로딩과 MP4 업로드 성공을 확인하세요. 그 뒤 기본 설정으로 시험하세요. 아직 실제 GPU 실행을 하지 않았으므로 이미지 빌드나 모델 로딩 단계에서 추가 조정이 필요할 수 있습니다. 이 상태를 배포·영상 생성 완료로 보지 마세요.

시안은 512×288 / 33프레임 / 20단계, 기본은 832×480 / 81프레임 / 30단계입니다. 모두 16fps입니다. 시안은 비용과 품질 확인용이며 기본 해상도보다 품질이 떨어질 수 있습니다.

비용은 GPU 초당 단가 × 실제 과금 시간 + 저장 비용입니다. 최초 다운로드·모델 로딩·유휴 시간도 비용에 영향을 줄 수 있습니다. 최대 워커 수 1은 지출 상한이 아니므로 계정 잔액과 작업 내역을 확인하세요. 제출 요청이 끊어지면 중복 과금을 피하기 위해 콘솔에서 작업 유무를 확인한 뒤 재시도하세요.

생성 중 창을 닫아도 작업은 계속됩니다. 같은 탭에서 새로 고침하면 상태 조회가 재개됩니다. 로컬 서버를 재시작하면 작업 목록이 초기화되므로 기존 작업은 Runpod 콘솔에서 확인/취소하세요. 취소 전 사용한 GPU 시간은 과금될 수 있습니다. Runpod 비동기 작업 결과는 완료 후 30분 동안 조회할 수 있으므로 그 안에 결과 링크를 받으세요. 이후에도 MP4 객체는 버킷 수명 주기 규칙에 따라 남습니다.

## 검증

```sh
npm.cmd test
python -m py_compile worker/handler.py
```

로컬 테스트는 외부 GPU 호출을 모의 처리하여 입력 검증, 요청·상태·취소, 키 비노출, 외부 Origin 차단을 확인합니다. 모델 추론 테스트는 아닙니다.

참고: [Runpod handler](https://docs.runpod.io/serverless/workers/handler-functions), [비동기 요청](https://docs.runpod.io/serverless/endpoints/send-requests), [Diffusers Wan / single-file loading](https://huggingface.co/docs/diffusers/api/pipelines/wan), [요청 모델](https://huggingface.co/NSFW-API/NSFW_Wan_1.3b).
