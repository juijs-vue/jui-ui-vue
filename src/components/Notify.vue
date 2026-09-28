<script setup lang="ts">
import { ref, computed } from "vue"
import type { CSSProperties } from "vue"

// 원본(notify.js)은 알림들을 담는 컨테이너 div를 만들고 그 안에 알림을 prepend(top-*)/
// append(bottom-*)하는 방식이었다. Vue 버전은 items 배열의 삽입 순서로 그걸 그대로 재현하고,
// 보이기/숨기기는 jQuery .animate()/.slideUp() 대신 CSS 트랜지션(Vue <TransitionGroup>)으로 처리한다.
// show 이벤트는 원본처럼 "보이기 애니메이션이 끝난 뒤"가 아니라 add() 호출 시점에 바로 emit한다
// (애니메이션 종료 콜백에 맞추려면 트랜지션 훅을 items 엔트리별로 추적해야 해서 배보다 배꼽이 큼).
// scrollTop 보정(스크롤 컨테이너 안에서 알림이 뷰포트에 붙어있게 하는 것)도 이번 포팅 범위 밖이다.
type NotifyPosition = "top" | "top-left" | "top-right" | "bottom" | "bottom-left" | "bottom-right"
interface NotifyPadding {
    top?: number
    bottom?: number
    left?: number
    right?: number
}
interface NotifyData {
    title?: string
    message?: string
    color?: string
    [key: string]: unknown
}
interface NotifyItem {
    id: number
    data: NotifyData
}

const props = withDefaults(
    defineProps<{
        position?: NotifyPosition
        /** 숫자 또는 { top?, bottom?, left?, right? } 형태로 특정 방향만 오버라이드. */
        padding?: number | NotifyPadding
        distance?: number
        timeout?: number
        showDuration?: number
        hideDuration?: number
        /** jQuery의 "swing" 근사치로 CSS ease를 쓴다. */
        showEasing?: string
        hideEasing?: string
    }>(),
    {
        position: "top-right",
        padding: 12,
        distance: 5,
        timeout: 3000,
        showDuration: 500,
        hideDuration: 500,
        showEasing: "ease",
        hideEasing: "linear"
    }
)

const emit = defineEmits<{
    show: [data: NotifyData]
    hide: [data: NotifyData]
    select: [data: NotifyData, e: MouseEvent]
}>()

const items = ref<NotifyItem[]>([])
let seq = 0

function isTop() {
    return props.position.indexOf("top") === 0
}

// 원본 paddingObj 테이블. 단, 원본의 bottom-left는 right까지 padding 값을 넣는 복붙 버그가 있어서
// (그러면 절대위치 left+right가 동시에 잡혀 폭이 늘어나버림, top-left와 대칭이 안 맞음) right: "auto"로 고쳤다.
const resolvedPos = computed<Required<NotifyPadding> | { top: number | "auto"; bottom: number | "auto"; left: number | "auto"; right: number | "auto" }>(() => {
    const p = typeof props.padding === "number" ? props.padding : 12
    const table: Record<NotifyPosition, { top: number | "auto"; bottom: number | "auto"; left: number | "auto"; right: number | "auto" }> = {
        top: { top: p, bottom: "auto", left: p, right: p },
        "top-right": { top: p, bottom: "auto", left: "auto", right: p },
        "top-left": { top: p, bottom: "auto", left: p, right: "auto" },
        bottom: { top: "auto", bottom: p, left: p, right: p },
        "bottom-right": { top: "auto", bottom: p, left: "auto", right: p },
        "bottom-left": { top: "auto", bottom: p, left: p, right: "auto" }
    }
    let pos = table[props.position] ?? table["top-right"]
    if (typeof props.padding === "object") pos = { ...pos, ...props.padding }
    return pos
})

const containerStyle = computed<CSSProperties>(() => {
    const pos = resolvedPos.value
    const toCss = (v: number | "auto") => (v === "auto" ? "auto" : `${v}px`)
    return {
        position: "absolute",
        zIndex: 3000,
        top: toCss(pos.top),
        bottom: toCss(pos.bottom),
        left: toCss(pos.left),
        right: toCss(pos.right),
        display: "flex",
        flexDirection: "column"
    }
})

