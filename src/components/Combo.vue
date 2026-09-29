<script lang="ts">
// 원본(combo.js)은 "문서 아무 곳이나 클릭하면 열려있는 모든 콤보를 접는다"는 동작을
// 프로세스 전역 document 클릭 리스너 1개로 구현하고, 모든 ui.combo 인스턴스가 그 리스너를
// 공유한다(jui.get("ui.combo")로 전체 인스턴스 목록을 순회). Vue 버전도 컴포넌트 인스턴스
// 밖의 모듈 스코프 Set으로 "현재 열려있는 콤보들"을 추적해 동일하게 구현한다.
interface ComboHandle {
    fold: () => void
}
const openCombos = new Set<ComboHandle>()

function hideAll() {
    openCombos.forEach((c) => c.fold())
}

let globalListenerInstalled = false
function installGlobalListenerOnce() {
    if (globalListenerInstalled) return
    globalListenerInstalled = true
    document.addEventListener("click", hideAll)
}
</script>

<script setup lang="ts">
// 원본은 마크업 순서가 제각각이어도(텍스트 버튼/토글 버튼/ul의 DOM 순서가 예제마다 다름)
// init()에서 항상 $combo_drop.insertAfter($combo_text)로 "텍스트 버튼 다음에 목록"이 되게
// 강제로 재배치했다. Vue 버전은 처음부터 텍스트 버튼 → 목록(ul) → 토글 버튼 순서로 고정
// 렌더링해서 같은 결과를 재현한다(재배치 로직 자체가 불필요해짐).
// 원본의 getElement()(li 안에 <a>가 있으면 그 <a>를 쓰고, 아니면 li 자체를 쓰던 것)는
// items 배열의 항목에 href를 주면 <a>로, 안 주면 일반 텍스트로 렌더링하는 것으로 대체했다
// (Dropdown.vue와 동일한 방향의 단순화).
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue"
import type { CSSProperties } from "vue"

/** items prop의 각 항목 - Dropdown.vue의 DropdownItem과 유사한 규약을 쓴다(href가 있으면 <a>로, 없으면 텍스트만 렌더링). */
interface ComboItem {
    /** 선택 값 - modelValue/change/click 이벤트 payload에 쓰인다. */
    value?: string | number
    /** 목록과 선택된 텍스트 버튼에 표시할 텍스트. */
    text?: string
    /** 지정하면 <a href>로 렌더링(없으면 텍스트만). */
    href?: string
    /** 구분선 - 클릭/키보드 탐색 대상에서 제외된다. */
    divider?: boolean
}

const props = withDefaults(
    defineProps<{
        /** 드롭다운 목록에 표시할 항목. */
        items?: ComboItem[]
        /** v-model - 선택된 value. */
        modelValue?: string | number
        /** modelValue가 없을 때 기본 선택 인덱스. */
        index?: number
        /** 콤보 전체 폭(px) - 지정하면 텍스트 버튼 폭이 "width - 토글 버튼 폭 + 1"로 고정된다(0이면 텍스트 버튼이 내용에 맞춘 자연스러운 폭을 가진다). */
        width?: number
        /** 드롭다운 목록의 최대 높이(px, 기본 100) - 넘치면 세로 스크롤된다. */
        height?: number
        /** 열려있는 동안 방향키(위/아래)로 항목을 탐색하고 Enter로 선택할 수 있게 한다. */
        keydown?: boolean
        /** 드롭다운 목록이 펼쳐지는 방향 - "top"이면 토글 버튼 위로, "bottom"(기본)이면 아래로 펼쳐진다. */
        position?: "top" | "bottom"
        /** true(기본)면 목록 폭을 항목 내용 중 가장 넓은 것에 맞춰 늘린다(콤보 자체 폭보다 넓어질 수 있다) - false면 콤보 폭에 딱 맞춘다. */
        flex?: boolean
        /** 버튼 크기 스타일 - "small"은 더 작은 패딩/폰트의 변형. */
        size?: "normal" | "small"
        /** 원본 데모 중에는 opts.width 없이 마크업(.btn)에 style="width:175px"만 직접 줘서
         * 텍스트 버튼 폭을 고정한 경우가 있다(combo_1) - width prop(opts.width와 동일하게
         * "toggle 버튼 폭을 뺀 나머지"를 계산)과 별개로, 그 raw 스타일 지정 경로를 위한 prop. */
        textStyle?: CSSProperties
    }>(),
    {
        items: () => [],
        modelValue: undefined,
        index: 0,
        width: 0,
        height: 100,
        keydown: false,
        position: "bottom",
        flex: true,
        size: "normal",
        textStyle: () => ({})
    }
)

