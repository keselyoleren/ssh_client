<script setup>
// The K-Shell mark (same artwork as src-tauri/icons/icon.svg, cropped to the tile).
defineProps({ size: { type: Number, default: 26 } })
</script>

<template>
  <svg :width="size" :height="size" viewBox="100 100 824 824" aria-label="K-Shell" role="img">
    <rect x="100" y="100" width="824" height="824" rx="186" fill="#F2E9D8" />
    <g transform="translate(-46 4) rotate(-2 512 512)" fill="#24222B">
      <path d="M300 296 L404 300 L400 728 L296 724 Z" />
      <path d="M398 462 L566 294 L672 300 L400 600 Z" />
      <path d="M400 470 L694 724 L580 728 L398 606 Z" />
      <rect x="714" y="668" width="118" height="58" rx="9" fill="#D9622B" />
    </g>
  </svg>
</template>
