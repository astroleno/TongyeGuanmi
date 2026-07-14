# 首页媒体瘦身：Batch A.1 资产报告

生成日期：2026-07-14
工作分支：`codex/homepage-asset-slimming-generation`
工作目录：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-homepage-asset-slimming-generation`
Batch A v1 父提交：`7ea69d5864eb91b2aaf5ef424229d14ba2c40ec6`
主要 archive ref：`d4cab484e8f2d8656cf7c7cd0e19c015c7332702`
生成/验证工具：FFmpeg 8.1（`libvpx-vp9`）、OpenCV；所有 WebM 读入均显式使用 `-c:v libvpx-vp9`，以实际解码 VP9 alpha。

## 范围与边界

- 本次仅替换八个 canonical non-Hero WebM，并更新本报告和恢复演练记录。没有改动 Hero 视频、Hero poster、应用代码、CSS、manifest、runtime、旧生产资产引用或任何 R5 integration worktree。
- 已存在的 Batch A v1 WebP 派生图像保持原样；`hero-figure-scrub.webm` 与 `hero-figure-scrub-poster.webp` 是**未采纳的 Batch A 实验输出**，本次未修改，也不是 Batch B 输入。
- `assets/figure1.webm` 与 `assets/figure-poster.jpg` 保留、未重编码、未替换。没有生成 TTG reverse 文件或 poster，也没有生成新的 candidate/cutover tag。
- 本报告只证明离线资产；真实浏览器中的方向切换、CSS 场景背景和运行时连续性仍是未启动的 Batch B gate。

## 冻结的权威来源与采样

| Canonical 输出 | 冻结来源（SHA-256） | Batch A.1 处理 |
| --- | --- | --- |
| Figure2 left | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha-scrub.webm`，`68f3526e6b77da084c883a4d4e8232b9fd44827d84edfc4ff5b612908b6a1ab9`；17,287,186 bytes；600×1066、120 帧、24fps | 以 `round(i*119/77)` 采 78 个不同作者帧，保留 0/119 端点。 |
| Figure2 right | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2b-alpha-scrub.webm`，`d0a0bc8267522de84e4364d99d527f07c48f56417705ddb929e4cb116a34278b`；16,775,517 bytes；600×1066、120 帧、24fps | 以 `round(i*119/77)` 采 78 个不同作者帧，保留端点。 |
| PH | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ph_figure-alpha-scrub.webm`，`8f5e36c4b3ffcdc21484021e0bc93c97edd146821dfd1bb05b3ac5d1a14c9d79`；15,302,466 bytes；1672×942、76 帧、30fps | 以 `round(i*75/45)` 采 46 个不同作者帧；没有伪造 1.52s 容器。 |
| TTG | 用户提供的原始高帧率工程导出：`/Users/aitoshuu/Downloads/jimeng-2026-07-12-3173-人物从坐姿缓慢站立起来变成站姿并发出天问。背景高饱和纯紫红色#FF00FF，方便....mp4`，`d7ec5841483861540b17c1b334ea13ff0efed7df649be5101e2030bae05c9b6c`；29,879,668 bytes；1792×3184、240 帧、约 59.75fps、4.086712s | 用完整动作的 `round(i*239/74)` 采 75 个不同作者帧，含 0/239 端点。`5f53013fe1a26d12df4fbd1c48d2a0f84ce8047d:assets/ttg_figure-alpha-scrub.webm`（3,559,889 bytes；文件 SHA `3b4ab3087b665fcad3f16e4e2716d8693d5d2ffe5f37c41b12cb72c48a012b51`）仅作首尾、matte 与合成对照，绝非编码输入。 |
| Crane figure | RGB motion root：`d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure1.mp4`，`3737b39cdcf826aef9ff0553acba3cf33350b649934798d56ca04196b576ab66`，33,523,375 bytes，3184×1792、300 帧、约 60fps；matte/端点：同 ref 的 `assets/crane-figure1-transition.webm`，`995c0737bda965643175ac4a83aa2fa92cdcffddfa7c69a0c59b884fefabbdec`，5,637,648 bytes，1440×810、60 帧、24fps | 从 motion root 重建 75 帧，并以 transition matte/端点核对；未将 24fps WebM 补帧。 |
| Crane flock | `ac46a868e13ca286ea3a6cdfad71c5b6e0ca37b1:assets/crane-figure2-transition.webm`，`b96e13b85f85a70c0e71d2f9c11ac64aca1830fa6af3c1ee3b7272133cf09457`；2,651,324 bytes；1280×720、74 帧、30fps、2.466s | 保留 74 个全部不同作者帧，只复制第 74 个作者帧为第 75 个 **terminal hold**；无插帧、无外部工程搜索。 |
| AOD | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod_figure-alpha-front-scrub.webm`，`239c2bb4e9d35d34ee2a454e1c6662b6ec4b2cf13f677dbb6c51b02413ed4a71`；6,477,276 bytes；1672×941、151 帧、30fps | 以 `round(i*150/77)` 采 78 个不同作者帧。 |
| Figure3 | `262b17b8c07f2921d91b308d89586e2f7fd6c00a:assets/figure3-alpha-scrub.webm`，`8707a7808d2f0078eebc496891dfe529e8b81a82def73c24f94955293fcf3be3`；6,487,783 bytes；1440×810、121 帧、24fps | 以 `round(i*120/77)` 采 78 个不同作者帧，缩放到既定 1280×720 输出。 |

TTG 采样索引为：`0, 3, 6, 10, 13, 16, 19, 23, 26, 29, 32, 36, 39, 42, 45, 48, 52, 55, 58, 61, 65, 68, 71, 74, 78, 81, 84, 87, 90, 94, 97, 100, 103, 107, 110, 113, 116, 120, 123, 126, 129, 132, 136, 139, 142, 145, 149, 152, 155, 158, 161, 165, 168, 171, 174, 178, 181, 184, 187, 191, 194, 197, 200, 203, 207, 210, 213, 216, 220, 223, 226, 229, 233, 236, 239`；75/75 个文件帧和 75/75 个输出 RGBA 帧均不同。

## Batch A.1 输出验证

帧数以 `ffprobe -count_frames` 与强制 alpha 解码逐帧交叉验证；PTS 是呈现帧的实际 `best_effort_timestamp_time`。每一行的 “alpha” 同时表示 stream tag `alpha_mode=1` 和 `alphaextract` 实测范围 0–255；GOP 为 keyframe 数，编码上限为 `g=8`。

| 输出 | 规格、帧数、容器时长 | first / last PTS | alpha / keyframes | RGBA 帧身份 | 字节 / SHA-256 |
| --- | --- | --- | --- | --- |
| `figure2-left-motion.webm` | 600×1066；30fps；78；2.600000s | 0.000 / 2.567s | 0–255 / 10 | 78/78 不同 | 4,063,470 / `9e58707c959d9111af1f1ea2420855292a0449862dc68c93298efc48866597a4` |
| `figure2-right-motion.webm` | 600×1066；30fps；78；2.600000s | 0.000 / 2.567s | 0–255 / 10 | 78/78 不同 | 3,578,198 / `7dbd981ccdda04a2ca0d598fdcc878151ec0c9b6a375249f38cc0ca30d2be737` |
| `ph-figure-motion.webm` | 1672×942；30fps；46；**1.533000s** | 0.000 / 1.500s | 0–255 / 6 | 46/46 不同 | 2,646,001 / `49e23297a26fa0d6cc3862d6c4123e8090c521bafb3fe718de2ca4fc130169d6` |
| `ttg-figure-motion.webm` | 720×1280；30fps；75；2.500000s | 0.000 / 2.467s | 0–255 / 10 | 75/75 不同；75 个不同作者帧 | 2,669,734 / `3b61c3cbcb88d8fa3ecb14faac694a4092676887a3b4cde90e80ec1bac4b0d79` |
| `crane-figure-motion.webm` | 1440×810；30fps；75；2.500000s | 0.000 / 2.467s | 0–255 / 10 | 75/75 不同 | 3,523,046 / `82bca38a5f2a543c0571a4f1fe9a433b0fafc6a5fc6ce7782da8851a1515c026` |
| `crane-flock-motion.webm` | 1280×720；30fps；75；2.500000s | 0.000 / 2.467s | 0–255 / 10 | **74 authored frames + one terminal hold**：0–73 全不同，74 与 73 完全相同 | 9,696,197 / `147625e4002f422ffa6eef619f4d1973368d652b1badf786f6311fa046fe2516` |
| `aod-figure-motion.webm` | 1672×941；30fps；78；2.600000s | 0.000 / 2.567s | 0–255 / 10 | 78/78 不同 | 1,558,857 / `76e7a21f941a2d40e051bd72cb92e8fb1264e21a6765fbac7f8773d2849d8c9c` |
| `figure3-motion.webm` | 1280×720；30fps；78；2.600000s | 0.000 / 2.567s | 0–255 / 10 | 78/78 不同 | 1,187,579 / `610786ba0492be27e30690d321b8cf07c185413de95adccf0b64b964a0dcbaf7` |

### Corrected totals

| 采用项 | 文件数 | 字节数 | 说明 |
| --- | ---: | ---: | --- |
| Batch A v1 adopted WebP | 11 | 5,441,292（5.19 MiB） | `hero-back`、`hero-middle`、Figure2、TTG、Pattern、Crane 的十一项已采用 WebP；未包含未采纳 Hero poster。 |
| Batch A.1 canonical non-Hero WebM | 8 | 28,923,082（27.58 MiB） | 上表八个规范化视频。 |
| 最终 adopted 派生资产 | 19 | **34,364,374（32.77 MiB）** | 上两项合计；小于冻结的 80 MiB homepage-runtime-media 上限。完整 emit inventory 仍须在 Batch B build gate 复测。 |
| Hero 首次滚动前传输 | 4 | **1,369,187（1.31 MiB）** | `hero-back.webp` 437,030 + `hero-middle.webp` 179,718 + 保留 `middle1_depth.png` 663,805 + 保留 `figure-poster.jpg` 88,634；小于冻结的 4 MiB 上限。 |

因此，已冻结的资产候选总量和 Hero 首滚动前传输量均通过 80 MiB / 4 MiB 门槛；这不替代尚未启动的 Batch B 对最终 runtime/build 输出的复测。

### 端点诊断

下表以权威来源首/末呈现帧与输出首/末呈现帧的 alpha-composite 进行全局 SSIM，并单独计算 alpha SSIM；除 TTG 外合成背景为 `#ebe4d6`。TTG 用 `#202328`，且比较对象仅为获准的 `5f53013` visual/matte reference。它是资产级诊断，不替代 Batch B 的浏览器/CSS 连续性 gate。

