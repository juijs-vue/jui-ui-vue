<script setup lang="ts">
// 원본(property.js)은 렌더러(renderer.text/select/number/range/checkbox/switch/date/
// color/colors/property/html/textarea)마다 마크업을 직접 jQuery로 조립했고, switch/
// datepicker/colorpicker 타입은 jui.create()로 각 컴포넌트를 재활용했다. Vue 버전도 동일한
// 재사용 전략을 쓴다 — Switch.vue/Datepicker.vue/Colorpicker.vue를 그대로 가져다 쓰고,
// property 타입은 이 컴포넌트 자신을 재귀적으로 사용한다(Vue SFC는 파일명 기준으로
// 자기 자신을 자동 등록하므로 별도 설정 없이 <Property> 재귀 참조가 가능하다).
// 원본은 items를 DOM에 직접 그려 넣고(jQuery), 그룹 접기/펼치기도 이후 형제 DOM 노드를
// while로 순회하며 show/hide 했다 — Vue 버전은 "각 행이 속한 그룹"을 미리 계산해두고
// collapsedGroups(Set)에 따라 v-show로 표시 여부만 반응형으로 바꾼다.
import { reactive, ref, computed, nextTick } from "vue"
import type { Ref } from "vue"
import Switch from "./Switch.vue"
import Datepicker from "./Datepicker.vue"
import Colorpicker from "./Colorpicker.vue"

// property.js 렌더러마다 실제로 쓰는 필드가 제각각이라(type에 따라 value의 실제 shape도
// string/number/boolean/string[]로 갈린다) 의미 있는 필드만 이름 붙이고, 나머지는 인덱스
// 시그니처로 열어둔다 - jui-grid-vue의 GridColumn과 달리 이 컴포넌트는 원래 "임의의 폼
// 스키마"를 그리는 용도라 완전히 닫힌 타입으로 만드는 게 오히려 원래 유연성을 해친다.
/** Property 컴포넌트가 그리는 폼 스키마의 한 행 - type에 따라 실제로 의미 있는 필드가 달라진다(예: number 전용 min/max/step, date 전용 titleFormat/format). */
interface PropertyItem {
    /** 렌더링할 입력 종류 - "group"은 접고 펼 수 있는 섹션 헤더로 그 아래 항목들을 묶고, 생략(undefined)하면 "text"와 동일하게 렌더링된다. */
    type?: "group" | "text" | "textarea" | "html" | "number" | "select" | "range" | "checkbox" | "switch" | "date" | "color" | "colors" | "property"
    /** getValue()/setValue()/updateValue() 등에서 항목을 식별하는 키 - getAllValue()가 반환하는 객체의 필드명으로도 쓰인다(그룹 항목은 key 없이 둬도 된다). */
    key?: string
    /** 항목 라벨 - 그룹이면 헤더 제목, 아니면 property-title에 표시되는 텍스트. */
    title?: string
    /** 현재 값 - type에 따라 실제 shape이 갈린다(text/number는 string/number, checkbox/switch는 boolean, colors는 string[] 등). */
    value?: unknown
    /** 입력을 읽기 전용으로 만든다(text/textarea/html/range 타입에서 지원). */
    readonly?: boolean
    /** textarea/html 타입 입력창의 높이(px, 기본 100). */
    height?: number
    /** number/range 타입의 최댓값(기본 100). */
    max?: number
    /** number/range 타입의 최솟값(기본 0). */
    min?: number
    /** number/range 타입의 증가 단위(기본 1). */
    step?: number
    /** range 타입 값 뒤에 붙는 단위 문자열(예: "%") - 화면 표시와 실제 저장되는 값 문자열 모두에 붙는다. */
    postfix?: string
    /** select 타입일 때는 (string | {text?, value})[], property 타입일 때는 중첩 PropertyItem[]. */
    items?: unknown[]
    /** 값 렌더링을 세로로 쌓을지 여부 - value가 배열(예: colors)이면 자동으로 세로 레이아웃이 적용되며, 이 prop으로 그 외의 경우에도 강제할 수 있다. */
    vertical?: boolean
    /** 그룹 헤더 옆 또는 필드 아래에 표시되는 설명 - HTML로 그대로 삽입되므로(v-html) 신뢰할 수 없는 소스를 쓸 경우 호출 측에서 sanitize가 필요하다. */
    description?: string
    /** type: "date" 항목의 달력 팝업 제목(연/월) 포맷 - Datepicker의 titleFormat으로 그대로 전달된다(기본 "yyyy. MM"). */
    titleFormat?: string
    /** type: "date" 항목이 저장/표시하는 날짜 문자열 포맷 - Datepicker의 format으로 그대로 전달된다(기본 "yyyy/MM/dd"). */
    format?: string
    /** 그 외 렌더러별로 필요한 임의의 필드를 열어둔다 - 완전히 닫힌 타입으로 만들면 원래의 폼 스키마 유연성을 해치기 때문. */
    [key: string]: unknown
}
interface PropertyExposed {
    getAllValue(): Record<string, unknown>
}

