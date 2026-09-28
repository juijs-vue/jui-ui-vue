<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, markRaw, nextTick } from "vue"
import type { CSSProperties } from "vue"
import Dropdown from "./Dropdown.vue"

interface TabItem {
    text?: string
    value?: string | number
    disabled?: boolean
    content?: unknown
    contentProps?: Record<string, unknown>
}
interface MenuItem {
    text?: string
    value?: string | number
    divider?: boolean
}

// 원본처럼 컴포넌트가 탭 목록을 직접 들고 있다가(localItems), 아래 defineExpose로
// update/insert/append/prepend/remove/move/enable/disable/show/activeIndex 메서드를 제공한다.
// items prop은 "초기값 + 외부에서 통째로 교체할 때"만 쓰고, 그 외 변경은 메서드로 한다.
//
// 탭 콘텐츠 연결 방식(둘 다 지원, item.content가 있으면 그쪽이 우선):
//   1) 정적으로 미리 아는 탭 → 부모 템플릿에 #panel-{value} 슬롯을 선언 (value 기준이라 순서가
//      바뀌어도 깨지지 않는다 — index 기준이면 move/insert 때 콘텐츠가 엉뚱한 탭에 붙는다)
//   2) append()/insert() 등으로 동적으로 추가하는 탭 → 슬롯을 미리 선언해둘 수 없으므로,
//      node에 content로 실제 컴포넌트(또는 렌더 함수)를 실어 보낸다. <component :is="item.content">
//      로 렌더링하므로, 그 자리에서 동적으로 만든 컴포넌트/템플릿을 그대로 지정할 수 있다.
const props = withDefaults(
    defineProps<{
        items: TabItem[]
        /** 활성 탭의 index. */
        modelValue?: number
        position?: "top" | "bottom"
        /** examples/tab.html의 .tab / .pill 두 스타일과 동일. */
        variant?: "tab" | "pill"
        /** 원본 opts.drag - 마우스로 끌어서 탭 순서 재정렬. */
        drag?: boolean
        /** 원본 tpl.menu 오버플로우 드롭다운에 대응. 주어지면 탭 목록 끝에 "Menu" 항목이 추가된다. */
        menu?: MenuItem[]
        /** 원본 데모들은 탭 목록(#tab_N)과 콘텐츠 영역(#tab_contents_N)이 별개의 최상위
         * 엘리먼트라 콘텐츠 쪽에만 배경 등을 따로 줄 수 있었다(예: background:#dcdcdc).
         * 이 컴포넌트는 콘텐츠를 내부의 .jui-tab-content래퍼로 감싸므로, 그 스타일을
         * 바깥에서 지정할 수 있게 prop으로 노출한다. */
        contentStyle?: string | CSSProperties | CSSProperties[]
    }>(),
    {
        modelValue: 0,
        position: "top",
        variant: "tab",
        drag: false,
        menu: undefined,
        contentStyle: undefined
    }
)

const emit = defineEmits<{
    "update:modelValue": [index: number]
    "update:items": [items: TabItem[]]
    change: [payload: { index: number; item: TabItem }, e?: MouseEvent]
    click: [payload: { index: number; item: TabItem }, e: MouseEvent]
    dragstart: [index: number, e: MouseEvent]
    dragend: [index: number, e: MouseEvent]
    menu: [payload: { text: string }, e: MouseEvent]
    changemenu: [payload: { index: number; value: string | number | undefined; text: string | undefined }]
}>()

// item 객체를 얕은 복사해서 들고 있는다 — enable/disable 등이 부모가 넘긴 원본 객체를
// 직접 mutate하지 않도록 하기 위함(props는 mutate하면 안 되므로).
// content(컴포넌트 정의)는 markRaw로 감싸서 반응형 프록시 대상에서 제외한다 —
// 안 그러면 Vue가 컴포넌트 객체 자체를 reactive()로 감싸려다 경고를 낸다.
function normalizeItem(item: TabItem): TabItem {
    return item.content ? { ...item, content: markRaw(item.content as object) } : { ...item }
}

const localItems = ref(props.items.map(normalizeItem))
watch(
    () => props.items,
    (next) => {
        localItems.value = next.map(normalizeItem)
    }
)

function syncItems() {
    emit("update:items", localItems.value.slice())
}