| 输出 | 首帧 composite / alpha SSIM | 末帧 composite / alpha SSIM | 结论 |
| --- | ---: | ---: | --- |
| Figure2 left | 0.999863 / 0.999994 | 0.997899 / 0.999806 | 端点保留。 |
| Figure2 right | 0.999867 / 0.999994 | 0.997701 / 0.999828 | 端点保留。 |
| PH | 0.999641 / 0.999998 | 0.994996 / 0.999976 | 端点保留。 |
| TTG（对 `5f53013` reference） | 0.998902 / 0.998723 | 0.989772 / 0.997934 | 坐姿/站姿端点和 matte 均通过。 |
| Crane figure | 0.999329 / 0.999992 | 0.992441 / 0.995810 | motion root 与 matte authority 端点保留。 |
| Crane flock | 0.999987 / 0.999992 | 1.000000 / 1.000000 | 输出帧 73 对齐 source 帧 73；帧 74 是完全相同的 terminal hold。 |
| AOD | 0.999944 / 0.999997 | 0.986431 / 1.000000 | 端点保留。 |
| Figure3 | 0.999141 / 0.999958 | 0.994082 / 0.999999 | 端点保留。 |

### TTG alpha 合成审查

TTG 从用户提供的 H.264 高帧率源直接处理：以紫红色 hue score `clamp(min(R,B)/255 - G/255, 0, 1)` 建立 alpha，随后仅在半透明边缘做局部反混色和限域 magenta despill。没有人物全局 holdout、形态学闭运算或 alpha 填孔；发丝空隙的 alpha 保持由 hue key 得出的透明状态。为避免 VP9 4:2:0 在透明区域携带的紫红 plate 向边缘渗色，只有 `alpha <= 32` 的**透明 RGB**被归零；alpha 没有变化。

编码后与 `5f53013` 的首/中/末对照显示：首、末 alpha MAE 分别为 0.3137 与 0.5054；半透明边缘的紫红残留 p95 分别为 5、1、6（8-bit RGB score）。在深色背景的合成对照中未见衣服缺口、发丝填死、紫边或首尾状态漂移。TTG 只生成此一个正向物理 WebM，无 reverse 或 poster。

## 可复现生成命令

### WebP 转换

~~~sh
cwebp -quiet -mt -preset picture -m 6 -q 88 -sharp_yuv assets/back1.png -o assets/hero-back.webp
cwebp -quiet -mt -preset picture -m 6 -q 90 -alpha_q 100 -alpha_filter best -exact -sharp_yuv assets/middle1.png -o assets/hero-middle.webp
cwebp -quiet -mt -preset picture -m 6 -q 92 -alpha_q 100 -alpha_filter best -exact -sharp_yuv assets/figure2-middle-fresco-opaque-alpha.png -o assets/figure2-middle-building.webp
cwebp -quiet -mt -preset picture -m 6 -q 88 -sharp_yuv assets/figure2-cloud-source.png -o assets/figure2-cloud.webp
cwebp -quiet -mt -preset picture -m 6 -q 92 -alpha_q 100 -alpha_filter best -exact -sharp_yuv assets/arch2d-alpha.png -o assets/figure2-near-arch.webp
cwebp -quiet -mt -preset picture -m 6 -q 88 -sharp_yuv assets/ttg_bg.png -o assets/ttg-background.webp
cwebp -quiet -mt -preset picture -m 6 -q 92 -alpha_q 100 -alpha_filter best -exact -sharp_yuv assets/ttg_middle-composite.png -o assets/ttg-middle.webp
cwebp -quiet -mt -preset picture -m 6 -q 92 -alpha_q 100 -alpha_filter best -exact -sharp_yuv assets/ttg_front-composite.png -o assets/ttg-foreground.webp
cwebp -quiet -mt -preset photo -m 6 -q 82 -sharp_yuv assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png -o assets/pattern-background.webp
cwebp -quiet -mt -preset photo -m 6 -q 88 -sharp_yuv assets/aod-paper-bg.png -o assets/crane-paper.webp
~~~

### Figure2 far arch 烘焙

~~~sh
python3 - <<'PY'
from pathlib import Path
from PIL import Image, ImageChops, ImageEnhance

root = Path('assets')
size = (941, 1672)
mask = Image.open(root / 'arch2b-alpha.png').convert('RGBA').getchannel('A').resize(size, Image.Resampling.LANCZOS)

def sepia(rgb):
    r, g, b = rgb.split()
    return Image.merge('RGB', (
        r.point(lambda x: min(255, int(0.393*x + 0.769*x + 0.189*x))),
        g.point(lambda x: min(255, int(0.349*x + 0.686*x + 0.168*x))),
        b.point(lambda x: min(255, int(0.272*x + 0.534*x + 0.131*x))),
    ))

def layer(name, *, saturation, contrast, brightness, sepia_amount, opacity, grayscale=False):
    image = Image.open(root / name).convert('RGBA').resize(size, Image.Resampling.LANCZOS)
    rgb = image.convert('RGB')
    if grayscale:
        rgb = Image.merge('RGB', (rgb.convert('L'),) * 3)
    if sepia_amount:
        rgb = Image.blend(rgb, sepia(rgb), sepia_amount)
    rgb = ImageEnhance.Color(rgb).enhance(saturation)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    alpha = ImageChops.multiply(image.getchannel('A'), mask).point(lambda value: round(value * opacity))
    rgb.putalpha(alpha)
    return rgb