const props = withDefaults(
    defineProps<{
        /** 렌더링할 폼 스키마 - 각 항목은 그룹 헤더(type: "group") 또는 실제 입력 필드 하나. 컴포넌트가 처음 만들어질 때 한 번만 읽어 내부 상태(localItems)로 복사하며, 이후 prop이 바뀌어도 자동으로 반영되지 않는다 - 다시 불러오려면 loadItems()를 명시적으로 호출해야 한다. */
        items?: PropertyItem[]
    }>(),
    { items: () => [] }
)
const emit = defineEmits<{
    /** 값이 바뀔 때(입력/체크박스/날짜/색상 선택 등, 텍스트류는 debounce 적용) emit - item은 변경된 항목 자체(참조)이고, newValue/oldValue로 변경 전후 값을 함께 준다. */
    change: [item: PropertyItem, newValue: unknown, oldValue: unknown]
    /** loadItems() 호출로 전체 목록이 (재)로드된 직후 emit(마운트 시 최초 로드 포함, 이때 collapsedGroups도 초기화된다). */
    "load-items": []
}>()

function debounce<A extends unknown[]>(fn: (...args: A) => void, wait: number) {
    let timer: ReturnType<typeof setTimeout>
    return (...args: A) => {
        clearTimeout(timer)
        timer = setTimeout(() => fn(...args), wait)
    }
}

const localItems = reactive<PropertyItem[]>([])
const collapsedGroups = ref<Set<number>>(new Set())
const nestedPropertyRefs = ref<Record<number, PropertyExposed | null>>({}) // index -> 중첩 Property 인스턴스(nested의 getAllValue 조회용)

function loadItems(newItems?: PropertyItem[]) {
    localItems.splice(
        0,
        localItems.length,
        ...(newItems || []).map((it) => {
            const item = { ...it }
            return item
        })
    )
    collapsedGroups.value = new Set()
    emit("load-items")
}
loadItems(props.items)

function addItem(item: PropertyItem | PropertyItem[]) {
    const arr = Array.isArray(item) ? item : [item]
    localItems.push(...arr.map((it) => ({ ...it })))
}

function removeItem(item: PropertyItem) {
    const idx = localItems.findIndex((it) => it.key === item.key || it.title === item.title)
    if (idx >= 0) localItems.splice(idx, 1)
}

// 각 행(row)이 속한 그룹의 인덱스(그 그룹이 접히면 이 행도 숨는다) — 그룹 자신과, 어떤
// 그룹보다도 앞에 있는 행은 항상 보인다.
const rowGroupIndex = computed(() => {
    let current: number | null = null
    return localItems.map((item, i) => {
        if (item.type === "group") {
            current = i
            return null
        }
        return current
    })
})
function isVisible(i: number) {
    const g = rowGroupIndex.value[i]
    return g === null || !collapsedGroups.value.has(g)
}

function getGroupList() {
    return localItems
        .map((it, i) => ({ item: it, index: i }))
        .filter((x) => x.item.type === "group")
        .map((x) => ({ name: x.item.title, id: x.index }))
}

function collapsed(index: number) {
    const next = new Set(collapsedGroups.value)
    next.add(index)
    collapsedGroups.value = next
}
function expanded(index: number) {
    const next = new Set(collapsedGroups.value)
    next.delete(index)
    collapsedGroups.value = next
}
function toggleGroup(index: number) {
    if (collapsedGroups.value.has(index)) expanded(index)
    else collapsed(index)
}

function findIndexByKey(key: string) {
    return localItems.findIndex((it) => it.key === key)
}
function getItem(keyOrIndex: string | number) {
    if (typeof keyOrIndex === "number") return localItems[keyOrIndex]
    return localItems[findIndexByKey(keyOrIndex)]
}

