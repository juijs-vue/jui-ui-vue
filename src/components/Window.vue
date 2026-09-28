<script setup lang="ts">
// 원본(window.js)은 마크업을 직접 생성하지 않고 기존 .head/.body/.foot 구조를 가진
// DOM에 붙는 방식이었다 — 즉 사용자가 head/body/foot 마크업을 직접 작성해야 했다.
// Vue 버전은 그 "틀"(head의 title/close 버튼, resize 핸들)을 컴포넌트가 그려주고,
// 내용은 title/default/foot 슬롯으로 받는다. update(html)/setTitle(html) 같은 명령형
// DOM 조작 메서드는 슬롯의 선언적 콘텐츠로 대체되므로 노출하지 않는다(Tab/Button과 동일한 단순화).
import { ref, computed, onMounted, onBeforeUnmount, watch, useSlots } from "vue"
import type { CSSProperties } from "vue"

const slots = useSlots()

const props = withDefaults(
    defineProps<{
        /** 표시 여부(v-model). */
        modelValue?: boolean
        /** 초기(및 현재) 너비(px). resize 드래그나 setSize()로 바뀐다. 기본값 400. */
        width?: number
        /** 초기(및 현재) 높이(px). resize 드래그나 setSize()로 바뀐다. 기본값 300. */
        height?: number
        /** 초기 왼쪽 위치. "auto"거나 px 숫자/문자열. modal=true이고 left/top이 모두 "auto"면 화면 중앙에 오도록 자동 계산된다. 드래그로 이동하면 right/bottom은 "auto"로 리셋되고 이쪽이 기준이 된다. 기본값 "auto". */
        left?: string | number
        /** 초기 위쪽 위치. left와 동일한 규칙(모달 중앙 정렬, 드래그 시 bottom 리셋)을 따른다. 기본값 "auto". */
        top?: string | number
        /** 초기 오른쪽 위치. left/top이 "auto"가 아닌 한 실제로 적용되며, 드래그가 시작되면 "auto"로 리셋된다. 기본값 "auto". */
        right?: string | number
        /** 초기 아래쪽 위치. right와 동일하게 드래그가 시작되면 "auto"로 리셋된다. 기본값 "auto". */
        bottom?: string | number
        /** #title 슬롯을 쓰지 않을 때 헤더에 표시할 제목. 기본값 "". */
        title?: string
        /** true면 뒤에 반투명 backdrop을 깔고, move/resize를 강제로 비활성화하며(canMove/canResize 모두 false), left/top이 "auto"면 화면 중앙에 뜨도록 초기 위치를 계산한다. 기본값 false. */
        modal?: boolean
        /** 헤더를 드래그해 창을 옮길 수 있는지 여부. modal=true일 때는 이 값과 무관하게 항상 이동이 막힌다. 기본값 true. */
        move?: boolean
        /** 우하단 핸들로 창 크기를 조절할 수 있는지 여부. modal=true일 때는 이 값과 무관하게 항상 리사이즈가 막힌다. 기본값 true. */
        resize?: boolean
        /** modal=true일 때 backdrop(5000+modalIndex)과 창(5001+modalIndex) 자체의 z-index 기준값 - 모달 창을 여러 개 겹쳐 띄울 때 순서를 구분하는 데 쓴다. modal=false면 쓰이지 않는다. 기본값 0. */
        modalIndex?: number
        /** modal=false일 때의 초기 z-index. 창 위에서 mousedown하면(onFocus) 1씩 증가해 다른 비모달 창보다 위로 올라온다. 기본값 2000. */
        layerIndex?: number
    }>(),
    {
        modelValue: false,
        width: 400,
        height: 300,
        left: "auto",
        top: "auto",
        right: "auto",
        bottom: "auto",
        title: "",
        modal: false,
        move: true,
        resize: true,
        modalIndex: 0,
        layerIndex: 2000
    }
)