// 원본 setActiveNode()와 동일한 안전장치 — modelValue가 가리키는 탭이 disabled면
// (또는 범위를 벗어나면) 첫 번째로 활성화 가능한 탭으로 자동 폴백한다.
// 렌더링은 항상 이 값을 기준으로 해서, 부모에게 보정값을 emit하는 왕복 없이 바로 맞는 화면을 그린다.
const effectiveIndex = computed(() => {
    const current = localItems.value[props.modelValue]
    if (current && !current.disabled) return props.modelValue

    const fallback = localItems.value.findIndex((item) => !item.disabled)
    return fallback === -1 ? props.modelValue : fallback
})
watch(
    effectiveIndex,
    (idx) => {
        if (idx !== props.modelValue) emit("update:modelValue", idx)
    },
    { immediate: true }
)

const suppressClick = ref(false)

// change/click 핸들러가 alert()처럼 동기적으로 화면을 멈추는 경우에도, 탭이 이미 전환된
// 상태로 "보이도록" 한다(원본은 jQuery로 DOM을 동기 조작한 뒤에 emit했지만, Vue는
// 리렌더링이 비동기라 순서를 맞춰줘야 한다).
// - nextTick(): Vue가 실제 DOM을 패치할 때까지 기다린다 (여기까지만 하면 DOM은 맞지만
//   브라우저가 그걸 화면에 "그리기" 전에 alert()이 열려버릴 수 있다)
// - requestAnimationFrame을 두 번 연속: 첫 rAF는 "다음 프레임이 그려지기 직전"에
//   불려서 아직 페인트 전이고, 그 안에서 또 rAF를 걸어야 그 프레임의 페인트가 끝난
//   뒤(두 번째 rAF)에야 실행된다 — 한 번만 기다리면(홑 rAF) 페인트 전에 alert()이
//   열려서 소용없었다.
function waitForPaint() {
    return nextTick().then(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
}

async function selectTab(index: number, item: TabItem, e: MouseEvent) {
    if (suppressClick.value || item.disabled || index === effectiveIndex.value) return

    emit("update:modelValue", index)
    await waitForPaint()
    emit("change", { index, item }, e)
    emit("click", { index, item }, e)
}

function reorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return

    const next = localItems.value.slice()
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    localItems.value = next

    // 옮긴 탭이 활성 탭이었다면 활성 인덱스도 새 위치를 따라간다.
    // (원본은 activeIndex를 targetIndex로 무조건 고정시키는데, 여기서는 실제로 옮긴 탭을
    //  기준으로 따라가게 해 어떤 탭을 옮기든 선택 상태가 예측 가능하게 유지되도록 했다.)
    if (effectiveIndex.value === fromIndex) {
        emit("update:modelValue", toIndex)
    }

    syncItems()
}

// --- 마우스 드래그 재정렬 ---
const dragIndex = ref<number | null>(null)

function onDragStart(index: number, e: MouseEvent) {
    if (!props.drag) return

    // 없으면 <a> 태그의 네이티브 드래그 제스처가 끼어들어서, 드래그 도중 다른 탭으로 넘어갈 때
    // mouseenter 자체가 안 울린다(재정렬이 즉시 반영되지 않고 부자연스럽게 느껴지던 원인).
    e.preventDefault()
    dragIndex.value = index
    emit("dragstart", index, e)
}

function onDragEnter(targetIndex: number) {
    if (dragIndex.value === null || dragIndex.value === targetIndex) return

    suppressClick.value = true
    reorder(dragIndex.value, targetIndex)
    dragIndex.value = targetIndex
}

function onDragEnd(e: MouseEvent) {
    if (dragIndex.value === null) return

    emit("dragend", dragIndex.value, e)
    dragIndex.value = null

    // 드래그로 재정렬된 직후 동일 tick에 따라오는 click(selectTab)을 한 프레임 눌러둔다.
    requestAnimationFrame(() => {
        suppressClick.value = false
    })
}