out = Image.new('RGBA', size, (0, 0, 0, 0))
out.alpha_composite(layer('figure2-front-white-source.png', saturation=0.62, contrast=1.02, brightness=1.08, sepia_amount=0.12, opacity=0.42))
out.alpha_composite(layer('figure2-front-color-source.png', saturation=0.88, contrast=0.94, brightness=1.02, sepia_amount=0.03, opacity=0.74))
out.alpha_composite(layer('figure2-front-white-source.png', saturation=0.0, contrast=1.34, brightness=1.04, sepia_amount=0.0, opacity=0.16, grayscale=True))
out.save('/tmp/tongye-figure2-far-arch.png')
PY
cwebp -quiet -mt -preset picture -m 6 -q 93 -alpha_q 100 -alpha_filter best -exact -sharp_yuv /tmp/tongye-figure2-far-arch.png -o assets/figure2-far-arch.webp
~~~

### Batch A.1 WebM：完整 source-to-output 生成链路

以下是产生本提交八个 WebM 的完整、可执行记录。它固定 source ref、每一个抽帧索引、缩放、Crane figure matte 合成、TTG hue-key/反混色/despill 阈值以及编码参数；从不读取 Batch A v1 候选 WebM。请把它复制到临时文件并从本 worktree 根目录执行；每次执行只会新建一个专属的 `/tmp/tongye-batch-a1-rebuild-*` 目录，绝不删除或覆盖任何可配置目录，也绝不写入 `assets/`。它先以完整 SHA-256 锁定已提交资产的交付身份，再把临时重建输出与 `assets/` 中对应文件逐项比较解码 RGBA framemd5、帧数、PTS、alpha 与 GOP；不把 WebM 容器 SHA 用作重建等价断言。依赖：FFmpeg 8.1、Python 3、OpenCV Python binding。

~~~sh
python3 - <<'PY'
from __future__ import annotations

import hashlib
import json
import math
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

ROOT = Path.cwd()
# A unique, dedicated /tmp directory is created by this process.  There is no
# environment override and no recursive deletion of an existing directory.
WORK = Path(tempfile.mkdtemp(prefix="tongye-batch-a1-rebuild-", dir="/tmp"))
SOURCES = WORK / "sources"
FRAMES = WORK / "frames"
OUT = WORK / "out"

D4 = "d4cab484e8f2d8656cf7c7cd0e19c015c7332702"
FIGURE3 = "262b17b8c07f2921d91b308d89586e2f7fd6c00a"
FLOCK = "ac46a868e13ca286ea3a6cdfad71c5b6e0ca37b1"
TTG_SOURCE = Path(
    "/Users/aitoshuu/Downloads/"
    "jimeng-2026-07-12-3173-人物从坐姿缓慢站立起来变成站姿并发出天问。"
    "背景高饱和纯紫红色#FF00FF，方便....mp4"
)

# These SHA-256 values identify the committed delivery only.  A WebM muxer
# writes a fresh container UID, so a rebuilt WebM must instead be validated by
# decoded-frame equivalence below.
COMMITTED_OUTPUT_SHA = {
    "figure2-left-motion.webm": "9e58707c959d9111af1f1ea2420855292a0449862dc68c93298efc48866597a4",
    "figure2-right-motion.webm": "7dbd981ccdda04a2ca0d598fdcc878151ec0c9b6a375249f38cc0ca30d2be737",
    "ph-figure-motion.webm": "49e23297a26fa0d6cc3862d6c4123e8090c521bafb3fe718de2ca4fc130169d6",
    "ttg-figure-motion.webm": "3b61c3cbcb88d8fa3ecb14faac694a4092676887a3b4cde90e80ec1bac4b0d79",
    "crane-figure-motion.webm": "82bca38a5f2a543c0571a4f1fe9a433b0fafc6a5fc6ce7782da8851a1515c026",
    "crane-flock-motion.webm": "147625e4002f422ffa6eef619f4d1973368d652b1badf786f6311fa046fe2516",
    "aod-figure-motion.webm": "76e7a21f941a2d40e051bd72cb92e8fb1264e21a6765fbac7f8773d2849d8c9c",
    "figure3-motion.webm": "610786ba0492be27e30690d321b8cf07c185413de95adccf0b64b964a0dcbaf7",
}

EXPECTED_OUTPUT_SPECS = {
    "figure2-left-motion.webm": (600, 1066, 78),
    "figure2-right-motion.webm": (600, 1066, 78),
    "ph-figure-motion.webm": (1672, 942, 46),
    "ttg-figure-motion.webm": (720, 1280, 75),
    "crane-figure-motion.webm": (1440, 810, 75),
    "crane-flock-motion.webm": (1280, 720, 75),
    "aod-figure-motion.webm": (1672, 941, 78),
    "figure3-motion.webm": (1280, 720, 78),
}

def run(*args: str) -> None:
    subprocess.run(args, cwd=ROOT, check=True)

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def capture(*args: str) -> str:
    result = subprocess.run(
        args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        text=True, check=True,
    )
    return result.stdout

def decoded_rgba_framemd5(path: Path) -> list[str]:
    output = capture(
        "ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(path),
        "-map", "0:v:0", "-an", "-fps_mode", "passthrough", "-pix_fmt", "rgba",
        "-f", "framemd5", "-",
    )
    return [line.strip() for line in output.splitlines() if line and not line.startswith("#")]

def frame_pts(records: list[str]) -> tuple[int, ...]:
    # framemd5 record fields are stream, DTS, PTS, duration, byte-size, MD5.
    return tuple(int(record.split(",")[2]) for record in records)

def video_stream(path: Path) -> dict[str, object]:
    payload = json.loads(capture(
        "ffprobe", "-v", "error",
        "-show_entries", "stream=codec_type,width,height,r_frame_rate,avg_frame_rate:stream_tags=alpha_mode",
        "-of", "json", str(path),
    ))
    streams = [stream for stream in payload.get("streams", []) if stream.get("codec_type") == "video"]
    assert len(streams) == 1, path
    return streams[0]

