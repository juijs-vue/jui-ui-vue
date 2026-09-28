<script setup lang="ts">
import { ref, computed, onMounted } from "vue"

// 원본(accordion.js)은 non-multipanel 모드에서 .content 엘리먼트를 클릭한 title 뒤로
// insertAfter해서 옮기는 방식이라, title마다 자기 content가 따로 있으면 제대로 동작하지
// 않는 구조적 한계가 있었다(데모도 사실상 content 1개를 공유하는 경우만 정상 동작).
// Vue 버전은 item마다 title/content를 갖는 데이터 기반으로 다시 설계했고, multipanel도
// 동시에 여러 패널이 열려야 하므로 Tab과 동일하게 모든 콘텐츠를 렌더링해두고 v-show로 토글한다.
interface AccordionItem {
    /** title 바에 표시되는 텍스트. */
    title: string
    /** 이 항목을 식별할 키. v-for의 `:key`로 쓰이고, `content`가 없을 때 참조하는 콘텐츠 슬롯 이름
     * (`content-${value ?? index}`)에도 쓰인다 - 생략하면 배열 index로 대체된다. */
    value?: string | number
    /** 콘텐츠로 렌더링할 컴포넌트/함수. object 또는 function이면 `<component :is>`로 직접
     * 렌더링되고, 그 외(생략 포함)엔 `content-${value ?? index}`라는 이름의 named slot으로 대체된다. */
    content?: unknown
    /** `content`가 컴포넌트일 때 그 컴포넌트에 v-bind로 전달할 props. */
    contentProps?: Record<string, unknown>
    /** 이 항목의 `.content` 래퍼 div에 추가로 붙일 CSS 클래스. */
    contentClass?: string
}

const props = withDefaults(
    defineProps<{
        /** 아코디언에 표시할 항목 목록 - 각 항목의 title/content가 순서대로 렌더링된다. */
        items: AccordionItem[]
        /** multipanel=false: 열린 패널의 index(number\|null) / multipanel=true: 열린 패널들의 index 배열. */
        modelValue?: number | number[] | null
        /** true면 여러 패널을 동시에 열어둘 수 있다(모두 렌더링해두고 v-show로 토글) - false(기본)면
         * 한 번에 하나의 패널만 열린다. */
        multipanel?: boolean
        /** 열려 있는 title을 다시 클릭하면 접는다. */
        autoFold?: boolean
        /** title/content 영역의 크기. 기본값 normal. */
        size?: "normal" | "large"
        /** 아코디언 전체 스타일 변형. 기본값 classic. */
        variant?: "classic" | "simple"
    }>(),
    {
        modelValue: undefined,
        multipanel: false,
        autoFold: false,
        size: "normal",
        variant: "classic"
    }
)

const emit = defineEmits<{
    /** 열린 패널(들)이 바뀔 때마다 발생 - v-model 동기화용. `multipanel` 여부에 따라 숫자(또는
     * null) 하나이거나 index 배열이다. */
    "update:modelValue": [value: number | number[] | null]
    /** 패널이 title 클릭으로 열릴 때 발생 - 열린 패널의 index와 클릭 이벤트를 담는다. */
    open: [index: number, e: MouseEvent]
    /** `autoFold`가 켜진 상태에서 이미 열려 있는 title을 다시 클릭해 접었을 때만 발생 - 그 외
     * 방식(예: modelValue를 외부에서 바꾸는 것)으로 닫혀도 이 이벤트는 발생하지 않는다. */
    fold: [index: number, e: MouseEvent]
    /** 컴포넌트가 마운트된 직후 한 번 발생. */
    init: []
}>()

const internalValue = ref<number | number[] | null>(props.modelValue !== undefined ? props.modelValue : props.multipanel ? [] : null)
const currentValue = computed(() => (props.modelValue !== undefined ? props.modelValue : internalValue.value))

function isOpen(index: number) {
    if (props.multipanel) {
        return Array.isArray(currentValue.value) && currentValue.value.includes(index)
    }
    return currentValue.value === index
}

function setValue(next: number | number[] | null) {
    internalValue.value = next
    emit("update:modelValue", next)
}

function onTitleClick(index: number, _item: AccordionItem, e: MouseEvent) {
    if (isOpen(index) && props.autoFold) {
        const next = props.multipanel ? (currentValue.value as number[]).filter((i) => i !== index) : null
        setValue(next)
        emit("fold", index, e)
        return
    }

    const next = props.multipanel
        ? (currentValue.value as number[]).includes(index)
            ? (currentValue.value as number[])
            : [...(currentValue.value as number[]), index]
        : index
    setValue(next)
    emit("open", index, e)
}

onMounted(() => emit("init"))

/** 원본 activeIndex() 대응. 원본은 항상 0을 반환하는 죽은 코드였는데, 여기서는 실제 열린
 *  인덱스(멀티패널이면 배열)를 반환하도록 고쳤다. */
function activeIndex() {
    return currentValue.value
}

defineExpose({ activeIndex })
</script>

<template>
    <div class="accordion" :class="[variant, size]">
        <template v-for="(item, index) in items" :key="item.value ?? index">
            <div class="title" :class="{ active: isOpen(index) }" @click="onTitleClick(index, item, $event)">
                {{ item.title }}
                <slot name="icon" :index="index" :open="isOpen(index)" />
            </div>
            <div v-show="isOpen(index)" class="content" :class="item.contentClass">
                <component
                    :is="item.content"
                    v-if="typeof item.content === 'object' || typeof item.content === 'function'"
                    v-bind="item.contentProps"
                />
                <slot v-else :name="`content-${item.value ?? index}`" :item="item" :index="index" />
            </div>
        </template>
    </div>
</template>
