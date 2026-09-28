<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        /** 스위치의 on/off 상태(v-model). true면 켜진(on) 상태로 렌더링된다. 기본값 false. */
        modelValue?: boolean
        /** examples/switch.html의 `.mini`/`.small`/`.large` 변형과 동일. */
        size?: "" | "mini" | "small" | "large"
        /** examples/switch.html의 `.inner` 변형과 동일. */
        inner?: boolean
        /** 원본 `opts.toggleEvent`와 동일 - 토글을 트리거할 이벤트명. */
        toggleEvent?: string
    }>(),
    {
        modelValue: false,
        size: "",
        inner: false,
        toggleEvent: "click"
    }
)

const emit = defineEmits<{
    "update:modelValue": [value: boolean]
    change: [value: boolean]
}>()

function toggle() {
    // 원본(src/components/switch.js) toggle()과 동일하게
    // v-model 갱신과 change 이벤트를 함께 내보낸다.
    const next = !props.modelValue
    emit("update:modelValue", next)
    emit("change", next)
}

// 원본의 getValue/setValue/toggle을 ref로 직접 호출할 수 있도록 노출한다.
// (v-model만으로 충분한 경우가 대부분이지만, 원본처럼 외부 트리거에서 명령형으로
// 제어하고 싶을 때를 위한 API — setValue(true/false)는 toggle과 달리 값을 직접 지정한다)
function getValue() {
    return props.modelValue
}

function setValue(value: boolean) {
    const next = !!value
    emit("update:modelValue", next)
    emit("change", next)
}

defineExpose({ getValue, setValue, toggle })
</script>

<template>
    <div class="switch" :class="[size, { on: modelValue, inner }]" v-on="{ [toggleEvent]: toggle }">
        <div class="area">
            <div class="bar">
                <div class="left"></div>
                <div class="right"></div>
            </div>
        </div>
        <div class="handle"></div>
    </div>
</template>
