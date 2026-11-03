<script setup>
import { computed, ref } from 'vue'
import TerminalPane from './TerminalPane.vue'

const props = defineProps({ tab: Object, visible: Boolean })
const box = ref(null)

// Flatten the split tree into absolutely-positioned rects so panes never remount when splitting.
const layout = computed(() => {
  const leaves = [],
    gutters = []
  const walk = (n, r) => {
    if (n.type === 'leaf') return leaves.push({ leaf: n, r })
    const a = n.ratio
    if (n.dir === 'row') {
      walk(n.children[0], { x: r.x, y: r.y, w: r.w * a, h: r.h })
      walk(n.children[1], { x: r.x + r.w * a, y: r.y, w: r.w * (1 - a), h: r.h })
      gutters.push({
        n,
        r,
        style: { left: `calc(${r.x + r.w * a}% - 3px)`, top: r.y + '%', width: '6px', height: r.h + '%' },
      })
    } else {
      walk(n.children[0], { x: r.x, y: r.y, w: r.w, h: r.h * a })
      walk(n.children[1], { x: r.x, y: r.y + r.h * a, w: r.w, h: r.h * (1 - a) })
      gutters.push({
        n,
        r,
        style: { top: `calc(${r.y + r.h * a}% - 3px)`, left: r.x + '%', height: '6px', width: r.w + '%' },
      })
    }
  }
  walk(props.tab.root, { x: 0, y: 0, w: 100, h: 100 })
  return { leaves, gutters }
})

const dragging = ref(false)
function drag(e, g) {
  const rect = box.value.getBoundingClientRect()
  dragging.value = true
  const move = (ev) => {
    const pct =
      g.n.dir === 'row'
        ? (((ev.clientX - rect.left) / rect.width) * 100 - g.r.x) / g.r.w
        : (((ev.clientY - rect.top) / rect.height) * 100 - g.r.y) / g.r.h
    g.n.ratio = Math.min(0.9, Math.max(0.1, pct))
  }
  const up = () => {
    dragging.value = false
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}
</script>

<template>
  <div ref="box" class="tt" :class="{ dragging }">
    <div
      v-for="{ leaf, r } in layout.leaves"
      :key="leaf.id"
      class="slot"
      :style="{ left: r.x + '%', top: r.y + '%', width: r.w + '%', height: r.h + '%' }"
    >
      <TerminalPane :leaf="leaf" :tab="tab" :visible="visible" :split="layout.leaves.length > 1" />
    </div>
    <div
      v-for="(g, i) in layout.gutters"
      :key="i"
      class="gutter"
      :class="g.n.dir"
      :style="g.style"
      @mousedown.prevent="drag($event, g)"
    ></div>
  </div>
</template>

<style scoped>
.tt {
  position: absolute;
  inset: 0;
  background: var(--term-bg, #141821);
}
.tt.dragging {
  cursor: col-resize;
  user-select: none;
}
.tt.dragging .slot {
  pointer-events: none;
}
.slot {
  position: absolute;
}
.gutter {
  position: absolute;
  z-index: 5;
}
.gutter.row {
  cursor: col-resize;
}
.gutter.col {
  cursor: row-resize;
}
.gutter::after {
  content: '';
  position: absolute;
  background: var(--line);
}
.gutter.row::after {
  left: 2.5px;
  width: 1px;
  top: 0;
  bottom: 0;
}
.gutter.col::after {
  top: 2.5px;
  height: 1px;
  left: 0;
  right: 0;
}
.gutter:hover::after {
  background: var(--accent);
}
</style>
