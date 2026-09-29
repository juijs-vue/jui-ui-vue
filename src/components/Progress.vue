<script setup lang="ts">
import { computed, ref } from "vue"

const props = withDefaults(
    defineProps<{
        /** 현재 진행 값(v-model). `min`~`max` 범위 안에서의 위치로 바(bar)의 비율(%)이 계산된다. 기본값 0. */
        modelValue?: number
        /** 진행 범위의 최솟값. 기본값 0. */
        min?: number
        /** 진행 범위의 최댓값. 기본값 100. */
        max?: number
        /** 바 방향 - `horizontal`이면 가로(width)로, `vertical`이면 세로(height)로 채워진다. 기본값 horizontal. */
        orient?: "horizontal" | "vertical"
        /** 원본 `opts.type` - `""` | `"flat"` | `"simple"` | `"simple flat"`. */
        variant?: "" | "flat" | "simple" | "simple flat"
        /** 바에 줄무늬(striped) 스타일을 준다. 어디까지나 초기값이고, 노출된 `setStriped()`로 언제든
         * prop과 무관하게 override할 수 있다. 기본값 false. */
        striped?: boolean
        /** 줄무늬가 움직이는 애니메이션을 켠다(`striped`와 함께 써야 보인다). 초기값일 뿐이며
         * `setAnimated()`로 override 가능. 기본값 false. */
        animated?: boolean
    }>(),
    {
        modelValue: 0,
        min: 0,
        max: 100,
        orient: "horizontal",
        variant: "",
        striped: false,
        animated: false
    }
)

const emit = defineEmits<{
    /** `setValue()`(노출된 API)로 값을 바꿀 때 발생 - v-model 동기화용. */
    "update:modelValue": [value: number]
}>()

const percent = computed(() => {
    const range = props.max - props.min
    if (range === 0) return 0
    return ((props.modelValue - props.min) / range) * 100
})

const barStyle = computed(() =>
    props.orient === "vertical" ? { height: `${percent.value}%` } : { width: `${percent.value}%` }
)

/** 원본 getValue()/setValue() 대응 */
function getValue() {
    return props.modelValue
}
function setValue(v: number) {
    emit("update:modelValue", v)
}

/**
 * 원본 `progress.js`의 `this.setStriped(isStriped)`/`this.setAnimated(isAnimated)` 대응
 * (progress.js:89-103) - 완전성 감사에서 발견된, 문서화 안 된 API 축소를 보강.
 * `striped`/`animated` props는 초기값일 뿐, 이 메서드들로 언제든 prop과 무관하게 override 가능하도록
 * 로컬 ref로 소유 - 원본이 jQuery 위젯 인스턴스에 직접 상태를 들고 있던 것과 동일한 의미.
 * 인자 없이 호출하면(원본의 `typeof isStriped == "undefined"` 분기) 현재 prop 값으로 재동기화한다 -
 * 단순 toggle이 아니다.
 */
const localStriped = ref(props.striped)
const localAnimated = ref(props.animated)
// prop을 계속 미러링하는 watch를 두면 "prop과 무관하게 override 가능"이라는 위 문서 계약이
// 깨진다 - setStriped(true)로 override한 뒤 어떤 이유로든 striped prop이 바뀌면 그 watch가
// override를 조용히 되돌려버렸다. 재동기화는 setStriped()/setAnimated()를 인자 없이
// 호출하는 것으로만 이뤄진다(원본과 동일).

function setStriped(isStriped?: boolean) {
    localStriped.value = isStriped === undefined ? props.striped : isStriped
}
function setAnimated(isAnimated?: boolean) {
    localAnimated.value = isAnimated === undefined ? props.animated : isAnimated
}

defineExpose({ getValue, setValue, setStriped, setAnimated })
</script>

<template>
    <div class="progress" :class="[orient, variant]">
        <div class="area">
            <div class="bar" :class="{ striped: localStriped, animated: localAnimated }" :style="barStyle"></div>
        </div>
    </div>
</template>