def decoded_alpha_range(path: Path) -> tuple[int, int]:
    process = subprocess.Popen(
        [
            "ffmpeg", "-v", "error", "-c:v", "libvpx-vp9", "-i", str(path),
            "-map", "0:v:0", "-an", "-fps_mode", "passthrough", "-pix_fmt", "rgba",
            "-f", "rawvideo", "-",
        ],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    assert process.stdout is not None
    low, high, tail = 255, 0, b""
    while chunk := process.stdout.read(4 * 1024 * 1024):
        data = tail + chunk
        aligned = len(data) - len(data) % 4
        if aligned:
            alpha = np.frombuffer(data[:aligned], dtype=np.uint8)[3::4]
            low, high = min(low, int(alpha.min())), max(high, int(alpha.max()))
        tail = data[aligned:]
    stderr = process.stderr.read() if process.stderr is not None else b""
    assert process.wait() == 0, stderr.decode(errors="replace")
    assert not tail and low <= high, path
    return low, high

def keyframe_positions(path: Path) -> tuple[int, ...]:
    payload = json.loads(capture(
        "ffprobe", "-v", "error", "-select_streams", "v:0", "-show_frames",
        "-show_entries", "frame=key_frame", "-of", "json", str(path),
    ))
    return tuple(
        index for index, frame in enumerate(payload.get("frames", []))
        if int(frame["key_frame"]) == 1
    )

def verify_rebuild(name: str) -> None:
    committed = ROOT / "assets" / name
    rebuilt = OUT / name
    # Full SHA remains the immutable identity of the delivered object only.
    assert sha256(committed) == COMMITTED_OUTPUT_SHA[name], committed

    committed_records = decoded_rgba_framemd5(committed)
    rebuilt_records = decoded_rgba_framemd5(rebuilt)
    assert rebuilt_records == committed_records, f"RGBA framemd5 mismatch: {name}"
    expected_width, expected_height, expected_frames = EXPECTED_OUTPUT_SPECS[name]
    assert len(committed_records) == len(rebuilt_records) == expected_frames, name
    assert frame_pts(rebuilt_records) == frame_pts(committed_records), f"PTS mismatch: {name}"

    committed_stream, rebuilt_stream = video_stream(committed), video_stream(rebuilt)
    for field in ("width", "height", "r_frame_rate", "avg_frame_rate"):
        assert rebuilt_stream.get(field) == committed_stream.get(field), f"{field} mismatch: {name}"
    assert (committed_stream["width"], committed_stream["height"]) == (expected_width, expected_height), name
    assert committed_stream.get("r_frame_rate") == committed_stream.get("avg_frame_rate") == "30/1", name
    assert committed_stream.get("tags", {}).get("ALPHA_MODE") == "1", name
    assert rebuilt_stream.get("tags", {}).get("ALPHA_MODE") == "1", name
    assert decoded_alpha_range(rebuilt) == decoded_alpha_range(committed) == (0, 255), name

    committed_keys, rebuilt_keys = keyframe_positions(committed), keyframe_positions(rebuilt)
    assert rebuilt_keys == committed_keys and committed_keys[0] == 0, f"GOP mismatch: {name}"
    assert all(next_key - key <= 8 for key, next_key in zip(committed_keys, committed_keys[1:])), name
    assert expected_frames - committed_keys[-1] <= 8, name
    print(f"PASS {name}: {expected_frames} RGBA frames, alpha 0..255, GOP {committed_keys}")

def half_up(value: float) -> int:
    return math.floor(value + 0.5)

def normalized_indices(source_frames: int, target_frames: int) -> list[int]:
    return [half_up(i * (source_frames - 1) / (target_frames - 1)) for i in range(target_frames)]

def materialize(ref: str, repo_path: str, expected_sha: str) -> Path:
    destination = SOURCES / Path(repo_path).name
    destination.parent.mkdir(parents=True, exist_ok=True)
    result = subprocess.run(
        ["git", "show", f"{ref}:{repo_path}"],
        cwd=ROOT,
        stdout=subprocess.PIPE,
        check=True,
    )
    destination.write_bytes(result.stdout)
    assert sha256(destination) == expected_sha, destination
    return destination

def select_to_png(
    source: Path,
    indices: list[int],
    destination: Path,
    *,
    force_vp9: bool,
    size: tuple[int, int] | None = None,
) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    expression = "+".join(f"eq(n\\,{index})" for index in indices)
    video_filter = f"select='{expression}'"
    if size:
        video_filter += f",scale={size[0]}:{size[1]}:flags=lanczos"
    command = ["ffmpeg", "-y", "-v", "error"]
    if force_vp9:
        command += ["-c:v", "libvpx-vp9"]
    command += [
        "-i", str(source),
        "-vf", video_filter,
        "-fps_mode", "passthrough",
        "-start_number", "0",
        str(destination / "frame-%03d.png"),
    ]
    run(*command)
    assert len(list(destination.glob("frame-*.png"))) == len(indices), source

def encode_alpha_30(frame_dir: Path, frame_count: int, output: Path) -> None:
    run(
        "ffmpeg", "-y", "-v", "error",
        "-framerate", "30", "-start_number", "0",
        "-i", str(frame_dir / "frame-%03d.png"),
        "-map", "0:v:0", "-an", "-frames:v", str(frame_count),
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-metadata:s:v:0", "alpha_mode=1",
        "-b:v", "0", "-crf", "26", "-g", "8", "-keyint_min", "8",
        "-row-mt", "1", "-tile-columns", "2", "-frame-parallel", "1",
        "-auto-alt-ref", "0", "-lag-in-frames", "0",
        "-deadline", "good", "-cpu-used", "2", "-tune", "ssim",
        str(output),
    )

def encode_crane_flock(frame_dir: Path, output: Path) -> None:
    run(
        "ffmpeg", "-y", "-v", "error",
        "-framerate", "30", "-start_number", "0",
        "-i", str(frame_dir / "frame-%03d.png"),
        "-map", "0:v:0", "-an", "-frames:v", "75",
        "-c:v", "libvpx-vp9", "-lossless", "1", "-pix_fmt", "yuva420p",
        "-metadata:s:v:0", "alpha_mode=1",
        "-g", "8", "-keyint_min", "8",
        "-row-mt", "1", "-tile-columns", "2", "-frame-parallel", "1",
        "-auto-alt-ref", "0", "-lag-in-frames", "0",
        "-deadline", "good", "-cpu-used", "2",
        str(output),
    )

def encode_crane_figure(rgb_dir: Path, alpha_dir: Path, output: Path) -> None:
    # Keep the RGB and alpha inputs separate until FFmpeg alphamerge.  This is
    # materially different from writing an OpenCV RGBA PNG and preserves the
    # committed VP9 alpha plane exactly after decode.
    run(
        "ffmpeg", "-y", "-v", "error",
        "-framerate", "30", "-start_number", "0",
        "-i", str(rgb_dir / "frame-%03d.png"),
        "-framerate", "30", "-start_number", "0",
        "-i", str(alpha_dir / "alpha-%03d.png"),
        "-filter_complex", "[0:v][1:v]alphamerge,format=yuva420p[v]",
        "-map", "[v]", "-an", "-frames:v", "75",
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-metadata:s:v:0", "alpha_mode=1",
        "-b:v", "0", "-crf", "26", "-g", "8", "-keyint_min", "8",
        "-row-mt", "1", "-tile-columns", "2", "-frame-parallel", "1",
        "-auto-alt-ref", "0", "-lag-in-frames", "0",
        "-deadline", "good", "-cpu-used", "2", "-tune", "ssim",
        str(output),
    )

def direct_master(
    name: str,
    source: Path,
    indices: list[int],
    output_name: str,
    *,
    size: tuple[int, int] | None = None,
) -> None:
    # Keep the direct decoded-frame path used for the committed masters.  In
    # particular, do not round-trip source RGBA through PNG before VP9.
    expression = "+".join(f"eq(n\\,{index})" for index in indices)
    video_filter = f"select='{expression}',setpts=N/(30*TB)"
    if size:
        video_filter += f",scale={size[0]}:{size[1]}:flags=lanczos"
    run(
        "ffmpeg", "-y", "-v", "error", "-c:v", "libvpx-vp9",
        "-i", str(source), "-vf", video_filter,
        "-map", "0:v:0", "-an", "-r", "30", "-frames:v", str(len(indices)),
        "-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p",
        "-metadata:s:v:0", "alpha_mode=1",
        "-b:v", "0", "-crf", "26", "-g", "8", "-keyint_min", "8",
        "-row-mt", "1", "-tile-columns", "2", "-frame-parallel", "1",
        "-auto-alt-ref", "0", "-lag-in-frames", "0",
        "-deadline", "good", "-cpu-used", "2", "-tune", "ssim",
        str(OUT / output_name),
    )

def read_rgb(path: Path) -> np.ndarray:
    image = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"cannot read {path}")
    return cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

def write_rgba(path: Path, rgba: np.ndarray) -> None:
    cv2.imwrite(str(path), cv2.cvtColor(rgba, cv2.COLOR_RGBA2BGRA))

def smoothstep(value: np.ndarray, low: float, high: float) -> np.ndarray:
    value = np.clip((value - low) / (high - low), 0, 1)
    return value * value * (3 - 2 * value)

SOURCES.mkdir(parents=True)
FRAMES.mkdir()
OUT.mkdir()

# Direct masters: progress-resampling only, no candidate input and no interpolation.
figure2_left = materialize(
    D4, "assets/figure2a-alpha-scrub.webm",
    "68f3526e6b77da084c883a4d4e8232b9fd44827d84edfc4ff5b612908b6a1ab9",
)
figure2_right = materialize(
    D4, "assets/figure2b-alpha-scrub.webm",
    "d0a0bc8267522de84e4364d99d527f07c48f56417705ddb929e4cb116a34278b",
)
ph = materialize(
    D4, "assets/ph_figure-alpha-scrub.webm",
    "8f5e36c4b3ffcdc21484021e0bc93c97edd146821dfd1bb05b3ac5d1a14c9d79",
)
aod = materialize(
    D4, "assets/aod_figure-alpha-front-scrub.webm",
    "239c2bb4e9d35d34ee2a454e1c6662b6ec4b2cf13f677dbb6c51b02413ed4a71",
)
figure3 = materialize(
    FIGURE3, "assets/figure3-alpha-scrub.webm",
    "8707a7808d2f0078eebc496891dfe529e8b81a82def73c24f94955293fcf3be3",
)
direct_master("figure2-left", figure2_left, normalized_indices(120, 78), "figure2-left-motion.webm")
direct_master("figure2-right", figure2_right, normalized_indices(120, 78), "figure2-right-motion.webm")
direct_master("ph", ph, normalized_indices(76, 46), "ph-figure-motion.webm")
direct_master("aod", aod, normalized_indices(151, 78), "aod-figure-motion.webm")
direct_master("figure3", figure3, normalized_indices(121, 78), "figure3-motion.webm", size=(1280, 720))

