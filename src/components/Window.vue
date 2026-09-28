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
        width?: number
        height?: number
        left?: string | number
        top?: string | number
        right?: string | number
        bottom?: string | number
        title?: string
        modal?: boolean
        move?: boolean
        resize?: boolean
        modalIndex?: number
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
    "update:modelValue": [value: boolean]
    show: []
    hide: []
    move: [e: MouseEvent]
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
