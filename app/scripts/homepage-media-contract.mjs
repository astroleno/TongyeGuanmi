export const alphaVideoSourcePairs = [
  {
    webm: 'assets/figure1.webm',
    hevc: 'assets/figure1-hevc-alpha.mp4'
  },
  {
    webm: 'assets/figure2-pair-motion.webm',
    hevc: 'assets/figure2-pair-motion-hevc-alpha.mp4'
  },
  {
    webm: 'assets/ph-figure-motion.webm',
    hevc: 'assets/ph-figure-motion-hevc-alpha.mp4'
  },
  {
    webm: 'assets/ttg-figure-motion.webm',
    hevc: 'assets/ttg-figure-motion-hevc-alpha.mp4'
  },
  {
    webm: 'assets/crane-figure-motion.webm',
    hevc: 'assets/crane-figure-motion-hevc-alpha.mp4'
  },
  {
    webm: 'assets/crane-flock-motion.webm',
    hevc: 'assets/crane-flock-motion-hevc-alpha.mp4'
  },
  {
    webm: 'assets/aod-figure-motion.webm',
    hevc: 'assets/aod-figure-motion-hevc-alpha.mp4'
  },
  {
    webm: 'assets/figure3-motion.webm',
    hevc: 'assets/figure3-motion-hevc-alpha.mp4'
  }
];

export const animationWebmSources = alphaVideoSourcePairs.map(({ webm }) => webm);
export const animationHevcAlphaSources = alphaVideoSourcePairs.map(({ hevc }) => hevc);
export const packedAlphaVideoSources = [
  'assets/figure1-rgb-alpha.mp4',
  'assets/figure2-pair-motion-rgb-alpha.mp4',
  'assets/aod-figure-motion-rgb-alpha.mp4'
];

export const portraitOnlyImageSources = [
  'assets/figure2-pair-opening.webp',
  'assets/figure2-phone-foreground-arch.webp',
  'assets/figure3-initial-paper.webp',
  'assets/figure3-terminal-paper.webp'
];