# TTG: exact 75 high-frame-rate source selections, direct magenta hue key,
# semi-transparent edge unmix, edge-only despill, and RGB-only transparent bleed guard.
assert sha256(TTG_SOURCE) == "d7ec5841483861540b17c1b334ea13ff0efed7df649be5101e2030bae05c9b6c"
ttg_source_dir = FRAMES / "ttg-source"
ttg_rgba_dir = FRAMES / "ttg-rgba"
ttg_indices = normalized_indices(240, 75)
select_to_png(TTG_SOURCE, ttg_indices, ttg_source_dir, force_vp9=False, size=(720, 1280))
ttg_rgba_dir.mkdir()
for index in range(75):
    rgb = read_rgb(ttg_source_dir / f"frame-{index:03d}.png").astype(np.float32)
    red, green, blue = (rgb[..., channel] for channel in range(3))
    magenta_score = np.clip(np.minimum(red, blue) / 255.0 - green / 255.0, 0, 1)
    alpha = 1 - smoothstep(magenta_score, 0.0, 0.50)
    plate = (
        np.median(rgb[magenta_score > 0.65], axis=0)
        if np.any(magenta_score > 0.65)
        else np.array([255, 0, 255], dtype=np.float32)
    )
    unmixed = (rgb - (1 - alpha[..., None]) * plate) / np.maximum(alpha[..., None], 0.10)
    anti_mix_edge = smoothstep(alpha, 0.06, 0.28) * (1 - smoothstep(alpha, 0.55, 0.86))
    rgb = rgb * (1 - 0.70 * anti_mix_edge[..., None]) + unmixed * (0.70 * anti_mix_edge[..., None])
    edge = smoothstep(alpha, 0.025, 0.11) * (1 - smoothstep(alpha, 0.72, 0.98))
    residual_magenta = smoothstep(magenta_score, 0.02, 0.10)
    despill_gate = (edge > 0.12) & (residual_magenta > 0.08)
    channel_limit = rgb[..., 1] + 4
    rgb[..., 0] = np.where(despill_gate, np.minimum(rgb[..., 0], channel_limit), rgb[..., 0])
    rgb[..., 2] = np.where(despill_gate, np.minimum(rgb[..., 2], channel_limit), rgb[..., 2])
    rgba = np.dstack((
        np.clip(rgb, 0, 255).astype(np.uint8),
        np.clip(alpha * 255, 0, 255).astype(np.uint8),
    ))
    # RGB-only guard against transparent-magenta VP9 4:2:0 bleed. It never changes alpha.
    rgba[rgba[..., 3] <= 32, :3] = 0
    write_rgba(ttg_rgba_dir / f"frame-{index:03d}.png", rgba)
encode_alpha_30(ttg_rgba_dir, 75, OUT / "ttg-figure-motion.webm")

# Crane figure: RGB comes from the 60fps motion root; the current 24fps transition
# supplies only alpha. RGB uses 75 unique normalized source indices 3..298.
crane_rgb_source = materialize(
    D4, "assets/crane-figure1.mp4",
    "3737b39cdcf826aef9ff0553acba3cf33350b649934798d56ca04196b576ab66",
)
crane_matte_source = materialize(
    D4, "assets/crane-figure1-transition.webm",
    "995c0737bda965643175ac4a83aa2fa92cdcffddfa7c69a0c59b884fefabbdec",
)
crane_rgb_dir = FRAMES / "crane-figure-rgb"
crane_alpha_dir = FRAMES / "crane-figure-alpha"
crane_rgb_indices = [half_up(3 + i * (298 - 3) / 74) for i in range(75)]
select_to_png(crane_rgb_source, crane_rgb_indices, crane_rgb_dir, force_vp9=False, size=(1440, 810))
crane_alpha_dir.mkdir()
run(
    "ffmpeg", "-y", "-v", "error", "-c:v", "libvpx-vp9",
    "-i", str(crane_matte_source), "-vf", "fps=30,alphaextract",
    "-start_number", "0", str(crane_alpha_dir / "alpha-%03d.png"),
)
assert len(list(crane_alpha_dir.glob("alpha-*.png"))) == 75
encode_crane_figure(crane_rgb_dir, crane_alpha_dir, OUT / "crane-figure-motion.webm")

# Crane flock: all 74 authored RGBA frames, then the one explicitly authorized hold.
flock_source = materialize(
    FLOCK, "assets/crane-figure2-transition.webm",
    "b96e13b85f85a70c0e71d2f9c11ac64aca1830fa6af3c1ee3b7272133cf09457",
)
flock_dir = FRAMES / "crane-flock"
select_to_png(flock_source, list(range(74)), flock_dir, force_vp9=True)
shutil.copyfile(flock_dir / "frame-073.png", flock_dir / "frame-074.png")
encode_crane_flock(flock_dir, OUT / "crane-flock-motion.webm")

for name in COMMITTED_OUTPUT_SHA:
    verify_rebuild(name)
print(f"PASS: eight temporary outputs are decode-equivalent to committed assets; retained evidence: {OUT}")
PY
~~~

Crane flock 使用 `-lossless 1` 的原因仅是让允许的 terminal hold 在实际 VP9 解码 RGBA 中也与第 74 个作者帧逐字节相同；其他 74 帧仍直接对应其 74 个权威作者帧。完整 WebM SHA-256 只用于锁定 `assets/` 中已提交交付物的身份；FFmpeg 会写入新的容器 UID，因此重建输出的等价性以逐帧 RGBA framemd5（其记录同时包含 PTS）、实际解码 alpha、帧数和 GOP 来判定。脚本使用 `mkdtemp(..., dir="/tmp")` 创建唯一目录，不接受目录覆盖变量，也不递归删除任何已有目录。

2026-07-14 已在本 worktree 执行一次隔离重建验证：八个临时输出均 **PASS**，逐帧 RGBA framemd5、帧数、PTS、`alpha_mode=1`、实际解码 alpha `0..255` 和 GOP 均与对应的已提交 `assets/` 文件一致。保留的临时证据目录为 `/tmp/tongye-batch-a1-rebuild-2tqfkhfw/out`；该执行没有写入或重编码仓库中的任何资产。

## 删除记录与恢复演练

### 归档位置