// --- 오버플로우 메뉴(드롭다운) ---
// 원본은 이 "Menu" 항목의 드롭다운을 li 안에 직접 그리지 않고, 실제 ui.dropdown
// 컴포넌트를 body 쪽에 별도로 붙여서 트리거 위치로 show(x, y)를 호출해 띄운다
// (uiplay.jui.io/?p=tab_5의 실제 DOM: <ul class="tab">...</ul> 뒤에 완전히 별개로
// <div id="dd_1" class="dropdown large">가 나온다). 여기서도 같은 Dropdown.vue를
// 재사용해 li 바깥의 형제로 렌더링하고, 클릭 시 트리거의 위치를 측정해 show(x, y)로
// 띄운다 - li 안에 직접 그리던 예전 방식은 구조(tag)가 아예 달라 프로덕션과 diff났다.
const menuOpen = ref(false)
const tabRoot = ref<HTMLElement | null>(null)
const menuDropdownRef = ref<InstanceType<typeof Dropdown> | null>(null)

const menuDropdownItems = computed(() => (props.menu || []).map((m) => ({ ...m })))

function onMenuClick(e: MouseEvent) {
    emit("menu", { text: "menu" }, e)

    if (menuOpen.value) {
        menuOpen.value = false
        if (menuDropdownRef.value) menuDropdownRef.value.hide()
        return
    }

    // Dropdown.vue의 .dropdown은 position:absolute이고 그 사이에 position이 걸린
    // 조상이 없으므로(우리도, 프로덕션도 tabRoot에 position:relative를 주지 않는다),
    // 컨테이닝 블록은 초기 컨테이닝 블록(문서 전체)이다 - 즉 top/left는 tabRoot
    // 기준 상대 좌표가 아니라 문서 전체 기준 절대 좌표여야 한다(실측: 프로덕션의
    // dd_1 top은 트리거 li의 viewport 기준 bottom과 거의 일치, tabRoot의 top을
    // 빼면 오히려 어긋난다).
    const li = e.currentTarget as HTMLElement
    const rect = li.getBoundingClientRect()
    menuOpen.value = true
    if (menuDropdownRef.value) {
        menuDropdownRef.value.show(rect.left + window.scrollX, rect.bottom + window.scrollY)
    }
}

function onMenuDropdownChange(data: { index: number; value: string | null; text: string | null }) {
    menuOpen.value = false
    emit("changemenu", { index: data.index, value: data.value ?? undefined, text: data.text ?? undefined })
}

function onDocumentClick(e: MouseEvent) {
    if (menuOpen.value && tabRoot.value && !tabRoot.value.contains(e.target as Node)) {
        menuOpen.value = false
    }
}

// setup() 최상위에서 바로 document를 참조하면 SSR(예: Nuxt) 환경에서 document가 없어 크래시난다 —
// onMounted 안에서만(브라우저에서만 실행됨을 보장) 등록한다.
onMounted(() => document.addEventListener("click", onDocumentClick))
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick))

// --- 원본 API와 동일한 명령형 메서드들 (템플릿 ref로 받아서 호출) ---

/** 원본 update(nodes) — 탭 목록을 통째로 교체. node = { text, value, disabled?, content?, contentProps? } */
function update(nodes: TabItem[]) {
    localItems.value = nodes.map(normalizeItem)
    syncItems()
}

/** 원본 insert(index, node) — 지정 위치에 탭 추가 */
function insert(index: number, node: TabItem) {
    const next = localItems.value.slice()
    next.splice(index, 0, normalizeItem(node))
    localItems.value = next
    syncItems()
}

/** 원본 append(node) — 맨 뒤에 탭 추가. 슬롯을 미리 못 선언하니 node.content로 컴포넌트를 실어 보내면 된다 */
function append(node: TabItem) {
    localItems.value = [...localItems.value, normalizeItem(node)]
    syncItems()
}

/** 원본 prepend(node) — 맨 앞에 탭 추가 */
function prepend(node: TabItem) {
    localItems.value = [normalizeItem(node), ...localItems.value]
    syncItems()
}

/** 원본 remove(index) — 지정 인덱스의 탭 제거 */
function remove(index: number) {
    const next = localItems.value.slice()
    next.splice(index, 1)
    localItems.value = next
    syncItems()
}

/** 원본 move(index, targetIndex) — 탭 위치 변경(드래그와 동일 로직, 이벤트는 emit하지 않음) */
function move(index: number, targetIndex: number) {
    reorder(index, targetIndex)
}

