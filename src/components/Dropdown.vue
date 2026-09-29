<script lang="ts">
// 원본(dropdown.js)은 "동시에 하나만 열려있기" + "리스트 이외 영역 클릭 시 자동 닫힘" +
// "키보드 방향키로 열려있는 드롭다운 하나를 탐색"을 프로세스 전역(document/window 레벨
// 리스너 1개, 모든 ui.dropdown 인스턴스가 공유)으로 구현한다. Vue 버전도 동일하게
// 컴포넌트 인스턴스 밖의 모듈 스코프 상태로 구현해야 여러 Dropdown이 서로 올바르게
// 상호작용한다(하나가 열리면 이전에 열려있던 다른 Dropdown이 자동으로 닫히는 것 등).
interface ActiveDropdown {
    hide: () => void
    wheel: (key: number, callback?: () => void) => void
}
let activeDropdown: ActiveDropdown | null = null // 현재 열려 있는 드롭다운 인스턴스(최대 1개)

function hideActive() {
    if (activeDropdown) activeDropdown.hide()
}

let globalListenersInstalled = false
function installGlobalListenersOnce() {
    if (globalListenersInstalled) return
    globalListenersInstalled = true

    document.addEventListener("click", (e) => {
        const tn = (e.target as HTMLElement).tagName
        if (tn !== "LI" && tn !== "INPUT" && tn !== "A" && tn !== "BUTTON" && tn !== "I") {
            hideActive()
        }
    })

    window.addEventListener("keydown", (e) => {
        if (activeDropdown) {
            activeDropdown.wheel(e.which, () => e.preventDefault())
        }
    })
}
</script>

<script setup lang="ts">
// props.items가 주어지면 데이터 기반으로 <li>를 렌더링하고, 아니면 default 슬롯에 사용자가
// 작성한 <li> 마크업을 그대로 쓴다 — 어느 쪽이든 클릭/키보드 탐색은 ul에 이벤트 위임 1개로
// 동일하게 처리한다(원본이 $(...).find("li")로 마크업/데이터 렌더링 결과를 구분 없이 다루던
// 것과 같은 방식). 원본의 update(nodes) 메서드는 items를 reactive prop으로 바꾸는 것으로
// 대체했다(consumer가 items를 바꾸면 자동 반영 — Tab/Button items와 동일한 단순화).
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue"
import type { CSSProperties } from "vue"

/** items prop 데이터 기반 렌더링에 쓰는 항목 - items를 지정하지 않으면 default 슬롯에 직접 작성한 <li> 마크업을 그대로 쓴다. */
interface DropdownItem {
    /** 항목 값 - change/click 이벤트 payload와 <li value> 속성에 쓰인다. */
    value?: string | number
    /** 항목에 표시할 텍스트. */
    text?: string
    /** 지정하면 <a href>로 렌더링(없으면 텍스트만 렌더링). */
    href?: string
    /** 비활성 항목 - 클릭/키보드 탐색 대상에서 제외된다. */
    disabled?: boolean
    /** 구분선 - 클릭/키보드 탐색 대상에서 제외된다. */
    divider?: boolean
    /** 그룹 제목 항목 - 클릭/키보드 탐색 대상에서 제외된다(선택 불가). */
    title?: boolean
}

