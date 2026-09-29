<script setup lang="ts">
import { ref, watch } from "vue"

// 원본(stringchecker.js)의 validStringType()과 동일한 순서로 검사한다:
//   1) validJson 실패 → 즉시 무효(placeholder 표시)
//   2) validBlank 위반 → "invalid" emit만 하고 계속 진행(막지는 않음, 원본 그대로의 특성)
//   3) pattern(email/url/color/정규식) 지정 시 → 그 결과가 최종 유효 여부
//   4) pattern이 없으면 minLength/maxLength 위반은 emit만 하고 통과시킴(원본과 동일)
// 원본의 `else if(typeof(opts.pattern) == "object") { var result = regex.test(value); ... }`는
// regex라는 존재하지 않는 변수를 참조해서 RegExp를 pattern으로 주면 그대로 터지는 버그였다.
// 여기서는 당연히 opts.pattern을 쓰도록 고쳤다.
type PatternName = "email" | "url" | "color"
const patterns: Record<PatternName, RegExp> = {
    email: /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
    url: /^(http:\/\/www\.|https:\/\/www\.|http:\/\/|https:\/\/)?[a-z0-9]+([\-.]{1}[a-z0-9]+)*\.[a-z]{2,5}(:[0-9]{1,5})?(\/.*)?$/,
    color: /#?([A-Fa-f0-9]){3}(([A-Fa-f0-9]){3})?/
}

const props = withDefaults(
    defineProps<{
        /** 현재 값(v-model) - blur 시 유효성 검사를 통과했을 때만 갱신되어 emit되고, 외부에서
         * 이 prop을 직접 바꾸면 즉시 반영되어 표시값과 invalid 상태가 초기화된다. 기본값 "". */
        modelValue?: string
        /** true면 `{"key":"<value>"}` 형태로 JSON.parse를 시도해 실패 시 즉시 무효 처리한다(placeholder만 남기고 입력을 비움). 기본값 true. */
        validJson?: boolean
        /** true일 때 값이 공백뿐이면 "blank" invalid 이벤트만 발생시킨다 - 원본과 동일하게 실제로 입력을 막지는 않는다. 기본값 false. */
        validBlank?: boolean
        /** 이 길이보다 짧으면 "min" invalid 이벤트만 발생시킨다(막지는 않음). pattern이 지정되어 있으면 이 검사는 건너뛴다. -1이면 검사하지 않는다. 기본값 -1. */
        minLength?: number
        /** 이 길이보다 길면 "max" invalid 이벤트만 발생시킨다(막지는 않음). pattern이 지정되어 있으면 이 검사는 건너뛴다. -1이면 검사하지 않는다. 기본값 -1. */
        maxLength?: number
        /** "email" | "url" | "color" | RegExp | null. */
        pattern?: string | RegExp | null
        /** invalid일 때 보여줄 기본 placeholder. */
        message?: string | null
        /** 원본은 emit("invalid", ...)의 리턴값으로 placeholder를 오버라이드했는데(핸들러가 return type
         * 하는 방식), Vue emit은 리턴값을 못 받으니 그 대신 함수 prop으로 받는다: (type, value) => string. */
        invalidMessage?: ((type: string | null, value: string) => string) | null
        /** 입력창 크기를 나타내는 클래스 문자열. 기본값 "normal". */
        size?: string
    }>(),
    {
        modelValue: "",
        validJson: true,
        validBlank: false,
        minLength: -1,
        maxLength: -1,
        pattern: null,
        message: null,
        invalidMessage: null,
        size: "normal"
    }
)

const emit = defineEmits<{
    /** blur 시 유효성 검사(validJson/pattern)를 통과했을 때만 발생한다 - 타이핑 중(input)에는 발생하지 않는다. */
    "update:modelValue": [value: string]
    /** blur 시 유효성 검사에 실패했을 때(또는 validBlank/minLength/maxLength 위반 시, 이때는 막지는 않고 이 이벤트만) 발생한다. type은 실패 사유("json" | "blank" | pattern 종류 | "min" | "max")이고 value는 그 시점의 입력값이다. */
    invalid: [type: string | null, value: string]
}>()

function testPattern(value: string) {
    if (typeof props.pattern === "string") {
        const regex = patterns[props.pattern.toLowerCase() as PatternName]
        return regex != null && regex.test(value)
    }
    if (props.pattern instanceof RegExp) {
        return props.pattern.test(value)
    }
    return true
}

function patternType() {
    return typeof props.pattern === "string" ? props.pattern.toLowerCase() : "regex"
}

// isBlurEvent=true일 때만 invalid를 emit한다(원본: 타이핑 중엔 event=false로 넘겨서 조용히 검사만 함).
// { valid, invalidType }를 반환한다 — valid는 json/pattern 검사 결과만 반영하고(원본과 동일하게
// validBlank/minLength/maxLength는 emit만 하고 막지는 않는다), invalidType은 실제로 막은 사유다.
function checkValid(value: string, isBlurEvent: boolean): { valid: boolean; invalidType: string | null } {
    if (props.validJson) {
        try {
            JSON.parse(`{ "key":"${value}" }`)
        } catch {
            if (isBlurEvent) emit("invalid", "json", value)
            return { valid: false, invalidType: "json" }
        }
    }

    if (props.validBlank && value.trim() === "") {
        if (isBlurEvent) emit("invalid", "blank", value)
    }

    if (props.pattern != null) {
        const result = testPattern(value)
        const type = patternType()
        if (!result && isBlurEvent) emit("invalid", type, value)
        return { valid: result, invalidType: result ? null : type }
    }

    if (props.minLength !== -1 && value.length < props.minLength) {
        if (isBlurEvent) emit("invalid", "min", value)
    }
    if (props.maxLength !== -1 && value.length > props.maxLength) {
        if (isBlurEvent) emit("invalid", "max", value)
    }

    return { valid: true, invalidType: null }
}

const display = ref(props.modelValue ?? "")
const invalid = ref(false)
const placeholder = ref("")

function markInvalid(type: string | null, value: string) {
    const custom = props.invalidMessage ? props.invalidMessage(type, value) : null
    placeholder.value = custom || props.message || ""
    invalid.value = true
    display.value = ""
}

// 원본 init()의 초기값 검증(원본은 setTimeout 100ms 뒤에 했지만, Vue에서는 그 지연이 필요 없다)
{
    const initial = checkValid(display.value, true)
    if (!initial.valid) markInvalid(initial.invalidType, display.value)
}

// modelValue는 최초 렌더에만 반영되고 이후 외부 변경엔 반응하지 않던 버그가 있었다 - v-model로
// 쓰이는 이상 부모가 나중에 값을 바꾸면(초기화 버튼 등) 화면도 같이 갱신돼야 한다.
watch(
    () => props.modelValue,
    (v) => {
        display.value = v ?? ""
        invalid.value = false
        placeholder.value = ""
    }
)

function onInput(e: Event) {
    display.value = (e.target as HTMLInputElement).value
    checkValid(display.value, false) // 타이핑 중엔 emit 없이 조용히만 검사(원본과 동일)
}

function onFocus() {
    invalid.value = false
    placeholder.value = ""
}

function onBlur() {
    const value = display.value
    const result = checkValid(value, true)

    if (!result.valid) {
        markInvalid(result.invalidType, value)
        return
    }

    display.value = value
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