- 实际 archive root：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.git`
- 不可变 archive ref：`d4cab484e8f2d8656cf7c7cd0e19c015c7332702`
- 每个 archive path 都以 `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:<repository path>` 表示，可由 `git archive` 或 `git show` 恢复。
- 恢复演练：2026-07-14；用 `git archive --format=tar "$SOURCE_REF" -- <全部下表路径> | tar -xf - -C "$RESTORE_DIR"` 恢复到临时目录，再逐个与下表 SHA-256 比较；37/37 个一致；结果 **PASS**。

下面的 “Batch B 处置” 仅在 Batch B 的集成、浏览器 continuity gate、测试和 build 全部通过后才允许执行；本批没有执行任何删除。

| 原仓库路径 | SHA-256 | 精确 archive path | Batch B 处置 |
| --- | --- | --- | --- |
| `assets/back1.png` | `5c3c13892a3d70f329db588e489219da1f83ed4e3154cbfa7ae384e6cda5f652` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/back1.png` | 由 hero-back 替换后删除 |
| `assets/middle1.png` | `53aa7ae6f27de9ddbb3d1979df16f7ae33b644565995a2e7dcc632f3826df37c` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/middle1.png` | 由 hero-middle 替换后删除 |
| `assets/figure1.webm` | `14d881a16c0bef8f12526100aca1d014e0b8d38d8d09510e3c2aa43bb0030c35` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure1.webm` | **保留（Hero，不计划删除）** |
| `assets/figure-poster.jpg` | `973cc3bbb71140fc50ff72aef45ba9d10fc276b0adf94cb96c5d2a5ee4ccdc87` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure-poster.jpg` | **保留（Hero poster，不计划删除）** |
| `assets/figure2-cloud-source.png` | `e24827f8e626c2ff76d644971a73ca80df2a5bfe21b394df67cafce59ec60bb9` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2-cloud-source.png` | 由 figure2-cloud 替换后删除 |
| `assets/figure2-front-white-source.png` | `82fa2180049cffd7f4daf1c61a89cce8152599436b04109a10590b4b81988a42` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2-front-white-source.png` | 烘焙 far arch 后删除 |
| `assets/figure2-front-color-source.png` | `184e7e7e322c1d0d7b94fbe411160d475059dc2c3addd45be2f0eef6cbbbaef5` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2-front-color-source.png` | 烘焙 far arch 后删除 |
| `assets/arch2b-alpha.png` | `e73928f3e86b6bc35e21260e0faac1b9dc85d5ec9848466a3f3723e4514eb12f` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/arch2b-alpha.png` | far arch 遮罩烘焙后删除 |
| `assets/figure2-middle-fresco-opaque-alpha.png` | `f1dd18f086a6201a94ebe2147a76afaca26990d57c7e2aa8e604be365d939d27` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2-middle-fresco-opaque-alpha.png` | 由 middle-building 替换后删除 |
| `assets/arch2d-alpha.png` | `4ceaf5064aca5d129fe99265ff6c403f53a99e7e6b6fd10777afdffc877efbe5` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/arch2d-alpha.png` | 由 near-arch 替换后删除 |
| `assets/figure2a-alpha-scrub.webm` | `68f3526e6b77da084c883a4d4e8232b9fd44827d84edfc4ff5b612908b6a1ab9` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha-scrub.webm` | canonical left 源完成接入后删除 |
| `assets/figure2b-alpha-scrub.webm` | `d0a0bc8267522de84e4364d99d527f07c48f56417705ddb929e4cb116a34278b` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2b-alpha-scrub.webm` | canonical right 源完成接入后删除 |
| `assets/figure2a-alpha-auto.webm` | `0755dfb9f7e169862291344676c7ff7181600f7a0eb34cd02d7b15fc67f42196` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha-auto.webm` | canonical left 接入后删除 |
| `assets/figure2b-alpha-auto.webm` | `f6f49f7932fcf4abdeb57f5803938bb1ea2b096802cb956240d351f3fa4f8bf2` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2b-alpha-auto.webm` | canonical right 接入后删除 |
| `assets/figure2a-alpha.webm` | `4ba271417167ad59d46717ac98e840ea1706c679a1a63819d9851ab6f8ee44f8` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha.webm` | dedicated reverse 删除 |
| `assets/figure2b-alpha.webm` | `572f85b5edd9cd408d26ea5c72df0a8226e3b0d5f750b5b65a5656304d9d46ea` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2b-alpha.webm` | dedicated reverse 删除 |
| `assets/figure2a-alpha-reverse-lite.webm` | `f62c930d9e70cd2a8a7b0090b0e44026080c68744f9513077ae41618e7b8ab24` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha-reverse-lite.webm` | legacy dedicated reverse 删除 |
| `assets/figure2b-alpha-reverse-lite.webm` | `0d1b232ec52eaf427fdc5379628026bded1c91cfd0f48d575a08172d9da2be53` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2b-alpha-reverse-lite.webm` | legacy dedicated reverse 删除 |
| `assets/figure2a-alpha-reverse-lite-poster.png` | `795fbb291454712cf610cf2ec59ec8ad5df5629b73053e87784d51d96cae019c` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2a-alpha-reverse-lite-poster.png` | non-Hero poster 删除 |
| `assets/figure2b-alpha-reverse-lite-poster.png` | `c40a5c9ae27f5873f5e794db7beac3dcf64aff0aa3aaba61d6b6424def4b5f16` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure2b-alpha-reverse-lite-poster.png` | non-Hero poster 删除 |
| `assets/ph_figure-alpha-scrub.webm` | `8f5e36c4b3ffcdc21484021e0bc93c97edd146821dfd1bb05b3ac5d1a14c9d79` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ph_figure-alpha-scrub.webm` | canonical PH 接入后删除 |
| `assets/ph_figure-alpha-poster.png` | `f15ae9f9cb518bb20914be9be3151edaaf430b509e94bdb999c8adcc1da8bc25` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ph_figure-alpha-poster.png` | non-Hero poster 删除 |
| `assets/ttg_bg.png` | `ecb50ca88e4c60fd300acffe4ed8d2744c4c97e980bf8b04d9cb6a80dd74d8e8` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_bg.png` | 由 ttg-background 替换后删除 |
| `assets/ttg_middle-composite.png` | `839308070cc01fa5638756827cbaacc2aef6fb850401cf5ffd800376f40e7044` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_middle-composite.png` | 由 ttg-middle 替换后删除 |
| `assets/ttg_front-composite.png` | `4a92c9519f824e8a0a4e1758dbadbcaa79ef90094a8ac5ad80831adce467f2cc` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_front-composite.png` | 由 ttg-foreground 替换后删除 |
| `assets/ttg_front-alpha.png` | `b984b34692d09a9b54d724738eec238178ac7cdfc93c799c9e453022a49422d9` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_front-alpha.png` | 完全透明层删除 |
| `assets/ttg_figure-alpha-scrub.webm` | `3b4ab3087b665fcad3f16e4e2716d8693d5d2ffe5f37c41b12cb72c48a012b51` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-alpha-scrub.webm` | 历史/visual reference；**不是**本次 TTG 编码输入；任何后续处置仅可在 Batch B gate 后执行 |
| `assets/ttg_figure-alpha-scrub-reverse.webm` | `cc2836be61fb70a2047c7ab82e36f695f9db59938e4ef782342c928c4744e1c1` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-alpha-scrub-reverse.webm` | dedicated reverse 删除 |
| `assets/ttg_figure-alpha-scrub-poster.png` | `8a99d1e472a8955d6f2ed132bae1cc0294197b95b64ac7f4d404212efbaddead` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-alpha-scrub-poster.png` | non-Hero poster 删除 |
| `assets/ttg_figure-terminal.png` | `7bb072778718ec82cfd175268fb25e7f66598993f0f88e9792e6a1bc12cebe88` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-terminal.png` | terminal frame 删除 |
| `assets/crane-figure1-transition.webm` | `995c0737bda965643175ac4a83aa2fa92cdcffddfa7c69a0c59b884fefabbdec` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure1-transition.webm` | canonical Crane figure 接入后删除 |
| `assets/crane-figure2-transition.webm` | `9fa0642f52ddb0b349ff14ded1331f914df1227fae7885d4e81589d7a21aa585` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure2-transition.webm` | 历史 endpoint copy；本次 author source 是上表 `ac46a868…`；任何后续处置仅可在 Batch B gate 后执行 |
| `assets/aod-paper-bg.png` | `fb8078d8411ec1d8c99c01ebd125b994b16a2893fa961c2b0b3d81e3b97e5900` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod-paper-bg.png` | 由 crane-paper 替换后删除 |
| `assets/aod_figure-alpha-front-scrub.webm` | `239c2bb4e9d35d34ee2a454e1c6662b6ec4b2cf13f677dbb6c51b02413ed4a71` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod_figure-alpha-front-scrub.webm` | canonical AOD 接入后删除 |
| `assets/figure3-alpha-scrub.webm` | `801150fc0f9df54839f5b477357e88fd79fbd66b545b387390b171f85f1b6837` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure3-alpha-scrub.webm` | 历史 1280 derivative；本次 direct master 是上表 `262b17b8…`；任何后续处置仅可在 Batch B gate 后执行 |
| `assets/figure3-alpha-poster.png` | `5a5fef074b1aa59481ebfb4380a5cf0c3834d6bec0dfcc8eea2bab2a34fe0b0f` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure3-alpha-poster.png` | non-Hero poster 删除 |
| `assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png` | `067f518b3aa98bec7c59a7b9a0c13843dd629167fd91a2fb32ade5fcb0133b8d` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png` | 由 pattern-background 替换后删除 |

## Batch A.1 结束状态