function refreshValue(index: number, newValue: unknown) {
    const item = localItems[index]
    if (!item) return
    const oldValue = item.value
    item.value = newValue
    emit("change", item, newValue, oldValue)
}

function updateValue(key: string, value: unknown) {
    const index = findIndexByKey(key)
    if (index < 0) return
    refreshValue(index, value)
}

function getValue(key?: string) {
    if (key) return getItem(key)?.value
    return getAllValue()
}
function getAllValue(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    localItems.forEach((item) => {
        if (item.type !== "group" && item.key) result[item.key] = item.value
    })
    return result
}
function setValue(obj?: Record<string, unknown>) {
    obj = obj || {}
    Object.keys(obj).forEach((key) => updateValue(key, (obj as Record<string, unknown>)[key]))
}
function initValue(obj?: Record<string, unknown>) {
    localItems.forEach((item) => (item.value = ""))
    if (obj) setValue(obj)
}

const debouncedText = debounce((index: number, value: unknown) => refreshValue(index, value), 250)
const debouncedCheckbox = debounce((index: number, value: unknown) => refreshValue(index, value), 100)

function str2array(value: unknown, splitter = ","): unknown {
    return typeof value === "string" ? value.split(splitter) : value
}

function onTextInput(index: number, e: Event) {
    const item = localItems[index]
    const target = e.target as HTMLInputElement | HTMLTextAreaElement
    const value = Array.isArray(item.value) ? str2array(target.value) : target.value
    debouncedText(index, value)
}
function onHtmlInput(index: number, e: Event) {
    debouncedText(index, (e.target as HTMLElement).innerHTML)
}
function onNumberInput(index: number, e: Event) {
    debouncedText(index, +(e.target as HTMLInputElement).value)
}
function onSelectChange(index: number, e: Event) {
    const item = localItems[index]
    const target = e.target as HTMLSelectElement
    const value = Array.isArray(item.value) ? str2array(target.value) : target.value
    refreshValue(index, value)
}
function selectOptions(item: PropertyItem): { text?: string; value: string | number }[] {
    return ((item.items as (string | { text?: string; value: string | number })[]) || []).map((it) =>
        typeof it === "string" ? { text: it, value: it } : it
    )
}
function toggleCheckbox(index: number) {
    const item = localItems[index]
    const next = !(item.value === true || item.value === "true")
    debouncedCheckbox(index, next)
}

// ---- range ----
function rangeValue(item: PropertyItem) {
    const raw = item.value
    const postfix = item.postfix || ""
    const num = typeof raw === "string" && postfix ? raw.replace(postfix, "") : raw
    return +(num as string | number) || 0
}
const RANGE_INPUT_WIDTH = 100 // px — 원본이 인라인으로 고정한 input[type=range]의 너비
function rangeProgressPct(item: PropertyItem) {
    const min = item.min || 0,
        max = item.max || 100
    // 원본 공식 그대로: value/(max-min) * inputWidth (min을 빼지 않는다 — min!=0일 때도 동일)
    return (rangeValue(item) / (max - min)) * RANGE_INPUT_WIDTH
}
function onRangeInput(index: number, e: Event) {
    const item = localItems[index]
    const value = +(e.target as HTMLInputElement).value
    item.value = value + (item.postfix || "") // 즉시 시각 반영(progress bar/텍스트)
    debouncedText(index, value + (item.postfix || ""))
}

