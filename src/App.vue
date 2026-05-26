<script setup lang="ts">
defineOptions({
  name: 'TongyeApp'
})
</script>

<style lang="scss">
page {
  --c-obsidian: #080807;
  --c-ink: #121412;
  --c-ivory: #e9e2d2;
  --c-warm-gold: #c7b17a;
  --c-moss: #123a32;
  --c-ash: #7c817b;
  --c-silver: #b8b9b3;
  --c-clay: #8b5e45;
  --c-acid-dot: #c8f21c;

  --font-sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  --ease-cinematic: cubic-bezier(.16, 1, .3, 1);
  --ease-soft: cubic-bezier(.22, .61, .36, 1);
  --ease-sharp: cubic-bezier(.7, 0, .2, 1);

  --safe-top: 88rpx;
  --content-x: 48rpx;
  --header-height: 112rpx;
  --glass-border: rgba(233, 226, 210, .18);
  --glass-fill: rgba(18, 20, 18, .52);
}

page,
html,
body {
  min-height: 100%;
  margin: 0;
  background: var(--c-obsidian);
  color: var(--c-ivory);
  font-family: var(--font-sans);
}

uni-page-body {
  min-height: 100%;
  background: var(--c-obsidian);
}

view,
text,
button,
input,
textarea {
  box-sizing: border-box;
  font-family: var(--font-sans);
}

button {
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  line-height: 1;
}

</style>
