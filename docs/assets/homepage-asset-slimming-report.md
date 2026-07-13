# 首页媒体瘦身：Batch A 资产报告

生成日期：2026-07-14
工作分支：`codex/homepage-asset-slimming-generation`
工作目录：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi-homepage-asset-slimming-generation`
候选资产源提交：`d4cab484e8f2d8656cf7c7cd0e19c015c7332702`（按本次任务要求从 `codex/react-refactor-r5-parity-cutover` 建立）
生成工具：FFmpeg 8.1（`libvpx-vp9`）、cwebp 1.6.0。

## 范围与边界

- 已生成所有计划中的候选 WebP、九个 canonical WebM，以及由最终 Hero WebM 首帧生成的 Hero poster。
- 没有修改 `app/` 下的源码、测试、imports、运行时 manifest 或播放逻辑。
- 没有接入任何候选资产，也没有删除、重命名或替换任何既有资产。
- Batch B 的 `INTEGRATION_BASE_SHA` 故意未记录；它仅在开始运行时接入时冻结。本报告的候选源锚定为上述 R5 提交。
- `middle1_depth.png`、`figure2-middle-depth.png`、`figure2-middle-window-mask.png`、`ph_background.png` 保持原状；AOD 和 Figure3 继续是 CSS 纸面，不生成纸面图。

## 候选输出

### 图像

| 候选输出 | 生成输入 | 输入字节 | 输出字节 | 尺寸 / alpha |
| --- | --- | ---: | ---: | --- |
| `assets/hero-back.webp` | `assets/back1.png` | 2,868,468 | 437,030 | 1586×992 / 否 |
| `assets/hero-middle.webp` | `assets/middle1.png` | 2,130,598 | 179,718 | 1672×941 / 是 |
| `assets/figure2-far-arch.webp` | white + color + `arch2b-alpha.png` 三层 | 4,935,270 | 181,708 | 941×1672 / 是 |
| `assets/figure2-middle-building.webp` | `assets/figure2-middle-fresco-opaque-alpha.png` | 11,902,513 | 1,539,882 | 3840×2160 / 是 |
| `assets/figure2-cloud.webp` | `assets/figure2-cloud-source.png` | 2,339,424 | 236,812 | 941×1672 / 否 |
| `assets/figure2-near-arch.webp` | `assets/arch2d-alpha.png` | 7,316,688 | 1,185,246 | 3840×2160 / 是 |
| `assets/ttg-background.webp` | `assets/ttg_bg.png` | 3,013,326 | 449,918 | 1672×941 / 否 |
| `assets/ttg-middle.webp` | `assets/ttg_middle-composite.png` | 873,590 | 146,618 | 1672×941 / 是 |
| `assets/ttg-foreground.webp` | `assets/ttg_front-composite.png` | 6,627,206 | 678,066 | 2016×3584 / 是 |
| `assets/pattern-background.webp` | `assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png` | 7,479,112 | 69,168 | 3840×2160 / 否 |
| `assets/crane-paper.webp` | `assets/aod-paper-bg.png` | 2,764,901 | 337,126 | 1672×941 / 否 |
| `assets/hero-figure-scrub-poster.webp` | 最终 `hero-figure-scrub.webm` 的第 0 帧 | — | 122,234 | 1080×1920 / 是 |

`figure2-far-arch.webp` 已把现行白色、彩色、relief 三次通过 `arch2b-alpha.png` 的遮罩烘焙为一个透明 WebP。它的目标是最终场景中的视觉连贯性，而非旧 blend stack 的逐像素数学等价。

### 视频

所有 WebM 都使用 `libvpx-vp9` 解码输入，以保留 VP9 alpha plane；FFmpeg 的默认 VP9 decoder 会忽略该平面。下表 alpha “是”表示同时满足 `alpha_mode=1` 且用 `libvpx-vp9` 解码后的 `alphaextract` 成功。

| 候选输出 | 源输入 | 输入 → 输出字节 | 规格 | Alpha / GOP | 首帧 RGB / alpha SSIM | 末帧 RGB / alpha SSIM |
| --- | --- | ---: | --- | --- | --- | --- |
| `hero-figure-scrub.webm` | `figure1.webm`，帧 9–56（原始 0.34–2.34s 区间） | 10,639,235 → 7,746,839 | 1080×1920, 24fps, 2.000s | 是 / all-intra，48 keyframes | 0.998046 / 0.999177 | 0.998197 / 0.999249 |
| `figure2-left-motion.webm` | `figure2a-alpha-scrub.webm` | 17,287,186 → 6,346,671 | 600×1066, 24fps, 5.000s | 是 / g=6，20 keyframes | 0.999732 / 0.999543 | 0.996841 / 0.992706 |
| `figure2-right-motion.webm` | `figure2b-alpha-scrub.webm` | 16,775,517 → 5,703,270 | 600×1066, 24fps, 5.000s | 是 / g=6，20 keyframes | 0.999611 / 0.999504 | 0.995284 / 0.993699 |
| `ph-figure-motion.webm` | `ph_figure-alpha-scrub.webm` | 15,302,466 → 3,989,365 | 1672×942, 30fps, 2.533s | 是 / g=8，10 keyframes | 0.999180 / 0.999832 | 0.994133 / 0.996649 |
| `ttg-figure-motion.webm` | `ttg_figure-alpha-scrub.webm` | 3,559,889 → 2,735,920 | 720×1280, 24fps, 2.500s | 是 / g=6，10 keyframes | 0.998071 / 0.999789 | 0.983942 / 0.995742 |
| `crane-figure-motion.webm` | `crane-figure1-transition.webm` | 5,637,648 → 3,243,641 | 1440×810, 24fps, 2.500s | 是 / g=6，10 keyframes | 0.999177 / 0.999353 | 0.970112 / 0.997101 |
| `crane-flock-motion.webm` | `crane-figure2-transition.webm` | 5,454,130 → 3,853,320 | 1280×720, 24fps, 2.500s | 是 / g=6，10 keyframes | 0.999457 / 0.999524 | 0.999974 / 0.995314 |
| `aod-figure-motion.webm` | `aod_figure-alpha-front-scrub.webm` | 6,477,276 → 2,506,537 | 1672×941, 30fps, 5.033s | 是 / g=8，19 keyframes | 0.999405 / 0.999586 | 0.943994 / 1.000000 |
| `figure3-motion.webm` | `figure3-alpha-scrub.webm` | 3,916,006 → 1,825,712 | 1280×720, 24fps, 5.042s | 是 / g=6，21 keyframes | 0.998786 / 0.999846 | 0.997218 / 1.000000 |

SSIM 对比将两帧在 `#ebe4d6` 背景上 alpha-composite 后测量 RGB，并单独测量 alpha；它是 Batch A 的编码保真度诊断，不替代 Batch B 中真实浏览器/CSS 栈的连续性验收。