// 원본(notify.js)의 add()는 position이 "top"/"bottom"(가운데로 폭 전체를 쓰는 배치)일 때만
// 알림 하나하나에 $container.width() - (padding.right || DEF_PADDING) * 3 만큼의 outerWidth를
// 직접 박아넣는다 - 코너 배치(top-right 등)는 .notify의 고정폭(268px)을 그대로 쓴다.
function isCentered() {
    return props.position === "top" || props.position === "bottom"
}
// TransitionGroup의 ref는 DOM 엘리먼트가 아니라 컴포넌트 인스턴스라 $el을 통해야 실제 DOM에
// 닿는다(아래 measureCenterWidth 참고) - Vue의 내장 TransitionGroup 타입 자체가 이 인스턴스
// 형태를 엄밀하게 노출하지 않아서 any로 둔다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rootEl = ref<any>(null)
const centerWidth = ref<number | null>(null)
function measureCenterWidth() {
    if (!isCentered()) {
        centerWidth.value = null
        return
    }
    const pos = resolvedPos.value
    const left = typeof pos.left === "number" ? pos.left : 0
    const right = typeof pos.right === "number" ? pos.right : 0
    // 원본은 $container.width()를 쓰는데, $container는 target(기본값 "body")의 자식으로
    // 붙는다 - target이 body가 아닌 특정 엘리먼트(예: notify_2의 #notify_target)일 수 있으므로
    // document.body가 아니라 실제 부모 엘리먼트의 폭을 기준으로 삼는다.
    const el = rootEl.value?.$el ?? rootEl.value
    const parentWidth = el?.parentElement?.clientWidth ?? document.body.clientWidth
    const containerWidth = parentWidth - left - right
    centerWidth.value = containerWidth - right * 3
}

const itemStyle = computed<CSSProperties>(() => ({
    // 원본은 매 알림 엘리먼트 자체에 margin-bottom:distance를 건다(아이템 사이 간격 용도로
    // 쓰지만, flex 아이템 마진은 안 겹치므로 마지막/유일한 알림에도 그대로 적용돼 컨테이너
    // 가장자리에서 그만큼 더 떨어져 보인다) - 부모의 gap이 아니라 각 아이템에 직접 준다.
    marginBottom: `${props.distance}px`,
    transitionDuration: `${props.showDuration}ms, ${props.hideDuration}ms`,
    transitionTimingFunction: `${props.showEasing}, ${props.hideEasing}`,
    // 원본은 jQuery $alarm.outerWidth(containerWidth - padding.right*3)를 호출하는데, 실측해보니
    // (uiplay.jui.io) 이 값이 그대로 CSS width(content-box)로 들어가고 실제 렌더 폭은 거기에
    // padding/border가 더 얹어진 값이 된다 - "outerWidth 계산값 = 최종 렌더 폭"이 아니다. 그대로
    // width에 꽂아서 재현한다(box-sizing은 .notify의 기본값 content-box를 그대로 둔다).
    width: centerWidth.value !== null ? `${centerWidth.value}px` : undefined
}))

/** 원본 add(data, timeout) — 알림 하나를 추가하고 emit("show", data) */
function add(data: NotifyData, timeoutOverride?: number) {
    measureCenterWidth()
    const id = ++seq
    const delay = typeof timeoutOverride === "number" && !Number.isNaN(timeoutOverride) ? timeoutOverride : props.timeout
    const entry: NotifyItem = { id, data }

    if (isTop()) items.value.unshift(entry)
    else items.value.push(entry)

    emit("show", data)

    if (delay > 0) {
        setTimeout(() => removeItem(id), delay)
    }

    return id
}

// 원본(notify.js)의 remove()는 opacity/slideUp 애니메이션이 다 끝난 뒤 콜백에서 "hide"를
// emit한다(실측: uiplay.jui.io에서 타임아웃~hide 이벤트까지 약 2400ms - 설정한 timeout 2000ms
// + 애니메이션 시간). 여기서도 배열에서 바로 splice해 퇴장 트랜지션은 즉시 시작시키되, hide
// emit은 hideDuration만큼 늦춘다.
function removeItem(id: number) {
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx === -1) return
    const [removed] = items.value.splice(idx, 1)
    setTimeout(() => emit("hide", removed.data), props.hideDuration)
}

function onItemClick(entry: NotifyItem, e: MouseEvent) {
    emit("select", entry.data, e)
    removeItem(entry.id)
}

/** 원본 reset() — 모든 알림 제거 */
function reset() {
    items.value = []
}

defineExpose({ add, reset })
</script>

<template>
    <TransitionGroup ref="rootEl" tag="div" name="notify" :style="containerStyle">
        <div
            v-for="entry in items"
            :key="entry.id"
            class="notify"
            :class="entry.data.color"
            :style="itemStyle"
            @click="onItemClick(entry, $event)"
        >
            <div class="title">{{ entry.data.title }}</div>
            <div class="message">{{ entry.data.message }}</div>
        </div>
    </TransitionGroup>
</template>

<style scoped>
.notify-enter-active,
.notify-leave-active {
    transition-property: opacity;
}
.notify-enter-from {
    opacity: 0;
}
.notify-leave-to {
    opacity: 0;
}
.notify-leave-active {
    position: absolute;
}
</style>