// ---- popup positioning ----
// .property-item에는 overflow:hidden이 걸려 있어서(그룹 접기 애니메이션 때문에 필요),
// date/color 팝업을 그 안에 그대로 두면 행 높이를 넘어가는 부분이 통째로 잘린다. 원본도
// 실제로는 팝업을 .property-table 바로 아래(각 행의 overflow:hidden 밖)에 붙이므로, 여기서도
// 팝업을 v-for 루프 밖으로 옮기고 트리거 엘리먼트의 위치를 직접 계산해서 붙인다.
//
// 원본(ui.min.js) 그대로의 공식 - "트리거 바로 아래"가 아니라 트리거 top에 타입별 고정
// 오프셋(date +80, color +50)을 더한 값이다(오버랩되어도 원본이 그렇다):
//   left = trigger.offset().left - root.offset().left
//          (넘치면 root.outerWidth() - popup.outerWidth() - 20 로 clamp)
//   top  = trigger.offset().top  - root.offset().top + OFFSET
//          (넘치면 root.outerHeight() - popup.outerHeight() - 20 로 clamp)
const rootEl = ref<HTMLElement | null>(null)
const popupPos = ref({ top: 0, left: 0 })
const popupReady = ref(false) // 위치 계산 전 프레임에 (0,0)으로 잠깐 보이는 걸 막는 플래그
const datepickerEl = ref<InstanceType<typeof Datepicker> | null>(null) // Datepicker 컴포넌트 인스턴스(.$el로 실제 DOM 취득)
const colorpickerEl = ref<InstanceType<typeof Colorpicker> | null>(null)
function unwrapEl(refValue: { $el?: unknown } | null): HTMLElement | null {
    return (refValue?.$el as HTMLElement | undefined) ?? null
}
function positionPopupAt(triggerEl: Element | null, popupRef: Ref<{ $el?: unknown } | null>, topOffset: number) {
    popupReady.value = false
    nextTick(() => {
        const popupEl = unwrapEl(popupRef.value)
        if (!triggerEl || !rootEl.value || !popupEl) return
        const rootRect = rootEl.value.getBoundingClientRect()
        const triggerRect = triggerEl.getBoundingClientRect()
        const rootWidth = rootEl.value.offsetWidth
        const rootHeight = rootEl.value.offsetHeight
        const popupWidth = popupEl.offsetWidth
        const popupHeight = popupEl.offsetHeight

        let left = triggerRect.left - rootRect.left
        if (left + popupWidth >= rootWidth) left = rootWidth - popupWidth - 20
        let top = triggerRect.top - rootRect.top + topOffset
        if (top + popupHeight >= rootHeight) top = rootHeight - popupHeight - 20

        popupPos.value = { top, left }
        popupReady.value = true
    })
}

// ---- date popup ----
const openDatePopup = ref<number | null>(null) // 열려있는 date 편집기의 index
function toggleDate(index: number, e: MouseEvent) {
    const next = openDatePopup.value === index ? null : index
    openDatePopup.value = next
    if (next !== null) positionPopupAt((e.currentTarget as HTMLElement).closest(".datepicker-input"), datepickerEl, 80)
}
function onDateSelect(index: number, formatted: string) {
    refreshValue(index, formatted)
    openDatePopup.value = null
}
const openDateItem = computed(() => (openDatePopup.value !== null ? localItems[openDatePopup.value] : null))

// ---- color / colors popup ----
const openColorPopup = ref<string | null>(null) // "index" 또는 "index:subIndex"(colors 타입)
function toggleColor(key: string, e: MouseEvent) {
    if (openColorPopup.value !== null && openColorPopup.value !== key) {
        // 원본: 이미 열린 colorpicker가 있으면(j.next('.colorpicker')) 위치는 그대로 두고
        // setColor()로 편집 대상 색상만 바꾼다 - 새로 만들거나 재배치하지 않는다.
        openColorPopup.value = key
        return
    }
    const next = openColorPopup.value === key ? null : key
    openColorPopup.value = next
    if (next !== null) positionPopupAt((e.currentTarget as HTMLElement).closest("a.color-input"), colorpickerEl, 50)
}
const openColorInfo = computed(() => {
    if (openColorPopup.value === null) return null
    const [idxStr, subStr] = String(openColorPopup.value).split(":")
    const index = +idxStr
    const item = localItems[index]
    if (!item) return null
    if (subStr !== undefined) return { index, subIndex: +subStr, value: (item.value as string[] | undefined)?.[+subStr] || "#ffffff" }
    return { index, subIndex: undefined as number | undefined, value: (item.value as string | undefined) || "#ffffff" }
})
function onColorChange(index: number, hex: string) {
    refreshValue(index, hex)
}
function onColorsChange(index: number, subIndex: number, hex: string) {
    const item = localItems[index]
    const colors = [...(item.value as string[])]
    colors[subIndex] = hex
    refreshValue(index, colors)
}
function clearColor(index: number) {
    refreshValue(index, "")
}

// 원본 getDefaultValue() — 현재 값이 아니라 props.items에 처음 주어진 초기값 스냅샷을
// 돌려준다(예: "변경사항이 있는지" 비교, "기본값으로 되돌리기" 용도).
function getDefaultValue(): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    props.items.forEach((it) => {
        if (it.type !== "group" && it.value !== undefined && it.key) result[it.key] = it.value
    })
    return result
}

