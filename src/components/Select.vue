<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue"

// 원본(select.js)은 커스텀 셀렉트박스로, title을 클릭하면 items 목록이 드롭다운으로 열리고
// 바깥을 클릭하면 닫힌다. text/html이 함수일 수도 있는 원본 렌더러 규칙을 그대로 옮겼다.
type SelectValue = string | number
interface SelectItemObject {
    /** 항목의 값. divider 항목처럼 값이 없을 수도 있으며, 그 경우 선택 판정(isSelected)에서 항상 제외된다. */
    value?: SelectValue
    /** 항목에 표시할 텍스트. 함수로 주면 this가 이 아이템 객체로 바인딩되어 호출된 결과가 표시된다. */
    text?: string | ((this: SelectItemObject) => string)
    /** text 대신 HTML을 그대로 삽입하고 싶을 때 사용(v-html로 렌더링, 지정되면 text보다 우선함). 신뢰할 수 없는 소스라면 호출 측에서 sanitize된 값만 넘겨야 한다. */
    html?: string | ((this: SelectItemObject) => string)
    /** "divider"면 클릭할 수 없는 구분선(hr)으로 렌더링되고 선택/클릭이 모두 무시된다. */
    type?: "divider"
    /** modelValue를 지정하지 않았을 때만 초기 선택값을 결정하는 데 쓰인다(modelValue가 있으면 무시됨). */
    selected?: boolean
}
type SelectItem = string | SelectItemObject

const props = withDefaults(
    defineProps<{
        /** string[] 또는 { value, text?, html?, type?: 'divider' }[]. */
        items?: SelectItem[]
        /** multi=false: value 하나 / multi=true: value 배열. */
        modelValue?: SelectValue | SelectValue[]
        /** 다중 선택 여부. true면 값이 배열이 되고 항목 클릭마다 선택/해제가 토글된다. 기본값 false. */
        multi?: boolean
        /** 아무 항목도 선택되지 않았을 때 title 영역에 표시할 문구. 기본값 "Select a item". */
        placeholder?: string
        /** 드롭다운 items 목록의 좌우 정렬(select-left/select-right 클래스). 기본값 "left". */
        align?: "left" | "right"
        /** 드롭다운 items 목록이 title 기준 위/아래 어느 쪽으로 펼쳐질지(select-top/select-bottom 클래스). 기본값 "top". */
        valign?: "top" | "bottom"
    }>(),
    {
        items: () => [],
        modelValue: undefined,
        multi: false,
        placeholder: "Select a item",
        align: "left",
        valign: "top"
    }
)

const emit = defineEmits<{
    /** v-model 동기화용 - 항목 클릭이나 setValue/setSelectedIndex 호출로 값이 바뀔 때 발생한다. */
    "update:modelValue": [value: SelectValue | SelectValue[]]
    /** update:modelValue와 같은 시점에 함께 발생하며, 새 값과 변경 전 값(prevValue, 최초 선택 시엔 undefined)을 같이 전달한다. */
    change: [value: SelectValue | SelectValue[], prevValue: SelectValue | SelectValue[] | undefined]
}>()

// 원본처럼 문자열 아이템은 { text: it, value: it }로 정규화한다.
const normalizedItems = computed<SelectItemObject[]>(() =>
    props.items.map((it) => (typeof it === "string" ? { text: it, value: it } : it))
)

function callOrValue(fn: string | ((this: SelectItemObject) => string) | undefined, item: SelectItemObject) {
    return typeof fn === "function" ? fn.call(item) : fn
}

const open = ref(false)
const rootRef = ref<HTMLElement | null>(null)

// modelValue 없이 쓰는 경우, items의 selected:true를 초기값으로 삼는다(원본 update()와 동일)
function initialValue(): SelectValue | SelectValue[] | undefined {
    if (props.multi) {
        return normalizedItems.value.filter((it) => it.selected).map((it) => it.value as SelectValue)
    }
    const selected = normalizedItems.value.find((it) => it.selected)
    return selected ? selected.value : undefined
}

const internalValue = ref<SelectValue | SelectValue[] | undefined>(
    props.modelValue !== undefined ? props.modelValue : initialValue()
)
const currentValue = computed(() => (props.modelValue !== undefined ? props.modelValue : internalValue.value))