## 字节测量

| 指标 | 结果 |
| --- | ---: |
| 映射源输入总量 | 137,300,449 bytes（130.94 MiB） |
| 全部候选输出总量（含 Hero poster） | 43,514,801 bytes（41.50 MiB） |
| 映射源到候选输出减量 | 93,785,648 bytes（68.3%） |
| 九个候选视频总量 | 37,951,275 bytes（36.19 MiB） |
| Hero 首次滚动前传输：`hero-back.webp` + `hero-middle.webp` + 保留 `middle1_depth.png` + poster | 1,402,787 bytes（1.34 MiB） |

候选媒体总量及 Hero 首次滚动前传输量均低于 Batch B 的 80 MiB 与 4 MiB 冻结阈值。由于本批没有修改显式 runtime media list，上述是候选资产测量而不是最终 build release 指标。反向呈现帧率属于 Batch B 的真机浏览器测量，本批不声称该门槛已完成。

## Figure2 与 TTG 的预检端点

下表仍是原始视频帧的 `#ebe4d6` alpha-composite 诊断；完整 gate 需要在 Batch B 使用冻结的 `INTEGRATION_BASE_SHA` 在真实 scene 背景和 CSS stack 中复核。

| 比较 | RGB SSIM | alpha SSIM |
| --- | ---: | ---: |
| Figure2 left：候选首帧 vs 当前 forward 首帧 | 0.976226 | 0.976414 |
| Figure2 left：候选末帧 vs 当前 forward 末帧 | 0.995989 | 0.989423 |
| Figure2 left：候选末帧 vs 当前 reverse 首帧 | 0.993145 | 0.986148 |
| Figure2 left：候选首帧 vs 当前 reverse 末帧 | 0.997088 | 0.995450 |
| Figure2 right：候选首帧 vs 当前 forward 首帧 | 0.966939 | 0.958301 |
| Figure2 right：候选末帧 vs 当前 forward 末帧 | 0.994514 | 0.989535 |
| Figure2 right：候选末帧 vs 当前 reverse 首帧 | 0.990651 | 0.985437 |
| Figure2 right：候选首帧 vs 当前 reverse 末帧 | 0.995929 | 0.993899 |
| TTG：候选首帧 vs 当前 forward 首帧 | 0.998071 | 0.999789 |
| TTG：候选末帧 vs 当前 forward 末帧 | 0.983942 | 0.995742 |
| TTG：候选末帧 vs 当前 reverse 首帧 | 0.983662 | 0.995567 |
| TTG：候选首帧 vs 当前 reverse 末帧 | 0.990560 | 0.994205 |

