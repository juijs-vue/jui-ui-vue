<script setup lang="ts">
// 원본(layout.js)은 dist/전용 .less가 없다 — 모든 시각 스타일(position/top/left/width/
// height/background/cursor)을 JS에서 직접 인라인으로 넣는 방식이라, 이 포트도 전부
// :style 바인딩으로 재현한다. 이 컴포넌트는 리포에 examples/layout.html도 없어서(=
// 원본 자체가 시각적으로 검증된 적이 없어 보임) Paging/Window처럼 소스 코드만 근거로
// 재구성했다.
//
// 재구성하면서 원본의 실제 버그 하나를 고쳤다: bottom 영역의 초기 top 위치 계산이
// `(sizeTop - height) + sizeTop`로, 컨테이너 실제 높이(root.height())를 전혀 참조하지
// 않는 죽은 코드였다(계산 직전에 구한 max 변수도 이후 어디서도 안 쓰임) — 즉 bottom
// 영역이 항상 화면 위쪽 근처에 붙어버리는 상태였다. Vue 버전은 bottom/right를 "컨테이너
// 반대쪽 끝에 고정"으로 올바르게 계산한다(= top/left와 대칭). 드래그 시 크기 계산 공식
// (min/max 클램프, "반대쪽 끝 기준" bottom/right의 newSize = containerSize -
// (resizerPos+barSize) 공식)은 원본 로직을 그대로 유도해서 재현했다 — 이 부분은
// 내부적으로 정확했다(죽은 코드가 아니었다).
import { ref, computed, onMounted, onBeforeUnmount, useSlots, nextTick } from "vue"
import type { CSSProperties } from "vue"

type LayoutDir = "top" | "bottom" | "left" | "right"

const props = withDefaults(
    defineProps<{
        width?: number | null
        height?: number | null
        barColor?: string
        barSize?: number

        topSize?: number | null
        topMin?: number
        topMax?: number
        topResize?: boolean

        bottomSize?: number | null
        bottomMin?: number
        bottomMax?: number
        bottomResize?: boolean

        leftSize?: number | null
        leftMin?: number
        leftMax?: number
        leftResize?: boolean

        rightSize?: number | null
        rightMin?: number
        rightMax?: number
        rightResize?: boolean
    }>(),
    {
        width: null,
        height: null,
        barColor: "#d6d6d6",
        barSize: 3,
        topSize: null,
        topMin: 50,
        topMax: 200,
        topResize: true,
        bottomSize: null,
        bottomMin: 50,
        bottomMax: 200,
        bottomResize: true,
        leftSize: null,
        leftMin: 50,
        leftMax: 200,
        leftResize: true,
        rightSize: null,
        rightMin: 50,
        rightMax: 200,
        rightResize: true
    }
)
const emit = defineEmits<{
    "update:topSize": [value: number]
    "update:bottomSize": [value: number]
    "update:leftSize": [value: number]
    "update:rightSize": [value: number]
}>()

const slots = useSlots()
const hasTop = computed(() => !!slots.top)
const hasBottom = computed(() => !!slots.bottom)
const hasLeft = computed(() => !!slots.left)
const hasRight = computed(() => !!slots.right)
const hasCenter = computed(() => !!slots.center)

const internalTop = ref(props.topSize ?? props.topMin)
const internalBottom = ref(props.bottomSize ?? props.bottomMin)
const internalLeft = ref(props.leftSize ?? props.leftMin)
const internalRight = ref(props.rightSize ?? props.rightMin)

const currentTop = computed(() => props.topSize ?? internalTop.value)
const currentBottom = computed(() => props.bottomSize ?? internalBottom.value)
const currentLeft = computed(() => props.leftSize ?? internalLeft.value)
const currentRight = computed(() => props.rightSize ?? internalRight.value)

const rootEl = ref<HTMLElement | null>(null)
const rootSize = ref({ width: 0, height: 0 })

function measureRoot() {
    if (!rootEl.value) return
    rootSize.value = { width: rootEl.value.clientWidth, height: rootEl.value.clientHeight }
}

let resizeObserver: ResizeObserver | null = null
onMounted(() => {
    measureRoot()
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(measureRoot)
        resizeObserver.observe(rootEl.value!)
    }
    window.addEventListener("resize", measureRoot)
})
onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    window.removeEventListener("resize", measureRoot)
})