const emit = defineEmits<{
    /** v-model 동기화용 - show()/hide()(닫기 버튼 클릭 포함) 호출 시 발생한다. */
    "update:modelValue": [value: boolean]
    /** modelValue가 true로 바뀔 때 발생한다. */
    show: []
    /** modelValue가 false로 바뀔 때 발생한다. */
    hide: []
    /** 헤더 드래그로 창을 옮기던 중 마우스를 뗐을 때(드래그 종료 시 1회) 발생하며, 원본 MouseEvent를 전달한다. */
    move: [e: MouseEvent]
    /** 리사이즈 핸들 드래그 중 마우스를 뗐을 때(드래그 종료 시 1회) 발생하며, 원본 MouseEvent를 전달한다. */
    resize: [e: MouseEvent]
}>()

const canMove = computed(() => props.move && !props.modal)
const canResize = computed(() => props.resize && !props.modal)

// 모달 윈도우일 때는 자신이 그리는 modal-backdrop(zIndex: 5000+modalIndex)보다 위에 있어야
// 하므로, 모달이 아닐 때의 layerIndex 체계와 분리해서 계산한다.
const zIndex = ref(props.modal ? 5001 + props.modalIndex : props.layerIndex)
const size = ref({ width: props.width, height: props.height })

// 원본(window.js)은 modal:true일 때 내부적으로 ui.modal의 센터링 계산에 left/top을 맡긴다
// (modal.js: x = (뷰포트폭/2 - 창폭/2), y = (뷰포트높이/2 - 창높이/2)) — 그래서 modal:true인
// 창은 left/top을 안 줘도 화면 중앙에 뜬다. 여기서도 modal이고 left/top이 명시되지 않았으면
// (기본값 "auto") 같은 계산으로 초기 위치를 잡는다.
const initialPos = { left: props.left, top: props.top, right: props.right, bottom: props.bottom }
if (props.modal && props.left === "auto" && props.top === "auto") {
    initialPos.left = Math.max(0, (window.innerWidth - props.width) / 2)
    initialPos.top = Math.max(0, (window.innerHeight - props.height) / 2)
}
const pos = ref(initialPos)

// window.less의 head(32px)/foot(47px) 고정 높이를 그대로 상수로 사용 — 원본은
// $foot.outerHeight() 등으로 런타임에 측정했지만, 이 컴포넌트의 head/foot은 항상
// 이 CSS 값을 쓰므로 측정 없이 계산 가능하다.
const HEAD_HEIGHT = 32
const FOOT_HEIGHT = 47

const windowStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    left: typeof pos.value.left === "number" ? pos.value.left + "px" : pos.value.left,
    top: typeof pos.value.top === "number" ? pos.value.top + "px" : pos.value.top,
    right: typeof pos.value.right === "number" ? pos.value.right + "px" : pos.value.right,
    bottom: typeof pos.value.bottom === "number" ? pos.value.bottom + "px" : pos.value.bottom,
    width: size.value.width + "px",
    height: size.value.height + "px",
    zIndex: zIndex.value
}))

const bodyStyle = computed<CSSProperties>(() => {
    const foot = slots.foot ? FOOT_HEIGHT : 5
    return { height: size.value.height - HEAD_HEIGHT - foot + "px" }
})

const move_ = ref({ check: false, disX: 0, disY: 0 })
const resize_ = ref({ check: false, disX: 0, disY: 0, disWidth: 0, disHeight: 0 })
const rootEl = ref<HTMLElement | null>(null)

function onFocus() {
    if (props.modal) return
    zIndex.value = ++zIndex.value
}

function onHeadMouseDown(e: MouseEvent) {
    if (!canMove.value) return
    e.preventDefault() // 없으면 드래그하면서 마우스가 지나가는 아래 콘텐츠의 텍스트가 계속 선택된다
    const rect = rootEl.value!.getBoundingClientRect()
    move_.value = { check: true, disX: e.pageX - (rect.left + window.scrollX), disY: e.pageY - (rect.top + window.scrollY) }
    document.body.style.userSelect = "none"
}