export const frozenHomepageMedia = [
  {
    source: 'assets/figure1.webm',
    category: 'hero-animation',
    bytes: 2019536,
    sha256: 'a472e2f9f62c9cdd447fe78664020e3dad7e0ce37900bb1c4b4e7fb1db379d70'
  },
  {
    source: 'assets/figure2-pair-motion.webm',
    category: 'animation-webm',
    bytes: 4940268,
    sha256: 'a87db407fd39f6977aa0b663ffd16e54929259e6651728997f7c072a33ffaa80'
  },
  {
    source: 'assets/ph-figure-motion.webm',
    category: 'animation-webm',
    bytes: 2824934,
    sha256: '678f76a40ccffe6cc2f337bfaa6fa66d4af4f6c70b2860695491cc5003147ab1'
  },
  {
    source: 'assets/ttg-figure-motion.webm',
    category: 'animation-webm',
    bytes: 2669734,
    sha256: '3b61c3cbcb88d8fa3ecb14faac694a4092676887a3b4cde90e80ec1bac4b0d79'
  },
  {
    source: 'assets/crane-figure-motion.webm',
    category: 'animation-webm',
    bytes: 3218940,
    sha256: 'a66a6778bda2a6c2e3fb5241a69ba4f1e4422a1638608f6cc5eba57e8f53c2b9'
  },
  {
    source: 'assets/crane-flock-motion.webm',
    category: 'animation-webm',
    bytes: 4429224,
    sha256: '708f45223f0cea5af23449d947050a86e5ec1ac959385561fa663ff44da5c37a'
  },
  {
    source: 'assets/aod-figure-motion.webm',
    category: 'animation-webm',
    bytes: 1558857,
    sha256: '76e7a21f941a2d40e051bd72cb92e8fb1264e21a6765fbac7f8773d2849d8c9c'
  },
  {
    source: 'assets/figure3-motion.webm',
    category: 'animation-webm',
    bytes: 1187579,
    sha256: '610786ba0492be27e30690d321b8cf07c185413de95adccf0b64b964a0dcbaf7'
  },
  {
    source: 'assets/figure1-hevc-alpha.mp4',
    category: 'hero-animation-hevc',
    bytes: 2699618,
    sha256: 'b16d04113a8b0a94c0157e7bd72eedec8c38017c42ace7ca4194da0985de2e3e'
  },
  {
    source: 'assets/figure2-pair-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 11002083,
    sha256: '334db166dca9295c149c6e37379960cb01f848686e8f747931da5268477a54e8'
  },
  {
    source: 'assets/ph-figure-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 3353930,
    sha256: '70dee9eb0bf02a98ea4982978026ea3e0f21ef2c10d9d6b6493876fc87083160'
  },
  {
    source: 'assets/ttg-figure-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 2954659,
    sha256: '9dbf4b0b6774d5c6e35f3c89d49a2c250d677b474993db9d7703bdacabc37f82'
  },
  {
    source: 'assets/crane-figure-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 4007599,
    sha256: '935480ecb5840d0e8eae4e2eb722e5731499c9d5d4857a759f0f40e623795386'
  },
  {
    source: 'assets/crane-flock-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 5386412,
    sha256: 'cb225ebced83d05b7b412fd59026f3839273019b340d922f302d3491d67acd4e'
  },
  {
    source: 'assets/aod-figure-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 2337183,
    sha256: '5a79e6fa139a487fd1576c11d9fba440cbdb5b457856ab6e5071ec3fd3e7a782'
  },
  {
    source: 'assets/figure3-motion-hevc-alpha.mp4',
    category: 'animation-hevc-alpha',
    bytes: 1737343,
    sha256: '18b4f5856063f2308d450a94a88d74d8fb1af5abf0966ad123c942987b550d7c'
  },
  {
    source: 'assets/figure1-rgb-alpha.mp4',
    category: 'portrait-packed-alpha',
    bytes: 1499360,
    sha256: '7548484ebd66a4ebe8a8f3a95647df66558dc9ac2b6e5f0d6fc8fa5dcc445b64'
  },
  {
    source: 'assets/figure2-pair-motion-rgb-alpha.mp4',
    category: 'portrait-packed-alpha',
    bytes: 8180603,
    sha256: 'd472ec0767f1d113ae8020ed232c763ba53c5821deb725660601172954bc63ef'
  },
  {
    source: 'assets/aod-figure-motion-rgb-alpha.mp4',
    category: 'portrait-packed-alpha',
    bytes: 2637788,
    sha256: 'a97af562c62e86fa4d3be9afe9537145ddeb05b67f556934985bc2dbf9f154ec'
  },
  {
    source: 'assets/hero-back.webp',
    category: 'adopted-webp',
    bytes: 437030,
    sha256: '0bd7475d5f3fb7c37c842aa804330ad641e774fad1509961003e82c8c391cc56'
  },
  {
    source: 'assets/hero-middle.webp',
    category: 'adopted-webp',
    bytes: 179718,
    sha256: 'a0c7c15b2009824fed452e97c08966304e7b7a938c3a7046c0254522b2a1c186'
  },
  {
    source: 'assets/figure2-far-arch.webp',
    category: 'adopted-webp',
    bytes: 181708,
    sha256: 'a60c540d65f439c5a7f2a47334eb71072038f830da92ae35c039c1c53837c2c9'
  },
  {
    source: 'assets/figure2-middle-building.webp',
    category: 'adopted-webp',
    bytes: 1539882,
    sha256: 'a4139acbc4ead2f0e8b0dd94924d152bf25fcbbcb0141ac167ea44e3a5ec4304'
  },
  {
    source: 'assets/figure2-cloud.webp',
    category: 'adopted-webp',
    bytes: 236812,
    sha256: 'f8dab0443ac52d4525459d79b00cbc37b832eeae1e2dce014906a62e1f6ba871'
  },
  {
    source: 'assets/figure2-near-arch.webp',
    category: 'adopted-webp',
    bytes: 1185246,
    sha256: 'eba69d18ba7c5e6e742de899abd88f32a9bfc869f9728e08f19add57e4e79527'
  },
  {
    source: 'assets/figure2-phone-foreground-arch.webp',
    category: 'portrait-adopted-webp',
    bytes: 697046,
    sha256: 'fdf7cc96d69a0e886493c07c29958bd1be2d2ae107405295313740fc862a94b5'
  },
  {
    source: 'assets/figure2-pair-opening.webp',
    category: 'portrait-adopted-webp',
    bytes: 137782,
    sha256: '3875fe03a65e46003a35e9267877dd8716df83c74248be229acbe3104714e118'
  },
  {
    source: 'assets/figure3-initial-paper.webp',
    category: 'portrait-adopted-webp',
    bytes: 4540,
    sha256: '98724a85700755b30d050746dc48764541704481c16a4c6ae91bc466eb1c1bdd'
  },
  {
    source: 'assets/figure3-terminal-paper.webp',
    category: 'portrait-adopted-webp',
    bytes: 436,
    sha256: 'a546aa40592810cf99aa38674f201dee771e295c81fd6ee1458205f17d16fbb2'
  },
  {
    source: 'assets/ttg-background.webp',
    category: 'adopted-webp',
    bytes: 449918,
    sha256: '5a69aa815749b3efe67852af936de3dbbb706542aa307c4aab52d0130b37f019'
  },
  {
    source: 'assets/ttg-middle.webp',
    category: 'adopted-webp',
    bytes: 146618,
    sha256: '670dd3e66f8304bd1b48c2080f778679b03dd9c4aab24f1b9c214f59a88f4573'
  },
  {
    source: 'assets/ttg-foreground.webp',
    category: 'adopted-webp',
    bytes: 678066,
    sha256: '3e289cc9143d5a7110b87dcf67200e2f3768bbe7c7e24d08460769592066ca83'
  },
  {
    source: 'assets/pattern-background.webp',
    category: 'adopted-webp',
    bytes: 69168,
    sha256: 'dd75fb9e7cb771059b28a9653a754081d02831891ec6309eb0d19cc2feab6e3b'
  },
  {
    source: 'assets/crane-paper.webp',
    category: 'adopted-webp',
    bytes: 337126,
    sha256: 'a3b3775c4478c171f1e34c9cb252eba57d346af95e205fc3accbea17405f4fc3'
  },
  {
    source: 'assets/middle1_depth.webp',
    category: 'semantic-lossless-webp',
    bytes: 425666,
    sha256: 'fc63bd5bd01af038defbb9aa4e894b4a7b77a71a858ad01d81a3f2d2ebdf39a7'
  },
  {
    source: 'assets/back2.webp',
    category: 'presentation-webp',
    bytes: 784596,
    sha256: 'fdfd4fbda1abb39c2384b467c8160151e7a47871e7fd4b5c98574c38519f6403'
  },
  {
    source: 'assets/figure2-middle-depth.webp',
    category: 'semantic-lossless-webp',
    bytes: 791940,
    sha256: '2a836e5139184d3f54bb095d8bcb4761092f277477856caf02e80378ec2c5c20'
  },
  {
    source: 'assets/figure2-depth-mask-atlas.webp',
    category: 'semantic-lossless-webp',
    bytes: 11184,
    sha256: '96a25cac86ba680719051a308415696d7eae26d4361bfdafbab3c1179cf493ab'
  },
  {
    source: 'assets/figure2-middle-window-mask.webp',
    category: 'semantic-lossless-webp',
    bytes: 1560,
    sha256: 'a582c9650c9ab3b2c8fa994e3f10057215896d4af950a97d0b3fd2553151be02'
  },
  {
    source: 'assets/aod_cloud-alpha.webp',
    category: 'presentation-webp',
    bytes: 406046,
    sha256: 'f2bfb1ea3fcfd0ee28e077ee7e14fb8fdeb0ac5d8641c1e11936faedd5fee57b'
  },
  {
    source: 'assets/aod_sun-alpha.webp',
    category: 'presentation-webp',
    bytes: 428132,
    sha256: '73f9e3264cc014289608430c8846341d67c6141bff89e9d51702e5942e43a32d'
  },
  {
    source: 'assets/ph_background.webp',
    category: 'presentation-webp',
    bytes: 525038,
    sha256: '3495ef864eba9851c6e08afaa78f777bad1698a77867ae7bd7f56961092ec004'
  },
  {
    source: 'assets/ph_front-alpha.webp',
    category: 'presentation-webp',
    bytes: 484606,
    sha256: '48b3cdade0bdf056ad1fa1fc0843d779138b2c50460947150bb3a8354fef3881'
  },
  {
    source: 'assets/crane1_cloud2-alpha.webp',
    category: 'presentation-webp',
    bytes: 90482,
    sha256: '2322aa7f37955143d03a174d86427893c665fda036098e2e3a0fa3a6d57220fe'
  },
  {
    source: 'assets/crane1_arch-alpha.webp',
    category: 'presentation-webp',
    bytes: 124118,
    sha256: '3a7704cd259387522ec8b214ba0769b15e5534bebaf8b2832f1b2af2966af506'
  },
  {
    source: 'assets/crane1_cloud1-alpha.webp',
    category: 'presentation-webp',
    bytes: 130682,
    sha256: '69d19155e25b505282a7365b679cb80c05112e8d0c0942e4d8761a58d9876e43'
  },
  {
    source: 'assets/crane1_cloud-front2-alpha.webp',
    category: 'presentation-webp',
    bytes: 91568,
    sha256: '1808401807194ad530b1fcfb9ad13f79cc969b6dc771f46d25232f58cdfc35ac'
  },
  {
    source: 'assets/patterns/alpha-layers/pattern-layer-alpha-02.webp',
    category: 'presentation-webp',
    bytes: 69422,
    sha256: 'f7b501e71a57c0020d81ceeb3378640f9cc8e9a53192338bd97cbb542bd8b835'
  },
  {
    source: 'assets/patterns/alpha-layers/pattern-layer-alpha-03.webp',
    category: 'presentation-webp',
    bytes: 139074,
    sha256: '6bba6fee43d98ee5c57d79acb57f1d59d4856c2290910c469f3bc2fc0adc856e'
  },
  {
    source: 'assets/patterns/alpha-layers/pattern-layer-alpha-04.webp',
    category: 'presentation-webp',
    bytes: 194858,
    sha256: '15a2ad1b19761b39f97a31a7a1ad60786d807bc2456f82725f3d480e2a4df699'
  },
  {
    source: 'assets/patterns/alpha-layers/pattern-layer-alpha-05.webp',
    category: 'presentation-webp',
    bytes: 131830,
    sha256: 'efac96a95f6dbba3f1fcbe39d205c9a795180cbd341d0bb047ec4ece3319c6f8'
  },
  {
    source: 'assets/patterns/alpha-layers/pattern-layer-alpha-06.webp',
    category: 'presentation-webp',
    bytes: 207136,
    sha256: '5779ebc5d3fec78c4e994db1317e71c33cb75732a347c6afed6b3e844b7d2458'
  },
  {
    source: 'assets/hero-figure-poster.webp',
    category: 'presentation-webp',
    bytes: 213550,
    sha256: '0998cbc66e989767ce2238d6d962c82907bd8f3d74e9eb4bfabe76506c324453'
  }
];

