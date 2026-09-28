<script setup lang="ts">
import { ref, computed, watch, nextTick, useSlots } from "vue"

// 원본(tooltip.js)은 body에 절대좌표(getBoundingClientRect 기반)로 툴팁을 붙였다.
// Vue 버전은 트리거를 감싸는 wrapper를 position:relative로 두고 CSS만으로 4방향에 붙인다
// (Tab 메뉴/AutoComplete 드롭다운과 같은 패턴) — 레이아웃이 바뀌어도 재계산이 필요 없어 더 견고하다.
// 커스텀 마크업(원본 예시의 popover 템플릿 같은 것)은 문자열 템플릿 대신 #tooltip 슬롯으로 대체한다.
const props = withDefaults(
    defineProps<{
        /** 원본의 title 속성/opts.title에 대응하는 툴팁 내용. */
        text?: string
        position?: "top" | "bottom" | "left" | "right"
        color?: string | null
        width?: number
        align?: "left" | "right" | "center"
        delay?: number
        showType?: string
        hideType?: string
    }>(),
    {
        text: "",
        position: "top",
        color: null,
        width: 150,
        align: "left",
        delay: 0,
        showType: "mouseover",
        hideType: "mouseout"
    }
)

const emit = defineEmits<{
    show: [e: Event]
    hide: [e: Event]
}>()
const slots = useSlots()

// 원본 update(newTitle)로 프로그래매틱하게 바꿀 수 있어서(ButtonGroup/AutoComplete와 동일한 이유로)
// text는 prop을 초기값으로 삼는 내부 상태로 관리한다.
const internalText = ref(props.text)
watch(
    () => props.text,
    (v) => {
        internalText.value = v
    }
)

const visible = ref(false)
const bubbleRef = ref<HTMLElement | null>(null)
// position prop대로 뒀을 때 뷰포트 밖으로 나가 완전히 안 보이는 경우를 위한 보정 - 트리거가
// 뷰포트 가장자리에 붙어있으면("top"인데 위쪽 공간이 아예 없는 경우 등) 실제로 재현됨(예:
// tooltip_1 데모의 "Top" 버튼은 페이지 맨 위에 있어 위로 띄우면 전부 화면 밖으로 나간다).
// position 자체를 바꾸지 않는다(요청 위치가 "top"이면 계속 "top"으로 보여야 함) - 화면 밖으로
// 나가는 만큼만 안쪽으로 밀어넣는다. 트리거와 겹칠 수 있는데, 겹쳐도 깜빡이지 않도록
// .tooltip에 pointer-events:none을 줘서 커서가 항상 트리거 위에 있는 것으로 취급되게 한다
// (원본은 좌표를 1px로 clamp만 하고 pointer-events는 그대로라 실제로 깜빡이는 버그가 있다 -
// uiplay의 실제 grid.min.js 소스 + 인터랙션 테스트로 확인됨).
const nudge = ref({ x: 0, y: 0 })
let timer: ReturnType<typeof setTimeout> | null = null

function adjustForViewport() {
    const el = bubbleRef.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    let dx = 0
    let dy = 0
    if (rect.top < 0) dy = -rect.top
    else if (rect.bottom > window.innerHeight) dy = window.innerHeight - rect.bottom
    if (rect.left < 0) dx = -rect.left
    else if (rect.right > window.innerWidth) dx = window.innerWidth - rect.right
    nudge.value = { x: dx, y: dy }
}

async function doShow(e: Event) {
    if (internalText.value === "") return
    nudge.value = { x: 0, y: 0 }
    visible.value = true
    emit("show", e)
    await nextTick()
    adjustForViewport()
}

function doHide(e: Event) {
    if (timer != null) clearTimeout(timer)
    timer = null
    if (visible.value) {
        visible.value = false
        emit("hide", e)
    }
}

function onShowTrigger(e: Event) {
    if (timer == null) {
        timer = setTimeout(() => doShow(e), props.delay)
    } else if (props.showType === props.hideType) {
        doHide(e)
    }
}

function onHideTrigger(e: Event) {
    doHide(e)
}

// showType/hideType은 mouseover/mouseout/click 같은 네이티브 DOM 이벤트명을 그대로 쓴다.
const triggerHandlers = computed(() => {
    const handlers: Record<string, (e: Event) => void> = { [props.showType]: onShowTrigger }
    if (props.showType !== props.hideType) {
        handlers[props.hideType] = onHideTrigger
    }
    return handlers
})

/** 원본 update(newTitle) — 툴팁 내용을 프로그래매틱하게 교체 */
function update(newText: string) {
    internalText.value = newText
}

defineExpose({ update })
</script>

<template>
    <span class="tooltip-trigger" style="position: relative; display: inline-block;" v-on="triggerHandlers">
        <slot />
        <div
            v-if="visible"
            ref="bubbleRef"
            class="tooltip"
            :class="position"
            :style="{
                // width:max-content가 없으면, 이 박스의 containing block(트리거 span, 보통 아주 좁음)
                // 기준으로 left:50% 지점부터 남는 공간만으로 shrink-to-fit 폭을 계산해버려서
                // 글자 수만큼 세로로 쪼개지는 버그가 있었다(폭이 몇 px로 찌그러짐).
                width: 'max-content',
                maxWidth: `${width}px`,
                textAlign: align,
                backgroundColor: color || undefined,
                ...({
                    top: { bottom: '100%', left: '50%', transform: `translateX(-50%) translate(${nudge.x}px, ${nudge.y}px)` },
                    bottom: { top: '100%', left: '50%', transform: `translateX(-50%) translate(${nudge.x}px, ${nudge.y}px)` },
                    left: { right: '100%', top: '50%', transform: `translateY(-50%) translate(${nudge.x}px, ${nudge.y}px)` },
                    right: { left: '100%', top: '50%', transform: `translateY(-50%) translate(${nudge.x}px, ${nudge.y}px)` }
                }[position])
            }"
        >
            <!-- #tooltip 슬롯(popover 등 커스텀 콘텐츠)을 쓸 때는 이 기본 anchor(검은 화살표,
                 tooltipBackgroundColor로 칠해짐)를 렌더링하지 않는다 - 커스텀 콘텐츠가 자기
                 화살표를 따로 갖고 있으면(popover의 ::before/::after) 그 위에 검은 삼각형이
                 하나 더 겹쳐 보이는 버그였다. -->
            <div v-if="!slots.tooltip" class="anchor"></div>
            <slot name="tooltip">
                <div class="message" :style="{ backgroundColor: color || undefined }">{{ internalText }}</div>
            </slot>
        </div>
    </span>
</template>