const props = withDefaults(
    defineProps<{
        /** 표시 여부(v-model). */
        modelValue?: boolean
        /** 데이터 기반으로 <li> 목록을 렌더링한다 - 지정하지 않으면 default 슬롯의 <li> 마크업을 그대로 쓴다. */
        items?: DropdownItem[]
        /** 항목 클릭 시 자동으로 닫힘. */
        close?: boolean
        /** 방향키로 탐색 가능. */
        keydown?: boolean
        /** 드롭다운 목록의 너비(px) - 0이면 CSS 기본값을 따르고, 지정하면 <ul>에는 그대로, 바깥 컨테이너에는 테두리(1px 양쪽)를 더한 값을 준다. */
        width?: number
        /** 목록의 최대 높이(px) - 0이면 제한 없음, 지정하면 세로 스크롤(overflow auto)되며 키보드 탐색 시 활성 항목이 보이도록 scrollTop도 맞춰준다. */
        height?: number
        /** 드롭다운의 초기 left 위치(px, absolute 기준) - show(x, y)나 move()로 이후 덮어쓸 수 있다. */
        left?: number
        /** 드롭다운의 초기 top 위치(px, absolute 기준) - show(x, y)나 move()로 이후 덮어쓸 수 있다. */
        top?: number
        /** 말풍선 꼬리 표시. */
        anchor?: boolean
        /** anchor(말풍선 꼬리)를 오른쪽 모서리에 붙인다(.anchor-right 클래스) - anchor가 true일 때만 의미가 있다. */
        anchorRight?: boolean
        /** 말풍선 꼬리(.anchor)의 left 위치 - 원본 dropdown.js는 이걸 계산하지 않는다(꼬리
         * 위치는 각 예제가 트리거 엘리먼트 기준으로 직접 css()로 박아준다). 컴포넌트에는
         * CSS 기본값(30px)만 있으므로, 트리거 위치에 맞춰야 하는 예제는 이 prop으로 넘긴다. */
        anchorLeft?: number
        /** 드롭다운 크기 스타일 - "large"는 더 넓은 폭/패딩의 변형. */
        size?: "normal" | "large"
        /** 트리거 기준 정렬 방향 - "right"면 오른쪽 끝에 맞춰 펼쳐진다(.right 클래스). */
        align?: "left" | "right"
        /** 위쪽으로 펼쳐지는 변형(.dropup). */
        dropup?: boolean
    }>(),
    {
        modelValue: false,
        items: undefined,
        close: true,
        keydown: false,
        width: 0,
        height: 0,
        left: 0,
        top: 0,
        anchor: false,
        anchorRight: false,
        anchorLeft: undefined,
        size: "normal",
        align: "left",
        dropup: false
    }
)

const emit = defineEmits<{
    /** v-model 동기화용 - show()/hide() 호출(또는 그걸 부르는 내부 상호작용)에 따라 true/false로 emit된다. */
    "update:modelValue": [value: boolean]
    /** 선택 가능한 항목(divider/title/disabled 제외)을 클릭했을 때 emit - close가 true면 곧이어 자동으로 닫힌다. */
    change: [payload: { index: number; value: string | null; text: string | null }, e: MouseEvent]
    /** modelValue가 true로 바뀌면 emit(동시에 이전에 열려있던 다른 Dropdown은 자동으로 닫힌다). */
    show: []
    /** modelValue가 false로 바뀌면 emit. */
    hide: []
    /** 항목 클릭 시 change와 함께(동일 payload로) emit - change와 구분해서 쓰고 싶을 때를 위한 별도 이벤트. */
    click: [payload: { index: number; value: string | null; text: string | null }, e: MouseEvent]
}>()

const ulEl = ref<HTMLElement | null>(null)
const activeIndex = ref(-1)
const pos = ref({ left: props.left as number | undefined, top: props.top as number | undefined })

// 원본은 opts.width가 주어지면 바깥 컨테이너(.dropdown)에도 그 너비를 그대로 css()로
// 박아준다. 여기서는 그동안 <ul>에만 width를 줬는데, dropdown.less의 `ul { position:
// absolute !important }` 때문에 ul이 정상 흐름에서 빠져 .dropdown이 아무 콘텐츠도 없는
// 것처럼 너비 0으로 붕괴한다 - 그 상태에서 .anchor(말풍선 꼬리)는 .dropdown 기준으로
// 우측 정렬되므로, 컨테이너 너비가 0이면 꼬리가 엉뚱하게 왼쪽으로 밀린다(dropdown_4에서
// items가 갱신된 뒤 재오픈할 때 실제로 이 어긋남이 관찰됨 - 프로덕션은 항상 컨테이너
// 너비가 제대로 잡혀 있어 발생하지 않는 문제). .dropdown 쪽에도 명시적으로 width를
// 줘서 이 붕괴를 막는다. 실측(uiplay.jui.io/?p=dropdown_4): 컨테이너는 opts.width+2,
// ul은 opts.width 그대로 - ul이 content-box라 1px 테두리(양쪽 2px)가 더해져서
// 렌더링 너비가 opts.width+2로 컨테이너와 맞아떨어진다.
const rootStyle = computed<CSSProperties>(() => ({
    position: "absolute",
    display: props.modelValue ? "block" : "none",
    left: pos.value.left ? pos.value.left + "px" : undefined,
    top: pos.value.top ? pos.value.top + "px" : undefined,
    width: props.width > 0 ? props.width + 2 + "px" : undefined
}))

const menuStyle = computed<CSSProperties>(() => ({
    display: "block",
    width: props.width > 0 ? props.width + "px" : undefined,
    maxHeight: props.height > 0 ? props.height + "px" : undefined,
    overflow: props.height > 0 ? "auto" : undefined
}))