function onResizeMouseDown(e: MouseEvent) {
    if (!canResize.value) return
    const rect = rootEl.value!.getBoundingClientRect()
    resize_.value = {
        check: true,
        disX: rect.width + rect.left + window.scrollX,
        disWidth: rect.width,
        disY: rect.height + rect.top + window.scrollY,
        disHeight: rect.height
    }
    e.preventDefault()
    document.body.style.userSelect = "none"
}

function onDocMouseMove(e: MouseEvent) {
    if (move_.value.check) {
        pos.value = { ...pos.value, left: e.pageX - move_.value.disX, top: e.pageY - move_.value.disY, right: "auto", bottom: "auto" }
    }
    if (resize_.value.check) {
        const w = resize_.value.disWidth + (e.pageX - resize_.value.disX)
        const h = resize_.value.disHeight + (e.pageY - resize_.value.disY)
        size.value = { width: Math.max(w, 0), height: Math.max(h, 0) }
    }
}

function onDocMouseUp(e: MouseEvent) {
    if (move_.value.check) emit("move", e)
    if (resize_.value.check) emit("resize", e)
    if (move_.value.check || resize_.value.check) document.body.style.userSelect = ""
    move_.value.check = false
    resize_.value.check = false
}

onMounted(() => {
    document.addEventListener("mousemove", onDocMouseMove)
    document.addEventListener("mouseup", onDocMouseUp)
})
onBeforeUnmount(() => {
    document.removeEventListener("mousemove", onDocMouseMove)
    document.removeEventListener("mouseup", onDocMouseUp)
})

watch(
    () => props.modelValue,
    (v) => (v ? emit("show") : emit("hide"))
)

function show(x?: number, y?: number) {
    // 원본에 있던 버그: 여기서 (정의된 적 없는) `move`를 호출하고 있었다 - TS 전환 중 발견,
    // 의도가 명확한 `moveTo`로 고쳤다(실제로 x/y를 넘겨 show()를 호출하는 곳이 없어서
    // 지금까지 드러나지 않았던 것으로 보인다).
    if (x !== undefined || y !== undefined) moveTo(x, y)
    emit("update:modelValue", true)
}
function hide() {
    emit("update:modelValue", false)
}
function moveTo(x?: number, y?: number) {
    pos.value = { ...pos.value, left: x ?? pos.value.left, top: y ?? pos.value.top, right: "auto", bottom: "auto" }
}
function setSize(w: number, h: number) {
    size.value = { width: w, height: h }
}

defineExpose({ show, hide, move: moveTo, setSize })
</script>

<template>
    <Teleport to="body">
        <div
            v-if="modal && modelValue"
            class="modal-backdrop"
            style="position: fixed; inset: 0"
            :style="{ backgroundColor: 'black', opacity: 0.4, zIndex: 5000 + modalIndex }"
        ></div>
    </Teleport>
    <Teleport to="body">
        <div v-if="modelValue" ref="rootEl" class="window" :style="windowStyle" @mousedown="onFocus">
            <div class="head" :style="{ cursor: canMove ? 'move' : 'default' }" @mousedown="onHeadMouseDown">
                <div class="left">
                    <span class="title"><slot name="title">{{ title }}</slot></span>
                </div>
                <div class="right">
                    <slot name="actions" :hide="hide" />
                    <a class="close" @mousedown.stop @click="hide"><i class="icon-exit"></i></a>
                </div>
            </div>
            <div class="body" :style="bodyStyle">
                <slot :hide="hide" />
            </div>
            <div v-if="$slots.foot" class="foot">
                <slot name="foot" :hide="hide" />
            </div>
            <i v-if="canResize" class="icon-resize resize" @mousedown="onResizeMouseDown"></i>
        </div>
    </Teleport>
</template>