这些数值没有授权删除旧 TTG/Figure2 媒体；方向切换、端点闪烁和真实 alpha 合成连续性仍必须由 Batch B 阻断性 gate 判定。

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

### WebM 与 Hero poster

~~~sh
encode_alpha_24() {
  ffmpeg -loglevel error -y -c:v libvpx-vp9 -i "$1" -map 0:v:0 -an \
    -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 26 \
    -g 6 -keyint_min 6 -row-mt 1 -tile-columns 2 -frame-parallel 1 \
    -auto-alt-ref 0 -lag-in-frames 0 -deadline good -cpu-used 2 -tune ssim "$2"
}
encode_alpha_30() {
  ffmpeg -loglevel error -y -c:v libvpx-vp9 -i "$1" -map 0:v:0 -an \
    -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 26 \
    -g 8 -keyint_min 8 -row-mt 1 -tile-columns 2 -frame-parallel 1 \
    -auto-alt-ref 0 -lag-in-frames 0 -deadline good -cpu-used 2 -tune ssim "$2"
}

ffmpeg -loglevel error -y -c:v libvpx-vp9 -i assets/figure1.webm \
  -vf 'trim=start=0.34:end=2.34,setpts=PTS-STARTPTS' -an \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 26 \
  -g 1 -keyint_min 1 -row-mt 1 -tile-columns 2 -frame-parallel 1 \
  -auto-alt-ref 0 -lag-in-frames 0 -deadline good -cpu-used 2 -tune ssim \
  assets/hero-figure-scrub.webm
encode_alpha_24 assets/figure2a-alpha-scrub.webm assets/figure2-left-motion.webm
encode_alpha_24 assets/figure2b-alpha-scrub.webm assets/figure2-right-motion.webm
encode_alpha_30 assets/ph_figure-alpha-scrub.webm assets/ph-figure-motion.webm
encode_alpha_24 assets/ttg_figure-alpha-scrub.webm assets/ttg-figure-motion.webm
encode_alpha_24 assets/crane-figure1-transition.webm assets/crane-figure-motion.webm
encode_alpha_24 assets/crane-figure2-transition.webm assets/crane-flock-motion.webm
encode_alpha_30 assets/aod_figure-alpha-front-scrub.webm assets/aod-figure-motion.webm
encode_alpha_24 assets/figure3-alpha-scrub.webm assets/figure3-motion.webm

ffmpeg -loglevel error -y -c:v libvpx-vp9 -i assets/hero-figure-scrub.webm -frames:v 1 -pix_fmt rgba /tmp/tongye-hero-figure-scrub-poster.png
cwebp -quiet -mt -preset picture -m 6 -q 88 -alpha_q 100 -alpha_filter best -exact -sharp_yuv /tmp/tongye-hero-figure-scrub-poster.png -o assets/hero-figure-scrub-poster.webp
~~~

## 删除记录与恢复演练

### 归档位置

- 实际 archive root：`/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.git`
- 不可变 archive ref：`d4cab484e8f2d8656cf7c7cd0e19c015c7332702`
- 每个 archive path 都以 `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:<repository path>` 表示，可由 `git archive` 或 `git show` 恢复。
- 恢复演练：2026-07-14；用 `git archive --format=tar "$SOURCE_REF" -- <全部下表路径> | tar -xf - -C "$RESTORE_DIR"` 恢复到临时目录；37/37 个 SHA-256 一致；结果 **PASS**。

