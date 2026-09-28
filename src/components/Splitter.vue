<script setup lang="ts">
// 원본(splitter.js)은 CSS 클래스가 아니라 jQuery로 계산한 픽셀 값을 인라인 스타일로 직접
// 밀어넣는 방식(position:absolute + left/top/width/height 전부 JS 계산)이라 전용 .less가
// 없다. Vue 버전도 동일하게 인라인 스타일 바인딩으로 재현한다.
// 원본은 정확히 두 개의 자식 셀렉터(items: [sel1, sel2])를 받는데, Vue 버전은 그 자리를
// #first/#second 두 개의 named slot으로 대체한다(선택자 스캔 대신 슬롯 콘텐츠 프로젝션 —
// Button/Tab items와 동일한 방향의 단순화).
// 원본의 setHide(index)/setShow(index)/toggle(index)는 그대로 명령형 메서드로 노출하되,
// 제어 컴포넌트로도 쓸 수 있게 hidden prop(v-model:hidden)도 함께 지원한다.
// 이벤트명 'move.done'은 Vue 템플릿의 @move.done이 "done" modifier로 파싱되어 버리므로
// 'resize'로 이름을 바꿨다(동작은 동일 — 드래그가 끝났을 때 1회 발생).
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue"
import type { CSSProperties } from "vue"

const props = withDefaults(
    defineProps<{
        /** "vertical"은 좌우(첫 패널 width 기준)로, "horizontal"은 상하(첫 패널 height 기준)로 나눈다. 기본값 "vertical". */
        direction?: "vertical" | "horizontal"
        /** 첫 번째 패널의 초기 크기. "50%"처럼 퍼센트 문자열이거나 px 숫자. 사용자가 한 번이라도 드래그하면(userAdjusted) 이후 컨테이너 크기가 바뀌어도 이 값으로 다시 계산하지 않는다. 기본값 "50%". */
        initSize?: string | number
        /** 각 패널이 가질 수 있는 최소 크기(px). 숫자 하나면 두 패널에 똑같이 적용되고, [첫 번째, 두 번째] 튜플로 각각 다르게 줄 수도 있다. 기본값 30. */
        minSize?: number | [number, number]
        /** 두 패널 사이 구분 바(드래그 핸들)의 두께(px). 기본값 4. */
        barSize?: number
        /** 구분 바에 추가로 병합할 인라인 스타일(배경색/테두리 등). 기본값 { backgroundColor: "#f6f6f6", borderRight: "1px solid #e4e4e4" }. */
        barStyle?: Record<string, string>
        /** true면 구분 바는 그대로 보이지만 드래그로 크기를 조절할 수 없게 된다(onBarMouseDown이 즉시 무시됨). 기본값 false. */
        fixed?: boolean
        /** null | 0 | 1 - v-model:hidden. */
        hidden?: 0 | 1 | null
    }>(),
    {
        direction: "vertical",
        initSize: "50%",
        minSize: 30,
        barSize: 4,
        barStyle: () => ({ backgroundColor: "#f6f6f6", borderRight: "1px solid #e4e4e4" }),
        fixed: false,
        hidden: null
    }
)

const emit = defineEmits<{
    /** v-model:hidden 동기화용 - setHide/setShow/toggle 호출로 어느 패널을 숨길지가 바뀔 때 발생한다. */
    "update:hidden": [value: 0 | 1 | null]
    /** 사용자가 구분 바 드래그를 끝냈을 때(mouseup) 한 번만 발생한다 - 원본의 'move.done' 이벤트를 Vue 템플릿의 모디파이어 파싱과 충돌하지 않도록 이름만 바꾼 것. 첫 번째 패널의 최종 크기(px)를 전달한다. */
    resize: [splitPx: number]
}>()

const rootEl = ref<HTMLElement | null>(null)
const splitPx = ref(0)
const dragging = ref(false)

const isVertical = computed(() => props.direction === "vertical")
const minSizePair = computed<[number, number]>(() =>
    typeof props.minSize === "number" ? [props.minSize, props.minSize] : props.minSize
)

function containerSize() {
    if (!rootEl.value) return 0
    return isVertical.value ? rootEl.value.clientWidth : rootEl.value.clientHeight
}

function resolveSize(size: string | number, maxSize: number): number {
    if (typeof size === "string" && size.indexOf("%") > -1) {
        return maxSize * (parseFloat(size.replace("%", "")) / 100)
    }
    return size as number
}

function clamp(pos: number, maxSize: number) {
    const [minFirst, minSecond] = minSizePair.value
    if (pos < props.barSize + minFirst) return props.barSize + minFirst
    if (pos > maxSize - props.barSize - minSecond) return maxSize - props.barSize - minSecond
    return pos
}

const userAdjusted = ref(false) // 사용자가 드래그로 직접 위치를 바꿨으면, 이후 컨테이너 크기가
// 변해도(예: 조상 Splitter가 뒤늦게 자기 크기를 확정하는 경우) 자동 재계산으로 덮어쓰지 않는다.

function recompute() {
    if (props.hidden !== null || userAdjusted.value) return
    const maxSize = containerSize()
    if (maxSize <= 0) return
    splitPx.value = clamp(resolveSize(props.initSize, maxSize), maxSize)
}

