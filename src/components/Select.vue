<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from "vue"

// 원본(select.js)은 커스텀 셀렉트박스로, title을 클릭하면 items 목록이 드롭다운으로 열리고
// 바깥을 클릭하면 닫힌다. text/html이 함수일 수도 있는 원본 렌더러 규칙을 그대로 옮겼다.
type SelectValue = string | number
interface SelectItemObject {
    value?: SelectValue
    text?: string | ((this: SelectItemObject) => string)
    html?: string | ((this: SelectItemObject) => string)
    type?: "divider"
    selected?: boolean
}
type SelectItem = string | SelectItemObject

const props = withDefaults(
    defineProps<{
        /** string[] 또는 { value, text?, html?, type?: 'divider' }[]. */
        items?: SelectItem[]
        /** multi=false: value 하나 / multi=true: value 배열. */
        modelValue?: SelectValue | SelectValue[]
        multi?: boolean
        placeholder?: string
        align?: "left" | "right"
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
    "update:modelValue": [value: SelectValue | SelectValue[]]
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

function onItemClick(item: SelectItemObject) {
    if (item.type === "divider") return

    if (props.multi) {
        const current = Array.isArray(currentValue.value) ? currentValue.value : []
        const next = current.includes(item.value as SelectValue)
            ? current.filter((v) => v !== item.value)
            : [...current, item.value as SelectValue]
        setValue(next)
    } else {
        setValue(item.value as SelectValue)
        open.value = false
    }
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
/** 원본 setSelectedIndex(index) */
function setSelectedIndex(index: number) {
    const item = normalizedItems.value[index]
    if (!item) return
    setValue(props.multi ? [item.value as SelectValue] : (item.value as SelectValue))
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