defineExpose({
    loadItems,
    addItem,
    removeItem,
    getGroupList,
    collapsed,
    expanded,
    getValue,
    getAllValue,
    getDefaultValue,
    setValue,
    initValue,
    updateValue,
    getItem
})
</script>

<template>
    <div ref="rootEl" class="property-table" style="position: relative;">
        <template v-for="(item, index) in localItems" :key="index">
            <div v-show="isVisible(index)" class="property-item" :class="{ 'property-header-item': item.type === 'group', expanded: item.type === 'group' && !collapsedGroups.has(index), collapsed: item.type === 'group' && collapsedGroups.has(index), vertical: item.vertical || (item.type !== 'group' && Array.isArray(item.value)) }" :data-key="item.key" @click="item.type === 'group' ? toggleGroup(index) : null">
                <template v-if="item.type === 'group'">
                    <div class="property-header">
                        {{ item.title }}
                        <small v-if="item.description" class="description">{{ item.description }}</small>
                        <a class="expand-btn"><i :class="collapsedGroups.has(index) ? 'icon-plus' : 'icon-minus'"></i></a>
                    </div>
                </template>
                <template v-else>
                    <div class="property-title">{{ item.title }}</div>
                    <div class="property-render">
                        <div class="item">
                            <!-- text (기본) -->
                            <input
                                v-if="!item.type || item.type === 'text'"
                                type="text"
                                placeholder="Type here"
                                :readonly="item.readonly"
                                :value="item.value"
                                @input="onTextInput(index, $event)"
                            />

                            <textarea
                                v-else-if="item.type === 'textarea'"
                                :style="{ height: (item.height || 100) + 'px' }"
                                placeholder="Type here"
                                :readonly="item.readonly"
                                :value="item.value as string"
                                @input="onTextInput(index, $event)"
                            ></textarea>

                            <!-- 'html' 타입은 원본(renderer.html)도 $input.html(item.value)로 동일하게 동작했다.
                                 rich-text 편집기 자리라 HTML을 그대로 렌더링하는 게 기능 자체다 — items를
                                 신뢰할 수 없는 소스(사용자 입력, 외부 API 등)로 채운다면 호출 측에서 반드시
                                 sanitize한 값만 넘겨야 한다. -->
                            <!-- eslint-disable vue/no-v-html -->
                            <div
                                v-else-if="item.type === 'html'"
                                class="html"
                                :contenteditable="!item.readonly"
                                :style="{ height: (item.height || 100) + 'px' }"
                                @input="onHtmlInput(index, $event)"
                                v-html="item.value"
                            ></div>
                            <!-- eslint-enable vue/no-v-html -->

                            <input
                                v-else-if="item.type === 'number'"
                                type="number"
                                :max="item.max ?? 100"
                                :min="item.min ?? 0"
                                :step="item.step ?? 1"
                                :value="item.value"
                                @input="onNumberInput(index, $event)"
                            />

                            <select v-else-if="item.type === 'select'" style="max-width: 100%;" :value="item.value" @change="onSelectChange(index, $event)">
                                <option v-for="opt in selectOptions(item)" :key="opt.value" :value="opt.value">{{ opt.text }}</option>
                            </select>

                            <div v-else-if="item.type === 'range'" style="position: relative;">
                                <input
                                    type="range"
                                    style="width: 100px;"
                                    :max="item.max ?? 100"
                                    :min="item.min ?? 0"
                                    :step="item.step ?? 1"
                                    :readonly="item.readonly"
                                    :value="rangeValue(item)"
                                    @input="onRangeInput(index, $event)"
                                />
                                <div class="range-progress" :style="{ width: rangeProgressPct(item) + 'px' }"></div>
                                <span>{{ rangeValue(item) }}{{ item.postfix || "" }}</span>
                            </div>

                            <span v-else-if="item.type === 'checkbox'" @click="toggleCheckbox(index)">
                                <!-- 테마 CSS가 `input[type=checkbox] + .icon-checkbox`(형제 선택자)로 색을
                                     입히므로, 안 보이지만 실제 input을 아이콘 바로 앞에 둬야 한다. -->
                                <input type="checkbox" style="display: none;" :checked="item.value === true || item.value === 'true'" tabindex="-1" />
                                <i :class="item.value === true || item.value === 'true' ? 'icon-checkbox' : 'icon-checkbox2'"></i>
                            </span>

                            <Switch
                                v-else-if="item.type === 'switch'"
                                size="small"
                                inner
                                :model-value="item.value === true || item.value === 'true'"
                                @update:model-value="(v) => refreshValue(index, v)"
                            />

                            <div v-else-if="item.type === 'date'" class="datepicker-input" style="position: relative;">
                                <i class="icon-calendar" @click="toggleDate(index, $event)"></i>
                                <span class="datepicker-value-text" style="cursor: pointer;" @click="toggleDate(index, $event)">{{ item.value }}</span>
                            </div>

                            <div v-else-if="item.type === 'color'" style="position: relative;">
                                <a class="color-input" @click.stop="toggleColor(`${index}`, $event)">
                                    <span :style="{ backgroundColor: (item.value as string) || 'transparent' }">&nbsp;</span>
                                    <span>{{ (item.value as string) || "" }}</span>
                                    <span class="none-color" title="Delete a color" @click.stop="clearColor(index)"><i class="icon-more"></i></span>
                                </a>
                            </div>

                            <div v-else-if="item.type === 'colors'">
                                <span v-for="(c, ci) in item.value as string[]" :key="ci" style="position: relative; display: inline-block;">
                                    <a class="color-input" @click.stop="toggleColor(`${index}:${ci}`, $event)">
                                        <span :style="{ backgroundColor: c || 'transparent' }">&nbsp;</span>
                                        <span>{{ c || "" }}</span>
                                        <!-- 원본은 colors 배열이어도 delete 클릭 시 항목 하나만 지우지 않고
                                             item.value 전체를 빈 문자열로 덮어쓴다 — 그 동작을 그대로 둔다. -->
                                        <span class="none-color" title="Delete a color" @click.stop="clearColor(index)"><i class="icon-more"></i></span>
                                    </a>
                                </span>
                            </div>

                            <div v-else-if="item.type === 'property'" class="property inner">
                                <Property
                                    :ref="(el) => (nestedPropertyRefs[index] = el as unknown as PropertyExposed | null)"
                                    :items="item.items as PropertyItem[]"
                                    @change="() => refreshValue(index, nestedPropertyRefs[index]?.getAllValue())"
                                />
                            </div>
                        </div>

                        <!-- description도 원본이 HTML 그대로 삽입하던 필드다(링크 등을 넣는 용도) —
                             items를 신뢰할 수 없는 소스로 채운다면 호출 측에서 sanitize 필요. -->
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <div v-if="item.description" class="description" v-html="item.description"></div>
                    </div>
                </template>
            </div>
        </template>

        <!-- .property-item의 overflow:hidden 밖(행 클리핑을 피해서)에 팝업을 붙인다 - positionPopupAt()이
             연 시점의 트리거 위치를 읽어 popupPos에 좌표를 채워 넣는다.
             원본도 이 팝업을 .property-table이 아니라 그 부모(.property)에 형제로 붙인다 - .property는
             position:static이라 실제 containing block은 한 단계 더 위(.property-container)로 올라간다.
             popupPos 계산 자체는(원본과 동일하게) .property-table 기준 상대값이므로, 우리도 이 팝업을
             .property-table 밖(부모)으로 Teleport해야 같은 containing block 결과가 나온다 - 안에 그냥 두면
             .property-table 자신이 containing block이 되어 그만큼(.property-table의 offset) 더 아래로 밀린다. -->
        <Teleport v-if="rootEl" :to="rootEl.parentElement">
            <Datepicker
                v-if="openDateItem"
                ref="datepickerEl"
                :style="{ position: 'absolute', zIndex: 100000, top: popupPos.top + 'px', left: popupPos.left + 'px', visibility: popupReady ? 'visible' : 'hidden' }"
                :title-format="openDateItem.titleFormat || 'yyyy. MM'"
                :format="openDateItem.format || 'yyyy/MM/dd'"
                @select="(formatted) => onDateSelect(openDatePopup!, formatted)"
            />

            <Colorpicker
                v-if="openColorInfo"
                ref="colorpickerEl"
                :style="{ position: 'absolute', zIndex: 100000, top: popupPos.top + 'px', left: popupPos.left + 'px', visibility: popupReady ? 'visible' : 'hidden' }"
                :model-value="openColorInfo.value"
                @change="(hex) => (openColorInfo!.subIndex !== undefined ? onColorsChange(openColorInfo!.index, openColorInfo!.subIndex, hex) : onColorChange(openColorInfo!.index, hex))"
            />
        </Teleport>
    </div>
</template>