八个规范化 non-Hero 文件已通过 cadence、alpha、GOP、端点和 RGBA 身份检查；恢复演练为 37/37 PASS。旧资产依旧完整，应用运行时未接入候选文件，Hero 与两项未采纳 Hero 实验输出均未改变。本报告随唯一的 Batch A.1 提交交付；`BATCH_A_FINAL_SHA` 在该提交创建后由交付记录锁定，避免为了把自引用 SHA 写回报告而产生第二个提交。

Batch B 未启动；没有 candidate/cutover tag，也没有删除动作。

## Batch B 提交 1：冻结集成输入

- `BATCH_A_FINAL_SHA`：`3f16dd0b3f136e699cb3cbd88c1241b4875d9393`
- `INTEGRATION_BASE_SHA`：`3b3ce381560be1cd92f043925cc4ec4120b5fcbb`
- 集成前 `assets/` 的 Git blob 总量：118 个文件、568,824,002 bytes（542.47 MiB）；该值按 `INTEGRATION_BASE_SHA` 的递归 `assets/` tree 计算。
- 本提交接入的 19 个最终派生资产总量：34,364,374 bytes（32.77 MiB）。它们只来自冻结的 `BATCH_A_FINAL_SHA`，没有合并资产工作树上的应用代码。
- Hero 的 `assets/figure1.webm` 与 `assets/figure-poster.jpg` 明确保留。`assets/hero-figure-scrub.webm` 与 `assets/hero-figure-scrub-poster.webp` 是未采纳实验输出，明确排除，未进入本 worktree。
- 本提交只包含以下 19 个派生资产和本报告；不包含 `app/`、CSS、manifest、测试或旧资产删除。

| 采用资产 | SHA-256 |
| --- | --- |
| `assets/hero-back.webp` | `0bd7475d5f3fb7c37c842aa804330ad641e774fad1509961003e82c8c391cc56` |
| `assets/hero-middle.webp` | `a0c7c15b2009824fed452e97c08966304e7b7a938c3a7046c0254522b2a1c186` |
| `assets/figure2-far-arch.webp` | `a60c540d65f439c5a7f2a47334eb71072038f830da92ae35c039c1c53837c2c9` |
| `assets/figure2-middle-building.webp` | `a4139acbc4ead2f0e8b0dd94924d152bf25fcbbcb0141ac167ea44e3a5ec4304` |
| `assets/figure2-cloud.webp` | `f8dab0443ac52d4525459d79b00cbc37b832eeae1e2dce014906a62e1f6ba871` |
| `assets/figure2-near-arch.webp` | `eba69d18ba7c5e6e742de899abd88f32a9bfc869f9728e08f19add57e4e79527` |
| `assets/ttg-background.webp` | `5a69aa815749b3efe67852af936de3dbbb706542aa307c4aab52d0130b37f019` |
| `assets/ttg-middle.webp` | `670dd3e66f8304bd1b48c2080f778679b03dd9c4aab24f1b9c214f59a88f4573` |
| `assets/ttg-foreground.webp` | `3e289cc9143d5a7110b87dcf67200e2f3768bbe7c7e24d08460769592066ca83` |
| `assets/pattern-background.webp` | `dd75fb9e7cb771059b28a9653a754081d02831891ec6309eb0d19cc2feab6e3b` |
| `assets/crane-paper.webp` | `a3b3775c4478c171f1e34c9cb252eba57d346af95e205fc3accbea17405f4fc3` |
| `assets/figure2-left-motion.webm` | `9e58707c959d9111af1f1ea2420855292a0449862dc68c93298efc48866597a4` |
| `assets/figure2-right-motion.webm` | `7dbd981ccdda04a2ca0d598fdcc878151ec0c9b6a375249f38cc0ca30d2be737` |
| `assets/ph-figure-motion.webm` | `49e23297a26fa0d6cc3862d6c4123e8090c521bafb3fe718de2ca4fc130169d6` |
| `assets/ttg-figure-motion.webm` | `3b61c3cbcb88d8fa3ecb14faac694a4092676887a3b4cde90e80ec1bac4b0d79` |
| `assets/crane-figure-motion.webm` | `82bca38a5f2a543c0571a4f1fe9a433b0fafc6a5fc6ce7782da8851a1515c026` |
| `assets/crane-flock-motion.webm` | `147625e4002f422ffa6eef619f4d1973368d652b1badf786f6311fa046fe2516` |
| `assets/aod-figure-motion.webm` | `76e7a21f941a2d40e051bd72cb92e8fb1264e21a6765fbac7f8773d2849d8c9c` |
| `assets/figure3-motion.webm` | `610786ba0492be27e30690d321b8cf07c185413de95adccf0b64b964a0dcbaf7` |

## Batch B：运行时切换、验证与删除

- 运行时切换提交：`f5a497909683e8771a4e2944b5e2d8e0dfa0433d`（`refactor(media): use canonical directional videos`）。
- 构建期清单校验：`app/scripts/verify-homepage-media-inventory.mjs`；它在每次 `pnpm run build` 中对 source SHA-256、最终 emit、38 文件数、9 个 WebM、11 个 WebP、80 MiB 和 4 MiB 门槛，以及八个 canonical non-Hero WebM 的 30fps/PTS 合同同时断言。
- Hero 仍使用 `assets/figure1.webm`、`assets/figure-poster.jpg`、`assets/middle1_depth.png`，保留 0.34–2.34s 双向 timeline seek。仅背景/中景替换为 WebP；冷启动 `preload="none"`，在 Hero→Pattern 段被接受后才由既有 driver 提升为 `auto`。
- Figure2、TTG 均已消除 reverse/poster/terminal 运行时 surface；正向 native-preferred，逆向在同一物理文件上以 timeline descending seek 运行。AOD、PH、Figure3、Crane 同样只使用八个 canonical non-Hero key；没有新增媒体框架或状态机。

### 阻断性验证结果

- `pnpm run verify:all`：**PASS**（lint、typecheck、87 个测试文件 / 555 个 Vitest、build）。默认 Harness contract regression：**45/45 PASS**。
- mobile Chromium 的 canonical TTG 连续性、同文件反向、decode failure 静态 composition、Hero 冷启动 transfer 和八个 non-Hero key 检查：**PASS**。
- mobile Chromium reverse presented-frame cadence：`app/e2e/r5-crane-media.spec.ts` 同时采样 Crane figure / flock 两个 canonical surface，要求每路至少 10 个 presented frames、8 个下降 media-time steps且 `fps >= REVERSE_PRESENTED_FPS_MIN = 20`；**PASS**。该测试以唯一的 `BATCH_B_CRANE_REVERSE_PRESENTED_CADENCE` 记录最终 `r5-release-manifest.json.sourceCommit`、host、浏览器版本、UA 和两路实测值，避免报告与交付文本保存两份不同 HEAD 的数值证据。
- focused mobile Chromium frame pacing：Figure2 timeline reverse、TTG forward/reverse、AOD reverse 和 horizontal Ink 均 PASS；aggregate long-frame ratio 低于固定 1% 门槛，桌面与移动端验收标准未放宽。动态实测值只由最终同 HEAD 的浏览器日志记录，不在报告中复制第二份。
- `dist/assets` 总量 68,496,831 bytes（低于既有 156 MiB 上限）；最大 lazy JS 65,505 bytes（不提高 64 KiB 预算）。

### Batch B 复审闭环

- Crane figure 与 flock 分别使用 2,500ms 媒体窗口；flock 在 segment 0s 启动，figure 在 0.5s 启动，并在 build 阶段并行准备当前方向的两路端点后才允许正向 native playback。
- TimelineVideoDriver 的 seek、decode、frame callback 和 media element 终态错误统一暂停媒体、清除 `timelineVideoFrameReady` 并写入 `timelineVideoStaticFallback`；后续成功呈现新帧时清除该标记。暂停 native playback 前保留其已经呈现的当前 playhead；方向 generation 切换只失效 readiness 身份，不丢弃最近呈现时间。若最近呈现帧与物理 playhead 到新目标的合计误差仍在既有 50ms 呈现容差内，则复用该帧，不再等待一个不会到来的额外 rVFC；TTG 同轮反向重复 5 次均未复现端点卡顿。
- Figure2 默认 Harness 只接受两个 canonical surface，并覆盖同文件反向 `currentTime` 下降；PH 与 Crane 默认 Harness 断言正向 native playback，Crane 另覆盖 flock 先行、figure 延迟 0.5s 和双路约 1× 播放。
- Hero 反向 build 先构造底层 timeline，再准备其最终媒体端点，避免 endpoint 初始化覆盖已经准备的 Hero 终帧；prepare 期间在 opacity 仍为 0 的 prev layer 上短暂恢复 `visibility`，结束后恢复原值，因此不改变 Hero 图层关系或产生闪帧。该顺序另以延迟 rVFC 单测和 10/10 浏览器压力回归固化。
- 仓库根目录的旧 standalone HTML/CSS/JS 不进入当前 React `dist`，其中残留的旧资产引用仅视为 legacy archive 边界，不属于本次 production runtime；若这些 standalone 页面仍需独立运行，应另立任务定义迁移或归档范围。精确 immutable archive ref 与恢复路径不受影响。