/** 원본 show(index) — 프로그래매틱하게 탭 활성화(click과 달리 change만 emit) */
async function show(index: number) {
    const item = localItems.value[index]
    if (!item || item.disabled || index === effectiveIndex.value) return

    emit("update:modelValue", index)
    await waitForPaint() // selectTab과 동일한 이유
    emit("change", { index, item })
}

/** 원본 enable(index) — 비활성 탭을 다시 활성화 가능하게 전환 */
function enable(index: number) {
    if (index === effectiveIndex.value || !localItems.value[index]) return
    localItems.value[index].disabled = false
    syncItems()
}

/** 원본 disable(index) — 탭을 비활성화(현재 선택된 탭은 비활성화 불가) */
function disable(index: number) {
    if (index === effectiveIndex.value || !localItems.value[index]) return
    localItems.value[index].disabled = true
    syncItems()
}

/** 원본 activeIndex() — 현재 활성 탭의 인덱스(disabled 폴백 반영된 실제 값) */
function activeIndex() {
    return effectiveIndex.value
}

defineExpose({ update, insert, append, prepend, remove, move, show, enable, disable, activeIndex })
</script>

<template>
    <!--
      원본은 <ul class="tab ...">가 공 루트 엘리먼트이고, 콘텐츠 영역(#tab_contents_N)은
      완전히 별개의 최상위 형제 엘리먼트다 — 감싸는 div가 없다. Vue 3는 다중 루트(Fragment)
      템플릿을 지원하므로 여기서도 <ul>과 .jui-tab-content를 진짜 형제로 렌더링한다.
      position="bottom"일 때 원본은 CSS order가 아니라 실제 DOM 순서를 바꿐서 콘텐츠를
      위로 올린다(감싸는 flex 부모가 없어 order가 먹히지 않는다), 여기서도 v-if로
      콘텐츠 블록을 ul 앞/뒤 중 한쪽에만 렌더링해 순서 자체를 바꾼다(콘텐츠 쪽
      마크업만 두 번 적었다 — ul 쪽은 드래그/메뉴 로직이 얽혀 있어 중복시키지 않기 위함).
    -->
    <div v-if="position === 'bottom'" class="jui-tab-content" :style="contentStyle">
        <div v-for="(item, idx) in localItems" v-show="idx === effectiveIndex" :key="item.value ?? idx">
            <component
                :is="item.content"
                v-if="typeof item.content === 'object' || typeof item.content === 'function'"
                v-bind="item.contentProps"
            />
            <slot v-else :name="`panel-${item.value}`" :item="item" :index="idx" />
        </div>
    </div>

    <ul ref="tabRoot" :class="[variant, position]" @mouseup="onDragEnd">
        <li
            v-for="(item, index) in localItems"
            :key="item.value ?? index"
            :class="{ active: index === effectiveIndex, disabled: item.disabled }"
            @click="selectTab(index, item, $event)"
            @mousedown="onDragStart(index, $event)"
            @mouseenter="onDragEnter(index)"
        >
            <a href="javascript:void(0)">{{ item.text }}</a>
            <div v-if="index === effectiveIndex" class="anchor"></div>
        </li>
        <li v-if="menu && menu.length" class="menu" :class="{ checked: menuOpen }" @click="onMenuClick">
            <a href="javascript:void(0)">Menu <i class="icon-arrow1"></i></a>
        </li>
    </ul>

    <div v-if="position !== 'bottom'" class="jui-tab-content" :style="contentStyle">
        <div v-for="(item, idx) in localItems" v-show="idx === effectiveIndex" :key="item.value ?? idx">
            <component
                :is="item.content"
                v-if="typeof item.content === 'object' || typeof item.content === 'function'"
                v-bind="item.contentProps"
            />
            <slot v-else :name="`panel-${item.value}`" :item="item" :index="idx" />
        </div>
    </div>

    <!-- 프로덕션(uiplay.jui.io/?p=tab_5)의 실제 DOM 순서: ul, 콘텐츠, (숨겨진 template
         스크립트,) 드롭다운 - 오버플로우 메뉴 드롭다운이 콘텐츠보다 뒤에 온다. -->
    <Dropdown
        v-if="menu && menu.length"
        ref="menuDropdownRef"
        v-model="menuOpen"
        :items="menuDropdownItems"
        size="large"
        :width="150"
        @change="onMenuDropdownChange"
    />
</template>

<style scoped>
.menu {
    position: relative;
}
</style>