export const canonicalVideoContracts = [
  {
    source: 'assets/figure2-pair-motion.webm',
    fps: '30/1',
    frames: 156,
    duration: 5.2,
    firstPts: 0,
    lastPts: 5.167,
    keyframes: 13,
    maxGopFrames: 13
  },
  {
    source: 'assets/ph-figure-motion.webm',
    fps: '30/1',
    frames: 46,
    duration: 1.533,
    firstPts: 0,
    lastPts: 1.5,
    keyframes: 6,
    maxGopFrames: 8
  },
  {
    source: 'assets/ttg-figure-motion.webm',
    fps: '30/1',
    frames: 75,
    duration: 2.5,
    firstPts: 0,
    lastPts: 2.467,
    keyframes: 10,
    maxGopFrames: 8
  },
  {
    source: 'assets/crane-figure-motion.webm',
    fps: '30/1',
    frames: 75,
    duration: 2.5,
    firstPts: 0,
    lastPts: 2.467,
    keyframes: 10,
    maxGopFrames: 8
  },
  {
    source: 'assets/crane-flock-motion.webm',
    fps: '30/1',
    frames: 74,
    duration: 2.466,
    firstPts: 0,
    lastPts: 2.433,
    keyframes: 10,
    maxGopFrames: 8
  },
  {
    source: 'assets/aod-figure-motion.webm',
    fps: '30/1',
    frames: 78,
    duration: 2.6,
    firstPts: 0,
    lastPts: 2.567,
    keyframes: 10,
    maxGopFrames: 8
  },
  {
    source: 'assets/figure3-motion.webm',
    fps: '30/1',
    frames: 78,
    duration: 2.6,
    firstPts: 0,
    lastPts: 2.567,
    keyframes: 10,
    maxGopFrames: 8
  }
];