function isSelectable(li: Element | null | undefined) {
    return li && !li.classList.contains("divider") && !li.classList.contains("title") && !li.classList.contains("disabled")
}

function onListClick(e: MouseEvent) {
    const li = (e.target as HTMLElement).closest("li")
    if (!li || !ulEl.value || !ulEl.value.contains(li)) return
    if (!isSelectable(li)) return

    const index = Array.from(ulEl.value.children).indexOf(li)
    const text = li.textContent
    const value = li.getAttribute("value")

    emit("change", { index, value, text }, e)
    emit("click", { index, value, text }, e)

    if (props.close) hide()
    if ((e.target as HTMLElement).tagName === "A") e.preventDefault()
}

function onListMouseOver() {
    activeIndex.value = -1
}

watch(activeIndex, (idx) => {
    if (!ulEl.value) return
    Array.from(ulEl.value.children).forEach((li, i) => li.classList.toggle("active", i === idx))
    if (idx >= 0 && props.height > 0) {
        const li = ulEl.value.children[idx] as HTMLElement | undefined
        if (li) ulEl.value.scrollTop = idx * li.offsetHeight
    }
})

function selectableCount() {
    return ulEl.value ? ulEl.value.children.length : 0
}

function wheel(key: number, callback?: () => void) {
    if (!props.keydown) return

    if (key === 9) {
        // Tab
        hide()
        return
    }

    const count = selectableCount()
    if (count === 0) return

    if (key === 38 || key === -1) {
        // up — 선택 불가능한(divider/title/disabled) 항목은 건너뛴다
        let idx = activeIndex.value
        for (let tries = 0; tries < count; tries++) {
            idx = idx < 1 ? count - 1 : idx - 1
            if (isSelectable(ulEl.value!.children[idx])) break
        }
        activeIndex.value = idx
        if (callback) callback()
    }

    if (key === 40 || key === 1) {
        // down
        let idx = activeIndex.value
        for (let tries = 0; tries < count; tries++) {
            idx = idx < count - 1 ? idx + 1 : 0
            if (isSelectable(ulEl.value!.children[idx])) break
        }
        activeIndex.value = idx
        if (callback) callback()
    }

    if (key === 13 || key === 0 || !key) {
        // enter
        const li = ulEl.value!.children[activeIndex.value]
        if (li) li.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        activeIndex.value = -1
        if (callback) callback()
    }
}

function show(x?: number, y?: number) {
    if (x !== undefined && y !== undefined) move(x, y)
    emit("update:modelValue", true)
}
function hide() {
    emit("update:modelValue", false)
}
function move(x: number, y: number) {
    pos.value = { left: x, top: y }
}

watch(
    () => props.modelValue,
    (v) => {
        if (v) {
            // "다른 Dropdown은 자동으로 닫힌다"(update:modelValue 문서 주석)는 이전엔 show()
            // 안에서만 호출돼서, v-model을 직접 조작(show()를 거치지 않고 부모가 바로 true로
            // 바꾸는 경우)하면 다른 Dropdown이 안 닫혔다 - modelValue가 실제로 true가 되는
            // 이 지점으로 옮겨서 두 경로가 동일하게 동작하게 한다.
            hideActive()
            activeDropdown = { hide, wheel }
            emit("show")
        } else {
            if (activeDropdown && activeDropdown.hide === hide) activeDropdown = null
            activeIndex.value = -1
            emit("hide")
        }
    }
)

onMounted(() => {
    installGlobalListenersOnce()
})
onBeforeUnmount(() => {
    if (activeDropdown && activeDropdown.hide === hide) activeDropdown = null
})

defineExpose({ show, hide, move, wheel })
</script>

<template>
    <div :class="[dropup ? 'dropup' : 'dropdown', size, { right: align === 'right' }]" :style="rootStyle">
        <div
            v-if="anchor"
            class="anchor"
            :class="{ 'anchor-right': anchorRight }"
            :style="anchorLeft !== undefined ? { left: anchorLeft + 'px' } : undefined"
        ></div>
        <ul ref="ulEl" :style="menuStyle" @click="onListClick" @mouseover="onListMouseOver">
            <template v-if="items">
                <li
                    v-for="(item, i) in items"
                    :key="i"
                    :value="item.value"
                    :class="{ divider: item.divider, title: item.title, disabled: item.disabled }"
                >
                    <a v-if="item.href !== undefined" :href="item.href">{{ item.text }}</a>
                    <template v-else>{{ item.text }}</template>
                </li>
            </template>
            <slot v-else />
        </ul>
    </div>
</template>