const emit = defineEmits<{
    /** v-model 동기화용 - 항목 클릭이나 setIndex()/setValue() 호출로 선택이 바뀔 때마다 emit된다. */
    "update:modelValue": [value: string | number]
    /** 선택이 바뀔 때(클릭이든 setIndex()/setValue() 같은 프로그래매틱 호출이든) 항상 emit된다. */
    change: [payload: { index: number; value: string | number | undefined; text: string | undefined }]
    /** 사용자가 항목을 직접 클릭해서 선택이 바뀐 경우에만 emit - setIndex()/setValue() 호출로는 emit되지 않는다. */
    click: [payload: { index: number; value: string | number | undefined; text: string | undefined }]
    /** 드롭다운 목록이 열릴 때(open() 호출 시) emit. */
    open: []
    /** 드롭다운 목록이 닫힐 때(fold() 호출 시, 문서 클릭 등으로 자동으로 닫히는 경우 포함) emit. */
    fold: []
}>()

const rootEl = ref<HTMLElement | null>(null)
const dropEl = ref<HTMLElement | null>(null)
const toggleEl = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const activeIndex = ref(-1)
const dropWidth = ref<number | null>(null)
const textWidth = ref<number | null>(null)

const selectedIndex = computed(() => {
    if (props.modelValue !== undefined) {
        const i = props.items.findIndex((it) => String(it.value) === String(props.modelValue))
        if (i >= 0) return i
    }
    return props.index
})
const selectedItem = computed(() => props.items[selectedIndex.value])

const computedTextStyle = computed<CSSProperties>(() => ({
    ...(props.width > 0 && textWidth.value !== null
        ? { width: textWidth.value + "px", overflow: "hidden", whiteSpace: "nowrap" }
        : {}),
    ...props.textStyle
}))
const dropStyle = computed<CSSProperties>(() => ({
    // .combo > ul은 CSS(combo.less)에서 이미 display:none이므로, v-show가 인라인 스타일을
    // ""로 되돌리는 것만으로는(=인라인 오버라이드 없음) 클래스의 display:none이 그대로 이겨
    // 버린다(Dropdown.vue에서 겪은 것과 같은 문제) — 그래서 v-show 대신 여기서 직접
    // "block"/"none"을 명시한다.
    display: isOpen.value ? "block" : "none",
    overflowX: props.height > 0 ? "hidden" : undefined,
    overflowY: props.height > 0 ? "auto" : undefined,
    maxHeight: props.height > 0 ? props.height + "px" : undefined,
    width: dropWidth.value !== null ? dropWidth.value + "px" : undefined,
    top: props.position === "top" ? "auto" : undefined,
    bottom: props.position === "top" ? "100%" : undefined
}))

function isSelectable(li: Element | null | undefined) {
    return li && !li.classList.contains("divider")
}

async function open() {
    hideAll()
    isOpen.value = true
    openCombos.add(combo)
    emit("open")

    await nextTick()
    if (rootEl.value && dropEl.value) {
        dropWidth.value = rootEl.value.getBoundingClientRect().width - 1
        if (props.flex) {
            let maxWidth = 0
            Array.from(dropEl.value.children).forEach((li) => {
                maxWidth = Math.max(maxWidth, (li as HTMLElement).scrollWidth + 20)
            })
            if (maxWidth > dropWidth.value) dropWidth.value = maxWidth + 50
        }
    }
}
function fold() {
    isOpen.value = false
    openCombos.delete(combo)
    emit("fold")
}
function toggle(e?: MouseEvent) {
    if (isOpen.value) return
    e?.stopPropagation()
    open()
}

function selectByIndex(index: number, e?: MouseEvent) {
    const item = props.items[index]
    if (!item || item.divider) return
    emit("update:modelValue", item.value as string | number)
    emit("change", { index, value: item.value, text: item.text })
    if (e) {
        emit("click", { index, value: item.value, text: item.text })
        e.preventDefault()
    }
}

function onItemClick(item: ComboItem, index: number, e: MouseEvent) {
    // divider는 "클릭 대상에서 제외"돼야 하므로(items prop 문서 참고) hideAll()도 여기서
    // 걸러야 한다 - 아니면 divider를 클릭했을 뿐인데 이 콤보를 포함해 열려있는 다른 콤보까지
    // 전부 닫혀버린다.
    if (item.divider) return
    hideAll()
    selectByIndex(index, e)
}

