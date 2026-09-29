<script setup lang="ts">
import { ref, watch } from "vue"

// 원본(src/components/numberchecker.js)은 `numberchecker("input", opts)`처럼
// 마크업의 input 하나(또는 매치된 각각)에 유효성 검사를 붙이는 방식이었다.
// Vue 버전은 컴포넌트 하나 = input 하나로, 여러 개 필요하면 v-for로 반복해서 쓴다.
const props = withDefaults(
    defineProps<{
        /** 현재 값(v-model). 렌더 시 이 값으로 입력창 표시 문자열을 채우고, 이후 외부에서 이
         * prop이 바뀌면 다시 반영된다 - 유효한 숫자 형식이 아니면(null 포함) invalid 상태 +
         * `message` placeholder로 표시된다. */
        modelValue?: number | string | null
        /** true(기본)면 정수(`-?\d+`)만, false면 소수(`-?\d+(.\d+)?`)까지 유효한 값으로 인정한다. */
        integer?: boolean
        /** null이면 제한 없음. */
        min?: number | string | null
        /** null이면 제한 없음. */
        max?: number | string | null
        /** 값이 비거나 잘못됐을 때 blur 시 되돌릴 대상 - null이면 invalid 상태로 표시. */
        empty?: "min" | "max" | "value" | null
        /** invalid 상태일 때 보여줄 placeholder. */
        message?: string
        /** 입력창 크기. 기본값 normal. */
        size?: "large" | "normal" | "small" | "mini"
    }>(),
    {
        modelValue: null,
        integer: true,
        min: null,
        max: null,
        empty: null,
        message: "Invalid number",
        size: "normal"
    }
)

const emit = defineEmits<{
    /** 유효한 숫자가 입력되거나(input 중, min/max 범위를 만족할 때) blur 시 값이 보정/클램프될
     * 때 발생한다 - invalid 상태인 동안은 발생하지 않는다. */
    "update:modelValue": [value: number]
}>()

function isValidNumber(value: string) {
    const regex = props.integer ? /^[-]?\d+$/ : /^[-]?\d+(?:[.]\d+)?$/
    return regex.test(value)
}

function toNumber(value: number | string) {
    return props.integer ? parseInt(value as string, 10) : parseFloat(value as string)
}

function hasMin() {
    return props.min !== null && props.min !== ""
}
function hasMax() {
    return props.max !== null && props.max !== ""
}

const display = ref("")
const invalid = ref(false)
const placeholder = ref("")

// 원본 init()의 초기값 검증과 동일 — 빈 값도 정규식을 통과 못 해서 invalid로 처리된다
// (modelValue를 아예 안 줬으면 처음부터 invalid + placeholder로 시작한다)
function applyModelValue(v: number | string | null) {
    display.value = v != null ? String(v) : ""
    if (!isValidNumber(display.value)) {
        invalid.value = true
        display.value = ""
        placeholder.value = props.message
    } else {
        invalid.value = false
        placeholder.value = ""
    }
}
applyModelValue(props.modelValue)

// 이전엔 modelValue가 setup 시점에만 반영되고 이후 외부 변경엔 반응하지 않았다 - v-model로
// 쓰이는 이상 부모가 나중에 값을 바꾸면(초기화 버튼 등) 화면도 같이 갱신돼야 한다.
watch(() => props.modelValue, applyModelValue)

function onInput() {
    if (!isValidNumber(display.value)) return

    const value = toNumber(display.value)

    if (hasMin() && hasMax()) {
        if (value >= toNumber(props.min!) && value <= toNumber(props.max!)) emit("update:modelValue", value)
    } else if (hasMin() && !hasMax()) {
        if (value >= toNumber(props.min!)) emit("update:modelValue", value)
    } else if (!hasMin() && hasMax()) {
        if (value <= toNumber(props.max!)) emit("update:modelValue", value)
    } else {
        emit("update:modelValue", value)
    }
}

function onFocus() {
    invalid.value = false
    placeholder.value = ""
}

function onBlur() {
    if (!isValidNumber(display.value)) {
        if (props.empty != null) {
            const fallback = props.empty === "min" ? props.min : props.empty === "max" ? props.max : props.modelValue
            display.value = fallback === null || fallback === "" ? "" : String(fallback)
            if (isValidNumber(display.value)) {
                emit("update:modelValue", toNumber(display.value))
            } else {
                // fallback으로 지정한 min/max/modelValue 자체가 없거나 무효했던 경우 - 이전엔
                // 여기서 그냥 조용히 빈 칸으로만 남아서(else 분기와 달리) invalid 클래스도
                // placeholder도 안 붙어 "정상적으로 비어있는 상태"와 구분이 안 됐다.
                invalid.value = true
                display.value = ""
                placeholder.value = props.message
            }
        } else {
            invalid.value = true
            display.value = ""
            placeholder.value = props.message
        }
        return
    }

    let value = toNumber(display.value)
    if (hasMin() && value < toNumber(props.min!)) value = toNumber(props.min!)
    else if (hasMax() && value > toNumber(props.max!)) value = toNumber(props.max!)

    display.value = String(value)
    emit("update:modelValue", value)
}
</script>

<template>
    <input
        v-model="display"
        class="input"
        :class="[size, { invalid }]"
        type="text"
        :placeholder="placeholder"
        @input="onInput"
        @focus="onFocus"
        @blur="onBlur"
    />
</template>