下面的 “Batch B 处置” 仅在 Batch B 的集成、浏览器 continuity gate、测试和 build 全部通过后才允许执行；本批没有执行任何删除。

| 原仓库路径 | SHA-256 | 精确 archive path | Batch B 处置 |
| --- | --- | --- | --- |
| `assets/back1.png` | `5c3c13892a3d70f329db588e489219da1f83ed4e3154cbfa7ae384e6cda5f652` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/back1.png` | 由 hero-back 替换后删除 |
| `assets/middle1.png` | `53aa7ae6f27de9ddbb3d1979df16f7ae33b644565995a2e7dcc632f3826df37c` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/middle1.png` | 由 hero-middle 替换后删除 |
| `assets/figure1.webm` | `14d881a16c0bef8f12526100aca1d014e0b8d38d8d09510e3c2aa43bb0030c35` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure1.webm` | 由 Hero canonical video 替换后删除 |
| `assets/figure-poster.jpg` | `973cc3bbb71140fc50ff72aef45ba9d10fc276b0adf94cb96c5d2a5ee4ccdc87` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure-poster.jpg` | 由生成 Hero poster 替换后删除 |
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
| `assets/ttg_figure-alpha-scrub.webm` | `3b4ab3087b665fcad3f16e4e2716d8693d5d2ffe5f37c41b12cb72c48a012b51` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-alpha-scrub.webm` | canonical TTG 接入后删除 |
| `assets/ttg_figure-alpha-scrub-reverse.webm` | `cc2836be61fb70a2047c7ab82e36f695f9db59938e4ef782342c928c4744e1c1` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-alpha-scrub-reverse.webm` | dedicated reverse 删除 |
| `assets/ttg_figure-alpha-scrub-poster.png` | `8a99d1e472a8955d6f2ed132bae1cc0294197b95b64ac7f4d404212efbaddead` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-alpha-scrub-poster.png` | non-Hero poster 删除 |
| `assets/ttg_figure-terminal.png` | `7bb072778718ec82cfd175268fb25e7f66598993f0f88e9792e6a1bc12cebe88` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/ttg_figure-terminal.png` | terminal frame 删除 |
| `assets/crane-figure1-transition.webm` | `995c0737bda965643175ac4a83aa2fa92cdcffddfa7c69a0c59b884fefabbdec` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure1-transition.webm` | canonical Crane figure 接入后删除 |
| `assets/crane-figure2-transition.webm` | `9fa0642f52ddb0b349ff14ded1331f914df1227fae7885d4e81589d7a21aa585` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/crane-figure2-transition.webm` | canonical Crane flock 接入后删除 |
| `assets/aod-paper-bg.png` | `fb8078d8411ec1d8c99c01ebd125b994b16a2893fa961c2b0b3d81e3b97e5900` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod-paper-bg.png` | 由 crane-paper 替换后删除 |
| `assets/aod_figure-alpha-front-scrub.webm` | `239c2bb4e9d35d34ee2a454e1c6662b6ec4b2cf13f677dbb6c51b02413ed4a71` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/aod_figure-alpha-front-scrub.webm` | canonical AOD 接入后删除 |
| `assets/figure3-alpha-scrub.webm` | `801150fc0f9df54839f5b477357e88fd79fbd66b545b387390b171f85f1b6837` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure3-alpha-scrub.webm` | canonical Figure3 接入后删除 |
| `assets/figure3-alpha-poster.png` | `5a5fef074b1aa59481ebfb4380a5cf0c3834d6bec0dfcc8eea2bab2a34fe0b0f` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/figure3-alpha-poster.png` | non-Hero poster 删除 |
| `assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png` | `067f518b3aa98bec7c59a7b9a0c13843dd629167fd91a2fb32ade5fcb0133b8d` | `d4cab484e8f2d8656cf7c7cd0e19c015c7332702:assets/patterns/backgrounds/aged-mottled-background-16x9-4k.png` | 由 pattern-background 替换后删除 |

## Batch A 结束状态

候选资产、可重现命令、完整删除记录、源 SHA-256 和通过的恢复演练均已存在。旧资产依旧完整，应用运行时未接入候选文件；下一阶段只能从包含后续视觉修复的独立 integration worktree 开始。