let observer: ResizeObserver | null = null
onMounted(() => {
    recompute()
    // Border Layout 데모처럼 Splitter 슬롯 안에 또 Splitter가 중첩된 경우, 안쪽 Splitter는
    // 바깥쪽 Splitter보다 먼저 mount되므로(Vue는 자식을 부모보다 먼저 mount한다) 처음 크기를
    // 잴 때 조상이 아직 자기 폭을 확정하기 전일 수 있고, 그 이후에도 조상이 여러 단계를 거쳐
    // 자기 크기를 확정하는 동안 컨테이너 크기가 몇 차례 더 바뀔 수 있다. 그래서 사용자가 직접
    // 드래그하기 전까지는 컨테이너 크기 변화를 계속 관찰하며 퍼센트 기준으로 다시 계산한다.
    if (typeof ResizeObserver !== "undefined") {
        observer = new ResizeObserver(recompute)
        observer.observe(rootEl.value!)
    }
})
onBeforeUnmount(() => observer?.disconnect())

watch(() => [props.direction, props.initSize, props.minSize, props.barSize, props.hidden], recompute)

const rootStyle: CSSProperties = { position: "absolute", width: "100%", height: "100%", overflow: "hidden" }

const panel1Style = computed<CSSProperties>(() => {
    if (props.hidden === 0) return { display: "none" }
    if (props.hidden === 1) return { position: "absolute", left: "0px", right: "0px", top: "0px", bottom: "0px" }
    return isVertical.value
        ? { position: "absolute", left: "0px", width: splitPx.value + "px", top: "0px", bottom: "0px" }
        : { position: "absolute", top: "0px", height: splitPx.value + "px", left: "0px", right: "0px" }
})

const panel2Style = computed<CSSProperties>(() => {
    if (props.hidden === 1) return { display: "none" }
    if (props.hidden === 0) return { position: "absolute", left: "0px", right: "0px", top: "0px", bottom: "0px" }
    return isVertical.value
        ? { position: "absolute", left: splitPx.value + props.barSize + "px", right: "0px", top: "0px", bottom: "0px" }
        : { position: "absolute", top: splitPx.value + props.barSize + "px", bottom: "0px", left: "0px", right: "0px" }
})

const showBar = computed(() => props.hidden === null)

const barStyleComputed = computed<CSSProperties>(() => {
    const base: CSSProperties = isVertical.value
        ? { position: "absolute", top: "0px", bottom: "0px", width: props.barSize + "px", left: splitPx.value + "px", cursor: "ew-resize" }
        : { position: "absolute", left: "0px", right: "0px", height: props.barSize + "px", top: splitPx.value + "px", cursor: "ns-resize" }
    return { ...base, ...props.barStyle }
})

let prevClient = 0
let prevBodyUserSelect = ""
function onBarMouseDown(e: MouseEvent) {
    if (props.fixed) return
    e.preventDefault() // 없으면 드래그하면서 마우스가 지나가는 양쪽 패널의 텍스트가 계속 선택된다
    dragging.value = true
    userAdjusted.value = true
    prevClient = isVertical.value ? e.clientX : e.clientY
    prevBodyUserSelect = document.body.style.userSelect
    document.body.style.userSelect = "none"
    rootEl.value!.querySelectorAll("iframe").forEach((f) => ((f as HTMLElement).style.pointerEvents = "none"))
    document.addEventListener("mousemove", onMouseMove)
    document.addEventListener("mouseup", onMouseUp)
}

function onMouseMove(e: MouseEvent) {
    if (!dragging.value) return
    const client = isVertical.value ? e.clientX : e.clientY
    const dist = client - prevClient
    const maxSize = containerSize()
    splitPx.value = clamp(splitPx.value + dist, maxSize)
    prevClient = client
}

function onMouseUp() {
    if (!dragging.value) return
    dragging.value = false
    document.removeEventListener("mousemove", onMouseMove)
    document.removeEventListener("mouseup", onMouseUp)
    document.body.style.userSelect = prevBodyUserSelect
    rootEl.value!.querySelectorAll("iframe").forEach((f) => ((f as HTMLElement).style.pointerEvents = "auto"))
    emit("resize", splitPx.value)
}

onBeforeUnmount(() => {
    document.removeEventListener("mousemove", onMouseMove)
    document.removeEventListener("mouseup", onMouseUp)
})

function setHide(index: 0 | 1) {
    emit("update:hidden", index)
}
function setShow(index: 0 | 1) {
    if (props.hidden === index) emit("update:hidden", null)
}
function toggle(index: 0 | 1) {
    emit("update:hidden", props.hidden === index ? null : index)
}
function setInitSize(size: string | number) {
    userAdjusted.value = true
    const maxSize = containerSize()
    splitPx.value = clamp(resolveSize(size, maxSize), maxSize)
}

defineExpose({ setHide, setShow, toggle, setInitSize })
</script>

<template>
    <div ref="rootEl" class="splitter" :style="rootStyle" :class="{ dragging }">
        <div class="splitter-panel" :style="panel1Style">
            <slot name="first" />
        </div>
        <div class="splitter-panel" :style="panel2Style">
            <slot name="second" />
        </div>
        <div v-if="showBar" class="ui-splitter" :style="barStyleComputed" @mousedown="onBarMouseDown"></div>
    </div>
</template>