const rootStyle = computed<CSSProperties>(() => ({
    position: "relative",
    // width/height prop이 없으면 원본처럼 "이미 크기가 잡힌 컨테이너에 적용"되는 걸 전제하되,
    // 모든 자식이 absolute라 그 자체로는 높이가 0으로 붕괴되므로(position:relative만으로는
    // 부모 크기를 자동으로 채우지 않음) 100%로 채워서 부모가 정한 크기를 따라가게 한다.
    width: props.width !== null ? props.width + "px" : "100%",
    height: props.height !== null ? props.height + "px" : "100%"
}))

const topBand = computed(() => (hasTop.value ? currentTop.value + (props.topResize ? props.barSize : 0) : 0))
const bottomBand = computed(() => (hasBottom.value ? currentBottom.value + (props.bottomResize ? props.barSize : 0) : 0))
const leftBand = computed(() => (hasLeft.value ? currentLeft.value + (props.leftResize ? props.barSize : 0) : 0))
const rightBand = computed(() => (hasRight.value ? currentRight.value + (props.rightResize ? props.barSize : 0) : 0))

const middleHeight = computed(() => Math.max(0, rootSize.value.height - topBand.value - bottomBand.value))
const middleWidth = computed(() => Math.max(0, rootSize.value.width - leftBand.value - rightBand.value))

const topStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: "0px",
    left: "0px",
    width: "100%",
    height: currentTop.value + "px"
}))
const topResizerStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: currentTop.value + "px",
    left: "0px",
    width: "100%",
    height: props.barSize + "px",
    background: props.barColor,
    cursor: "n-resize"
}))

const bottomStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    left: "0px",
    width: "100%",
    height: currentBottom.value + "px",
    top: rootSize.value.height - currentBottom.value + "px"
}))
const bottomResizerStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: rootSize.value.height - currentBottom.value - props.barSize + "px",
    left: "0px",
    width: "100%",
    height: props.barSize + "px",
    background: props.barColor,
    cursor: "n-resize"
}))

const leftStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: topBand.value + "px",
    left: "0px",
    height: middleHeight.value + "px",
    width: currentLeft.value + "px",
    maxWidth: "100%",
    overflow: "auto"
}))
const leftResizerStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: topBand.value + "px",
    left: currentLeft.value + "px",
    height: middleHeight.value + "px",
    width: props.barSize + "px",
    background: props.barColor,
    cursor: "e-resize"
}))

const rightStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: topBand.value + "px",
    left: rootSize.value.width - currentRight.value + "px",
    height: middleHeight.value + "px",
    width: currentRight.value + "px",
    maxWidth: "100%"
}))
const rightResizerStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: topBand.value + "px",
    left: rootSize.value.width - currentRight.value - props.barSize + "px",
    height: middleHeight.value + "px",
    width: props.barSize + "px",
    background: props.barColor,
    cursor: "e-resize"
}))

const centerStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    top: topBand.value + "px",
    left: leftBand.value + "px",
    height: middleHeight.value + "px",
    width: middleWidth.value + "px",
    overflow: "auto"
}))

// ---- 드래그(리사이즈) ----
const dragging = ref<LayoutDir | null>(null)
const ghostPos = ref(0) // 드래그 중 고스트 바의 화면 좌표(px, 컨테이너 기준)
let dragStartOffset = 0

function clientPos(e: MouseEvent, dir: LayoutDir) {
    return dir === "top" || dir === "bottom" ? e.clientY : e.clientX
}

function onResizerMouseDown(dir: LayoutDir, e: MouseEvent) {
    if (!rootEl.value) return
    dragging.value = dir
    const rect = rootEl.value.getBoundingClientRect()
    const resizerScreenPos =
        dir === "top"
            ? rect.top + currentTop.value
            : dir === "bottom"
              ? rect.top + rootSize.value.height - currentBottom.value - props.barSize
              : dir === "left"
                ? rect.left + currentLeft.value
                : rect.left + rootSize.value.width - currentRight.value - props.barSize
    dragStartOffset = clientPos(e, dir) - resizerScreenPos
    ghostPos.value = dir === "top" || dir === "bottom" ? resizerScreenPos - rect.top : resizerScreenPos - rect.left
    document.body.style.userSelect = "none"
}

