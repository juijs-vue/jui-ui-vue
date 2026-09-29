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
        /** 루트 컨테이너의 폭(px) - null(기본)이면 부모 요소의 크기를 100%로 채운다(부모가 이미 크기를 잡고 있다고 가정). */
        width?: number | null
        /** 루트 컨테이너의 높이(px) - null(기본)이면 부모 요소의 크기를 100%로 채운다. */
        height?: number | null
        /** 리사이즈 바(resizer)의 배경색. */
        barColor?: string
        /** 리사이즈 바의 두께(px) - 해당 영역이 resize 가능하면 그 영역이 차지하는 공간(band)에 이 값만큼 추가로 포함된다. */
        barSize?: number

        /** top 슬롯 영역의 높이(px) - top 슬롯이 없으면 무시된다. 지정하지 않으면 topMin으로 시작하고, 이후 드래그 결과는 내부 상태로 추적되므로 v-model처럼 쓰려면 update:topSize를 받아 다시 넘겨야 한다. */
        topSize?: number | null
        /** top 영역을 드래그로 줄일 수 있는 최솟값(px). */
        topMin?: number
        /** top 영역을 드래그로 늘릴 수 있는 최댓값(px). */
        topMax?: number
        /** top 영역에 리사이즈 바를 표시해 드래그로 크기를 바꿀 수 있게 할지 여부(기본 true) - false면 topSize로 고정된다. */
        topResize?: boolean

        /** bottom 슬롯 영역의 높이(px) - bottom 슬롯이 없으면 무시된다. 지정하지 않으면 bottomMin으로 시작한다. */
        bottomSize?: number | null
        /** bottom 영역의 최소 높이(px). */
        bottomMin?: number
        /** bottom 영역의 최대 높이(px). */
        bottomMax?: number
        /** bottom 영역에 리사이즈 바를 표시할지 여부(기본 true). */
        bottomResize?: boolean

        /** left 슬롯 영역의 너비(px) - left 슬롯이 없으면 무시된다. 지정하지 않으면 leftMin으로 시작한다. */
        leftSize?: number | null
        /** left 영역의 최소 너비(px). */
        leftMin?: number
        /** left 영역의 최대 너비(px). */
        leftMax?: number
        /** left 영역에 리사이즈 바를 표시할지 여부(기본 true). */
        leftResize?: boolean

        /** right 슬롯 영역의 너비(px) - right 슬롯이 없으면 무시된다. 지정하지 않으면 rightMin으로 시작한다. */
        rightSize?: number | null
        /** right 영역의 최소 너비(px). */
        rightMin?: number
        /** right 영역의 최대 너비(px). */
        rightMax?: number
        /** right 영역에 리사이즈 바를 표시할지 여부(기본 true). */
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
    /** top 영역 리사이즈 바 드래그가 끝났을 때(mouseup) 새 높이(px)와 함께 emit된다. */
    "update:topSize": [value: number]
    /** bottom 영역 리사이즈 바 드래그가 끝났을 때 새 높이(px)와 함께 emit된다. */
    "update:bottomSize": [value: number]
    /** left 영역 리사이즈 바 드래그가 끝났을 때 새 너비(px)와 함께 emit된다. */
    "update:leftSize": [value: number]
    /** right 영역 리사이즈 바 드래그가 끝났을 때 새 너비(px)와 함께 emit된다. */
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
        if (props.topMin <= candidate && candidate <= props.topMax) ghostPos.value = candidate
    } else if (dir === "left") {
        if (props.leftMin <= candidate && candidate <= props.leftMax) ghostPos.value = candidate
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