function isSelected(item: SelectItemObject) {
    // divider처럼 value가 없는 항목이, 아무것도 선택 안 된 상태(currentValue===undefined)일 때
    // undefined===undefined로 우연히 "선택됨"이 돼버리는 걸 막는다.
    if (item.type === "divider" || item.value === undefined) return false

    if (props.multi) {
        return Array.isArray(currentValue.value) && currentValue.value.includes(item.value)
    }
    return currentValue.value === item.value
}

function setValue(value: SelectValue | SelectValue[]) {
    const prevValue = currentValue.value
    internalValue.value = value
    emit("update:modelValue", value)
    emit("change", value, prevValue)
}

function selectItem(item: SelectItemObject) {
    if (props.multi) {
        const current = Array.isArray(currentValue.value) ? currentValue.value : []
        const next = current.includes(item.value as SelectValue)
            ? current.filter((v) => v !== item.value)
            : [...current, item.value as SelectValue]
        setValue(next)
    } else {
        setValue(item.value as SelectValue)
    }
}

function onItemClick(item: SelectItemObject) {
    if (item.type === "divider") return
    selectItem(item)
    if (!props.multi) open.value = false
}

const selectedItems = computed(() => normalizedItems.value.filter((it) => isSelected(it)))

function onDocumentClick(e: MouseEvent) {
    if (open.value && rootRef.value && !rootRef.value.contains(e.target as Node)) {
        open.value = false
    }
}

onMounted(() => document.addEventListener("click", onDocumentClick))
onBeforeUnmount(() => document.removeEventListener("click", onDocumentClick))

/** 원본 getValue() */
function getValue() {
    return currentValue.value
}
/** 원본 setValue(value) */
function setValueApi(value: SelectValue | SelectValue[]) {
    setValue(value)
}
/** 원본 setSelectedIndex(index) - multi일 때는 클릭과 동일하게 기존 선택에 토글된다(이전엔
 * 전체를 [item.value]로 통째로 교체해서 다른 선택 항목이 사라지는 버그가 있었다). */
function setSelectedIndex(index: number) {
    const item = normalizedItems.value[index]
    if (!item) return
    selectItem(item)
}
/** 원본 getSelectedIndex() — multi가 아닐 때 현재 선택된 아이템의 인덱스 */
function getSelectedIndex() {
    return normalizedItems.value.findIndex((it) => it.value === currentValue.value)
}

defineExpose({ getValue, setValue: setValueApi, setSelectedIndex, getSelectedIndex })
</script>

<template>
    <div ref="rootRef" class="select" :class="[`select-${align}`, `select-${valign}`, { multi, open }]">
        <div class="title" @click="open = !open">
            <span class="title-content">
                <template v-if="selectedItems.length">
                    <span v-for="it in selectedItems" :key="it.value" class="item-view">
                        <!-- 원본도 item.html이 있으면 그대로 .html()로 삽입했다(뱃지/아이콘 등을 넣는 용도)
                             — items를 신뢰할 수 없는 소스로 채운다면 호출 측에서 sanitize된 HTML만 넘겨야 한다. -->
                        <!-- eslint-disable-next-line vue/no-v-html -->
                        <span v-if="it.html != null" v-html="callOrValue(it.html, it)"></span>
                        <template v-else>{{ callOrValue(it.text, it) }}</template>
                    </span>
                </template>
                <template v-else>{{ placeholder }}</template>
            </span>
            <i class="icon-arrow2"></i>
        </div>
        <div class="items">
            <template v-for="(it, index) in normalizedItems" :key="it.value ?? index">
                <hr v-if="it.type === 'divider'" class="item divider" />
                <div
                    v-else
                    class="item option"
                    :class="{ selected: isSelected(it) }"
                    :data-index="index"
                    :value="it.value"
                    @click="onItemClick(it)"
                >
                    <!-- eslint-disable-next-line vue/no-v-html -- 위와 동일한 이유(원본과 동일 동작) -->
                    <span v-if="it.html != null" v-html="callOrValue(it.html, it)"></span>
                    <template v-else>{{ callOrValue(it.text, it) }}</template>
                </div>
            </template>
        </div>
    </div>
</template>