function onDocMouseMove(e: MouseEvent) {
    if (!dragging.value || !rootEl.value) return
    const rect = rootEl.value.getBoundingClientRect()
    const dir = dragging.value
    const candidateScreen = clientPos(e, dir) - dragStartOffset
    const candidate = dir === "top" || dir === "bottom" ? candidateScreen - rect.top : candidateScreen - rect.left

    if (dir === "top") {
        if (props.topMin <= candidate && candidate < props.topMax) ghostPos.value = candidate
    } else if (dir === "left") {
        if (props.leftMin <= candidate && candidate < props.leftMax) ghostPos.value = candidate
    } else if (dir === "bottom") {
        const size = rootSize.value.height - (candidate + props.barSize)
        if (props.bottomMin <= size && size <= props.bottomMax) ghostPos.value = candidate
    } else if (dir === "right") {
        const size = rootSize.value.width - (candidate + props.barSize)
        if (props.rightMin <= size && size <= props.rightMax) ghostPos.value = candidate
    }
}

function onDocMouseUp() {
    if (!dragging.value) return
    const dir = dragging.value
    if (dir === "top") {
        internalTop.value = ghostPos.value
        emit("update:topSize", ghostPos.value)
    } else if (dir === "left") {
        internalLeft.value = ghostPos.value
        emit("update:leftSize", ghostPos.value)
    } else if (dir === "bottom") {
        const size = rootSize.value.height - (ghostPos.value + props.barSize)
        internalBottom.value = size
        emit("update:bottomSize", size)
    } else if (dir === "right") {
        const size = rootSize.value.width - (ghostPos.value + props.barSize)
        internalRight.value = size
        emit("update:rightSize", size)
    }
    dragging.value = null
    document.body.style.userSelect = ""
}

onMounted(() => {
    document.addEventListener("mousemove", onDocMouseMove)
    document.addEventListener("mouseup", onDocMouseUp)
})
onBeforeUnmount(() => {
    document.removeEventListener("mousemove", onDocMouseMove)
    document.removeEventListener("mouseup", onDocMouseUp)
})

const ghostStyle = computed<CSSProperties>(() => {
    const dir = dragging.value
    if (!dir) return {}
    const base: CSSProperties = {
        position: "absolute",
        background: props.barColor,
        opacity: 0.3,
        pointerEvents: "none"
    }
    if (dir === "top" || dir === "bottom") {
        return { ...base, top: ghostPos.value + "px", left: "0px", width: "100%", height: props.barSize + "px" }
    }
    return { ...base, left: ghostPos.value + "px", top: "0px", height: "100%", width: props.barSize + "px" }
})

defineExpose({
    resize: async () => {
        await nextTick()
        measureRoot()
    }
})
</script>

<template>
    <div ref="rootEl" class="ui-layout" :style="rootStyle">
        <div v-if="hasTop" class="top" :style="topStyle"><slot name="top" /></div>
        <div v-if="hasTop && topResize" class="resize top" :style="topResizerStyle" @mousedown="onResizerMouseDown('top', $event)"></div>

        <div v-if="hasBottom" class="bottom" :style="bottomStyle"><slot name="bottom" /></div>
        <div
            v-if="hasBottom && bottomResize"
            class="resize bottom"
            :style="bottomResizerStyle"
            @mousedown="onResizerMouseDown('bottom', $event)"
        ></div>

        <div v-if="hasLeft" class="left" :style="leftStyle"><slot name="left" /></div>
        <div
            v-if="hasLeft && leftResize"
            class="resize left"
            :style="leftResizerStyle"
            @mousedown="onResizerMouseDown('left', $event)"
        ></div>

        <div v-if="hasRight" class="right" :style="rightStyle"><slot name="right" /></div>
        <div
            v-if="hasRight && rightResize"
            class="resize right"
            :style="rightResizerStyle"
            @mousedown="onResizerMouseDown('right', $event)"
        ></div>

        <div v-if="hasCenter" class="center" :style="centerStyle"><slot name="center" /></div>

        <div v-if="dragging" :style="ghostStyle"></div>
    </div>
</template>