### 最终 emitted 首页媒体 inventory

构建生成的机器可读记录为 `dist/homepage-media-inventory.json`。以下是该记录的 38 个 source→emit 映射（bytes 为原始 emit bytes）：

| Source | Emit | Bytes |
| --- | --- | ---: |
| `assets/figure1.webm` | `assets/figure1-Chc1RWuX.webm` | 10,639,235 |
| `assets/figure2-left-motion.webm` | `assets/figure2-left-motion-JJmz6Fs0.webm` | 4,063,470 |
| `assets/figure2-right-motion.webm` | `assets/figure2-right-motion-DMHkgmJh.webm` | 3,578,198 |
| `assets/ph-figure-motion.webm` | `assets/ph-figure-motion-DQ400V_V.webm` | 2,646,001 |
| `assets/ttg-figure-motion.webm` | `assets/ttg-figure-motion-fAGAr69N.webm` | 2,669,734 |
| `assets/crane-figure-motion.webm` | `assets/crane-figure-motion-DrVxttkT.webm` | 3,523,046 |
| `assets/crane-flock-motion.webm` | `assets/crane-flock-motion-CgghftYn.webm` | 9,696,197 |
| `assets/aod-figure-motion.webm` | `assets/aod-figure-motion-Da7P6KQ3.webm` | 1,558,857 |
| `assets/figure3-motion.webm` | `assets/figure3-motion-D8txjQ6Z.webm` | 1,187,579 |
| `assets/hero-back.webp` | `assets/hero-back-D9rf9Ivf.webp` | 437,030 |
| `assets/hero-middle.webp` | `assets/hero-middle-CxRnxlwB.webp` | 179,718 |
| `assets/figure2-far-arch.webp` | `assets/figure2-far-arch-DT5EEAya.webp` | 181,708 |
| `assets/figure2-middle-building.webp` | `assets/figure2-middle-building-lkd1T3Ik.webp` | 1,539,882 |
| `assets/figure2-cloud.webp` | `assets/figure2-cloud-BaDKZfI1.webp` | 236,812 |
| `assets/figure2-near-arch.webp` | `assets/figure2-near-arch-C0_lyyDn.webp` | 1,185,246 |
| `assets/ttg-background.webp` | `assets/ttg-background-DSPwg2z4.webp` | 449,918 |
| `assets/ttg-middle.webp` | `assets/ttg-middle-sdQS0GTa.webp` | 146,618 |
| `assets/ttg-foreground.webp` | `assets/ttg-foreground-C_kIpIHy.webp` | 678,066 |
| `assets/pattern-background.webp` | `assets/pattern-background-Bf_oA-Dc.webp` | 69,168 |
| `assets/crane-paper.webp` | `assets/crane-paper-BIRxr82R.webp` | 337,126 |
| `assets/figure-poster.jpg` | `assets/figure-poster-XHkaEP0c.jpg` | 88,634 |
| `assets/middle1_depth.png` | `assets/middle1_depth-CUuYFALn.png` | 663,805 |
| `assets/back2.png` | `assets/back2-tsrlG6bj.png` | 3,052,022 |
| `assets/figure2-middle-depth.png` | `assets/figure2-middle-depth-DxiFJcLJ.png` | 1,116,044 |
| `assets/figure2-middle-window-mask.png` | `assets/figure2-middle-window-mask-BYKQYcI5.png` | 40,056 |
| `assets/aod_cloud-alpha.png` | `assets/aod_cloud-alpha-CdL74Qqw.png` | 2,208,068 |
| `assets/aod_sun-alpha.png` | `assets/aod_sun-alpha-DDJpoQ64.png` | 2,067,192 |
| `assets/ph_background.png` | `assets/ph_background-B8AFbTc0.png` | 3,192,753 |
| `assets/ph_front-alpha.png` | `assets/ph_front-alpha-ZP06u6f5.png` | 1,759,632 |
| `assets/crane1_cloud2-alpha.png` | `assets/crane1_cloud2-alpha-R6cgcOWU.png` | 607,050 |
| `assets/crane1_arch-alpha.png` | `assets/crane1_arch-alpha-q-8m4czR.png` | 734,734 |
| `assets/crane1_cloud1-alpha.png` | `assets/crane1_cloud1-alpha-BCXHGheM.png` | 810,398 |
| `assets/crane1_cloud-front2-alpha.png` | `assets/crane1_cloud-front2-alpha-X9NNNaiv.png` | 641,724 |
| `assets/patterns/alpha-layers/pattern-layer-alpha-02.png` | `assets/pattern-layer-alpha-02-s2xzqJ_f.png` | 996,262 |
| `assets/patterns/alpha-layers/pattern-layer-alpha-03.png` | `assets/pattern-layer-alpha-03-DyzahhpB.png` | 1,246,471 |
| `assets/patterns/alpha-layers/pattern-layer-alpha-04.png` | `assets/pattern-layer-alpha-04-j49CX8bI.png` | 1,937,385 |
| `assets/patterns/alpha-layers/pattern-layer-alpha-05.png` | `assets/pattern-layer-alpha-05-C1VaWwk4.png` | 705,441 |
| `assets/patterns/alpha-layers/pattern-layer-alpha-06.png` | `assets/pattern-layer-alpha-06-D3QiB1Yf.png` | 956,204 |

其中首页 runtime media 为 **67,827,484 bytes（64.69 MiB）**，低于 `HOMEPAGE_RUNTIME_MEDIA_BYTES_MAX = 80 MiB`；Hero 首次滚动前的图片/poster transfer 为 **1,369,187 bytes（1.31 MiB）**，低于 `HERO_BEFORE_FIRST_SCROLL_TRANSFER_MAX = 4 MiB`。清单严格为原 Hero WebM + 8 canonical non-Hero WebM（9 个）以及 11 个 adopted WebP；dist 中没有未采用 Hero 候选、dedicated reverse、non-Hero poster 或 TTG terminal PNG。

### Canonical non-Hero WebM PTS 合同

| Source | FPS | Frames | First PTS | Last PTS |
| --- | --- | ---: | ---: | ---: |
| `assets/figure2-left-motion.webm` | 30/1 | 78 | 0.000 | 2.567 |
| `assets/figure2-right-motion.webm` | 30/1 | 78 | 0.000 | 2.567 |
| `assets/ph-figure-motion.webm` | 30/1 | 46 | 0.000 | 1.500 |
| `assets/ttg-figure-motion.webm` | 30/1 | 75 | 0.000 | 2.467 |
| `assets/crane-figure-motion.webm` | 30/1 | 75 | 0.000 | 2.467 |
| `assets/crane-flock-motion.webm` | 30/1 | 75 | 0.000 | 2.467 |
| `assets/aod-figure-motion.webm` | 30/1 | 78 | 0.000 | 2.567 |
| `assets/figure3-motion.webm` | 30/1 | 78 | 0.000 | 2.567 |

### 删除结果

在上述门槛和浏览器 gates 全部通过后，已删除“删除记录与恢复演练”表中除 Hero 两个保留项外的 35 个被替代 source（包括 Figure2 dedicated reverse/poster、TTG forward/reverse/poster/terminal、旧 AOD/Crane/Figure3 视频和 construction source）。所有删除文件仍可由该表的 `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:<path>` immutable archive ref 恢复；`assets/figure1.webm`、`assets/figure-poster.jpg` 和 `assets/middle1_depth.png` 未删除。
