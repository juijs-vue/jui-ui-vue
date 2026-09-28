<script setup lang="ts">
import { ref, computed } from "vue"

interface ButtonGroupItem {
    /** 버튼에 표시할 라벨. icon만 주고 text를 생략하면 아이콘 전용 버튼이 된다. */
    text?: string
    /** 버튼의 고유 값 - modelValue/index 매핑, change/click 이벤트 payload에 쓰인다. */
    value: string | number
    /** 이 버튼만 개별적으로 비활성화한다. 그룹 전체를 끄는 props.disabled와는 OR 조건으로 합쳐져 둘 중 하나만 true여도 클릭이 무시된다. */
    disabled?: boolean
    /** "icon-" 접두사를 뺀 이름(예: "home"). text 없이 icon만 주면 아이콘 전용 버튼이 된다. */
    icon?: string
    /** icon 클래스에 함께 붙는 추가 클래스(예: 색상/크기 변형). icon이 없으면 아무 효과가 없다. */
    iconExtra?: string
}

const props = withDefaults(
    defineProps<{
        /** 그룹에 표시할 버튼 목록. */
        items: ButtonGroupItem[]
        /** "radio"는 단일 선택(다른 버튼을 고르면 이전 선택은 해제), "check"는 다중 선택(클릭할 때마다 토글). 기본값 "radio". */
        type?: "radio" | "check"
        /** radio: 단일 value / check: value 배열. */
        modelValue?: string | number | (string | number)[]
        /** 원본 `opts.index` 대응 - modelValue를 안 넘겼을 때 인덱스로 초기 선택
         * (원본 UI.setup()의 기본값 index: 0과 동일하게, radio는 안 주면 0번째가 기본 선택). */
        index?: number | number[]
        /** 버튼 크기 클래스(large/normal/small/mini). 기본값 "normal". */
        size?: "large" | "normal" | "small" | "mini"
        /** 원본 enable(isActive)에 대응 - 그룹 전체를 한번에 비활성화. */
        disabled?: boolean
    }>(),
    {
        type: "radio",
        modelValue: undefined,
        index: undefined,
        size: "normal",
        disabled: false
    }
)

const emit = defineEmits<{
    /** v-model 동기화용 - 클릭이나 setValue/setIndex로 값이 바뀔 때마다 새 값과 함께 발생한다. */
    "update:modelValue": [value: string | number | (string | number)[]]
    /** 선택 값이 바뀔 때 발생. setValue/setIndex처럼 개별 item 없이 값을 직접 지정한 경우 payload.item은 undefined, e는 undefined가 된다. */
    change: [payload: { item: ButtonGroupItem | undefined; value: string | number | (string | number)[] }, e: MouseEvent | undefined]
    /** 사용자가 버튼을 실제로 클릭했을 때만 발생(setValue/setIndex 같은 프로그래매틱 변경 시에는 발생하지 않음) - change와 같은 payload에 원본 MouseEvent를 함께 전달한다. */
    click: [payload: { item: ButtonGroupItem | undefined; value: string | number | (string | number)[] }, e: MouseEvent | undefined]
}>()

function indexToValue(idx: number) {
    return props.items[idx] ? props.items[idx].value : undefined
}

function indexInitialValue(): string | number | (string | number)[] | undefined {
    if (props.type === "check") {
        return Array.isArray(props.index)
            ? props.index.map(indexToValue).filter((v): v is string | number => v !== undefined)
            : []
    }
    return typeof props.index === "number" ? indexToValue(props.index) : indexToValue(0)
}

// modelValue를 넘기지 않고 쓰는(v-model 없이 index/이벤트만 쓰는) 경우를 위한 내부 상태.
// modelValue가 주어지면 항상 그쪽이 우선한다.
const internalValue = ref<string | number | (string | number)[] | undefined>(
    props.modelValue !== undefined ? props.modelValue : indexInitialValue()
)
const currentValue = computed(() => (props.modelValue !== undefined ? props.modelValue : internalValue.value))

function isActive(item: ButtonGroupItem) {
    if (props.type === "check") {
        return Array.isArray(currentValue.value) && currentValue.value.includes(item.value)
    }
    return currentValue.value === item.value
}

function onClick(item: ButtonGroupItem, e: MouseEvent) {
    // 원본(button.js)도 핸들러 끝에서 e.preventDefault()를 호출한다 - 그대로 맞춰준다.
    // (참고: <a>에 href가 없어서 원래도 클릭으로 실제 포커스가 가지 않는다 - 포커스 링이 옆
    // 버튼에 가려 보이는 버그는 href="javascript:void(0)"를 붙였던 게 원인이었다. 원본처럼
    // href 없이 .btn의 cursor:pointer만으로 충분하다.)
    e.preventDefault()

    if (props.disabled || item.disabled) return

    let nextValue: string | number | (string | number)[]

    if (props.type === "check") {
        const current = Array.isArray(currentValue.value) ? currentValue.value : []
        nextValue = current.includes(item.value) ? current.filter((v) => v !== item.value) : [...current, item.value]
    } else {
        nextValue = item.value
    }

    internalValue.value = nextValue
    emit("update:modelValue", nextValue)
    emit("change", { item, value: nextValue }, e)
    emit("click", { item, value: nextValue }, e)
}

// 원본(button.js)의 setValue/setIndex/getValue/getData 대응 — v-model 밖에서
// ref로 직접 그룹을 제어하고 싶을 때 쓰는 명령형 API.
function setValueInternal(value: string | number | (string | number)[] | undefined) {
    internalValue.value = value
    emit("update:modelValue", value as string | number | (string | number)[])
    emit("change", { item: undefined, value: value as string | number | (string | number)[] }, undefined)
}

function setValue(value: string | number | (string | number)[]) {
    setValueInternal(value)
}

function setIndex(indexList: number | number[]) {
    if (props.type === "check") {
        const list = Array.isArray(indexList) ? indexList : [indexList]
        setValueInternal(list.map(indexToValue).filter((v): v is string | number => v !== undefined))
    } else {
        setValueInternal(indexToValue(indexList as number))
    }
}

function getValue() {
    return currentValue.value
}

function getData() {
    if (props.type === "check") {
        return (Array.isArray(currentValue.value) ? currentValue.value : []).map((v) =>
            props.items.find((it) => it.value === v)
        )
    }
    return props.items.find((it) => it.value === currentValue.value)
}

defineExpose({ setValue, setIndex, getValue, getData })
</script>

<template>
    <div class="group">
        <template v-for="(item, idx) in items" :key="item.value">
            <!-- reproduces the whitespace-node gap raw HTML has between hand-written sibling tags
                 (v-for repeats a single node with no natural gap the way newline-separated markup
                 does), which .group's -7px sibling margin (common.less .children-group) assumes -
                 an interpolated text node isn't subject to the compiler's static-whitespace
                 stripping, so this renders as a real space between items, never before the first -->
            {{ idx > 0 ? " " : "" }}<a
                class="btn"
                :class="[size, { active: isActive(item), disabled: disabled || item.disabled }]"
                :value="item.value"
                @click="onClick(item, $event)"
            ><i v-if="item.icon" :class="[`icon-${item.icon}`, item.iconExtra]"></i>{{ item.icon && item.text ? " " : "" }}{{ item.text || "" }}</a>
        </template>
    </div>
</template>