function setIndex(index: number) {
    const item = props.items[index]
    if (!item || item.divider) return
    emit("update:modelValue", item.value as string | number)
    emit("change", { index, value: item.value, text: item.text })
}
function setValue(value: string | number) {
    const index = props.items.findIndex((it) => String(it.value) === String(value))
    if (index < 0 || props.items[index].divider) return
    emit("update:modelValue", value)
    emit("change", { index, value, text: props.items[index].text })
}
function getData() {
    return selectedItem.value
        ? { index: selectedIndex.value, value: selectedItem.value.value, text: selectedItem.value.text }
        : null
}
function getValue() {
    return selectedItem.value ? selectedItem.value.value : null
}
function getText() {
    return selectedItem.value ? selectedItem.value.text : null
}

function onWindowKeydown(e: KeyboardEvent) {
    if (!props.keydown || !isOpen.value) return
    const count = props.items.length
    if (count === 0) return

    if (e.which === 38) {
        // up — divider는 건너뛴다
        let idx = activeIndex.value
        for (let tries = 0; tries < count; tries++) {
            idx = idx < 1 ? count - 1 : idx - 1
            if (isSelectable(dropEl.value?.children[idx])) break
        }
        activeIndex.value = idx
        e.preventDefault()
    }

    if (e.which === 40) {
        // down
        let idx = activeIndex.value
        for (let tries = 0; tries < count; tries++) {
            idx = idx < count - 1 ? idx + 1 : 0
            if (isSelectable(dropEl.value?.children[idx])) break
        }
        activeIndex.value = idx
        e.preventDefault()
    }

    if (e.which === 13) {
        // enter
        if (activeIndex.value >= 0) {
            hideAll()
            selectByIndex(activeIndex.value)
        }
    }
}

const combo: ComboHandle = { fold }

onMounted(async () => {
    installGlobalListenerOnce()
    if (props.keydown) {
        activeIndex.value = selectedIndex.value
        window.addEventListener("keydown", onWindowKeydown)
    }
    if (props.width > 0) {
        await nextTick()
        // 아이콘 폰트(icomoon 등)가 비동기로 로드되는 동안에는 toggle 버튼의 아이콘이 폴백
        // 글리프로 그려져서 offsetWidth가 최종 값보다 작게 측정될 수 있다 - 폰트가 실제로
        // 준비된 뒤 재보정한다.
        if (document.fonts?.ready) await document.fonts.ready
        // 원본: $combo_text.outerWidth(opts.width - $combo_toggle.outerWidth() + 1)
        textWidth.value = props.width - (toggleEl.value ? toggleEl.value.offsetWidth : 0) + 1
    }
})
onBeforeUnmount(() => {
    openCombos.delete(combo)
    window.removeEventListener("keydown", onWindowKeydown)
})

watch(isOpen, (v) => {
    if (!v) activeIndex.value = -1
})

defineExpose({ setIndex, setValue, getData, getValue, getText, open, fold })
</script>

<template>
    <div ref="rootEl" class="combo" :class="{ open: isOpen }" @click.stop>
        <!-- 텍스트 버튼/ul/토글 버튼을 같은 줄에서 공백 하나로 이어붙인다 - .combo가 쓰는
             .children-group()의 -7px 형제 마진은 원본의 줄바꿈 마크업이 만드는 공백 렌더링을
             전제로 튜닝된 값이라, Vue가 그 공백을 지워버리면 (ButtonGroup/AutoComplete와 같은
             이유로) 텍스트 버튼과 토글 버튼이 프로덕션보다 몇 px 더 겹친다. -->
        <a class="btn" :class="{ small: size === 'small' }" :style="computedTextStyle" @click="toggle">
            {{ selectedItem ? selectedItem.text : "Select..." }}
        </a> <ul ref="dropEl" :style="dropStyle">
            <li
                v-for="(item, i) in items"
                :key="i"
                :value="item.value"
                :class="{ divider: item.divider, active: activeIndex === i }"
                @click="onItemClick(item, i, $event)"
            >
                <a v-if="item.href !== undefined" :href="item.href">{{ item.text }}</a>
                <template v-else>{{ item.text }}</template>
            </li>
        </ul> <a ref="toggleEl" class="btn toggle" :class="{ active: isOpen, small: size === 'small' }" @click="toggle">
            <i class="icon-arrow2"></i>
        </a>
    </div>
</template>
