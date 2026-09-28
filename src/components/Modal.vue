<script setup lang="ts">
import { watch } from "vue"

// 원본(modal.js)은 target의 크기를 getBoundingClientRect 등으로 직접 재서 모달을 가운데
// 배치하고, resize 이벤트마다 다시 계산했다. Vue 버전은 그 픽셀 계산을 전부 CSS flexbox
// 중앙 정렬로 대체한다 — 창 크기가 바뀌어도 재계산이 필요 없다.
// 원본은 "기존 마크업을 감췄다가 모달일 때만 보여주는" 방식(clone 옵션 포함)이었는데,
// Vue 버전은 기본 슬롯에 모달 내용(예: .msgbox)을 선언적으로 넣는 방식으로 바꿨다.
//
// 원본의 target(CSS 셀렉터 문자열, "body" 또는 특정 엘리먼트)은 fixed(Boolean)로 바꿨다.
// 처음엔 Teleport(:to="target")로 그대로 옮기려 했는데, Vue의 Teleport는 "target이 Vue가
// 렌더링하는 엘리먼트가 아니라 앱 바깥의 정적인 대상이어야 한다"는 제약이 있어서
// (실제로 겪음: 같은 컴포넌트 트리 안의 엘리먼트를 target으로 주면 "Failed to locate Teleport
// target" 경고 + 이후 조작 시 크래시) — body처럼 진짜 정적인 대상만 Teleport로 보내고,
// "이너 모달"은 아예 Teleport 없이 제자리에서 position:absolute로 그린다. 이 경우 소비자가
// Modal을 원하는 컨테이너 안(또는 바로 옆, 그 컨테이너가 position:relative)에 두기만 하면 된다.
const props = withDefaults(
    defineProps<{
        /** 표시 여부(v-model). */
        modelValue?: boolean
        /** true: body 기준 전역 모달(Teleport + position:fixed). false: 제자리에서
         * position:absolute로 그려지는 이너 모달 - 감싸는 컨테이너가 position:relative여야 한다. */
        fixed?: boolean
        color?: string
        opacity?: number
        /** 배경을 클릭하면 자동으로 닫힘. */
        autoHide?: boolean
        index?: number
    }>(),
    {
        modelValue: false,
        fixed: true,
        color: "black",
        opacity: 0.4,
        autoHide: true,
        index: 0
    }
)

const emit = defineEmits<{
    "update:modelValue": [value: boolean]
    show: []
    hide: []
}>()

watch(
    () => props.modelValue,
    (v) => (v ? emit("show") : emit("hide"))
)

function show() {
    emit("update:modelValue", true)
}
function hide() {
    emit("update:modelValue", false)
}
function onBackdropClick() {
    if (props.autoHide) hide()
}

defineExpose({ show, hide })
</script>

<template>
    <!-- 배경(어두운 반투명 막)과 콘텐츠(가운데 정렬용 래퍼)를 형제로 분리했다 — 부모에 opacity를
         주면 자식까지 다 반투명해지는 CSS 특성 때문에, 원본처럼 배경만 따로 있어야 모달
         내용물이 또렷하게 나온다. fixed=true일 때만 body로 Teleport하고, 아니면 제자리에 그린다. -->
    <Teleport v-if="fixed" to="body">
        <div v-if="modelValue">
            <div
                class="modal-backdrop"
                style="position: fixed; inset: 0;"
                :style="{ backgroundColor: color, opacity, zIndex: 5000 + index }"
                @click="onBackdropClick"
            ></div>
            <div
                class="modal-content"
                style="position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;"
                :style="{ zIndex: 5001 + index }"
                @click="onBackdropClick"
            >
                <div class="modal-inner" style="pointer-events: auto;" @click.stop>
                    <slot :hide="hide" />
                </div>
            </div>
        </div>
    </Teleport>
    <div v-else-if="modelValue">
        <div
            class="modal-backdrop"
            style="position: absolute; inset: 0;"
            :style="{ backgroundColor: color, opacity, zIndex: 5000 + index }"
            @click="onBackdropClick"
        ></div>
        <div
            class="modal-content"
            style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none;"
            :style="{ zIndex: 5001 + index }"
            @click="onBackdropClick"
        >
            <div class="modal-inner" style="pointer-events: auto;" @click.stop>
                <slot :hide="hide" />
            </div>
        </div>
    </div>
</template>

<style>
/* flex의 align-items/justify-content 중앙정렬은 position:absolute인 자식에는 적용되지
   않는다 - .msgbox 등(msgbox.less)은 자기 자신을 position:absolute로 두는 CSS를 갖고 있어서
   (원래는 JS로 계산한 left/top과 함께 쓰이는 것을 전제) 이 안에 슬롯으로 들어오면 중앙정렬이
   깨진다. 이 래퍼 안에서는 relative로 되돌려서 flex 중앙정렬이 그대로 먹히게 한다.
   !important가 필요한 이유: theme.less가 `.jui { ... .msgbox { position: absolute } }`로
   같은 명시도(0,2,0)의 규칙을 다시 선언하고 있어서, 소스 순서상 테마 레이어가 이 규칙보다
   나중에 번들되면 그냥은 이긴다. */
.modal-inner > .msgbox,
.modal-inner > .window {
    position: relative !important;
}
</style>
