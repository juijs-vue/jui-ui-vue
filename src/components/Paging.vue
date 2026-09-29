<script setup lang="ts">
import { ref, computed, watch } from "vue"

// 원본(paging.js)의 changePage() 페이지 범위 계산 로직을 그대로 옮겼다.
// 원본 예시 페이지(examples/paging.html)가 리포에 없어서 pixel 비교 대상은 없고,
// paging.less/paging.theme.less의 마크업 구조(.paging > .prev/.list/.next)만 근거로 삼았다.
const props = withDefaults(
    defineProps<{
        /** 현재 페이지(1-base). 안 주면 컴포넌트가 내부적으로 1페이지부터 관리한다. */
        modelValue?: number
        /** 전체 레코드 수. */
        count?: number
        /** 페이지당 레코드 수. */
        pageCount?: number
        /** 한 화면에 보여줄 페이지 번호 개수. */
        screenCount?: number
        /** 페이지 번호/화살표의 크기. 기본값 normal. */
        size?: "normal" | "large"
    }>(),
    {
        modelValue: undefined,
        count: 0,
        pageCount: 10,
        screenCount: 5,
        size: "normal"
    }
)

const emit = defineEmits<{
    /** 현재 페이지가 바뀔 때마다 발생(`page`/`next`/`prev`/`first`/`last`/`reload` 어느 경로든) -
     * v-model 동기화용. */
    "update:modelValue": [value: number]
    /** 사용자가 명시적으로 페이지를 이동했을 때(`page`/`next`/`prev`/`first`/`last` 호출, 또는
     * 페이지 번호 클릭) 발생 - `reload()`로 1페이지로 되돌아가는 내부 리셋에서는 발생하지 않는다. */
    page: [value: number]
    /** `reload()` 호출로 발생 - 1페이지로 되돌렸으니 그 페이지 데이터를 다시 불러오라는 신호.
     * `reload()` 자신은 `count` prop을 갱신하지 않으므로, 새 총 개수는 호출자가 별도로 반영해야 한다. */
    reload: []
}>()

// 원본은 Math.ceil(count / pageCount)를 그대로 쓴다 - count가 0이면 lastPage도 0이 되고,
// 아래 pages 계산 루프가 그 경우 빈 배열을 내놓아 페이지 번호가 하나도 안 보인다(1로 밀어
// 올리면 데이터가 없는데도 "1" 버튼이 활성화된 것처럼 보이는 게 실제 버그였다).
const lastPage = computed(() => Math.ceil(props.count / props.pageCount))

const internalPage = ref(props.modelValue ?? 1)
const currentPage = computed(() => props.modelValue ?? internalPage.value)

watch(
    () => props.modelValue,
    (v) => {
        if (v !== undefined) internalPage.value = v
    }
)

// 원본 changePage()의 페이지 번호 목록 계산을 그대로
const pages = computed(() => {
    const last = lastPage.value
    const end = last < props.screenCount ? last : props.screenCount
    let start = currentPage.value - Math.ceil(end / 2) + 1
    if (start < 1) start = 1

    const list = []
    if (last < start + end) {
        for (let i = last - end + 1; i < last + 1; i++) list.push(i)
    } else {
        for (let i = start; i < start + end; i++) list.push(i)
    }
    return list
})

function setPage(pNo: number, emitEvent: boolean) {
    // lastPage가 0(count=0, 즉 데이터 없음)이어도 modelValue 자체는 "1-base"라는 문서 계약을
    // 지켜야 한다 - 그대로 클램프하면 first()/last()/reload() 등이 0을 내보내던 버그가 있었다.
    const last = Math.max(lastPage.value, 1)
    let next = pNo > last ? last : pNo
    next = pNo < 1 ? 1 : next

    internalPage.value = next
    emit("update:modelValue", next)
    if (emitEvent) emit("page", next)
}

/** 원본 page(pNo) — 인자가 없으면 현재 페이지를 반환 */
function page(pNo?: number) {
    if (!pNo) return currentPage.value
    setPage(pNo, true)
    return undefined
}

/** 원본 next() */
function next() {
    setPage(currentPage.value + 1, true)
}

/** 원본 prev() */
function prev() {
    setPage(currentPage.value - 1, true)
}

/** 원본 first() */
function first() {
    setPage(1, true)
}

/** 원본 last() */
function last() {
    setPage(lastPage.value, true)
}

/** 원본 reload(count) — 총 개수를 바꾸고 1페이지로 되돌린다. count는 count prop을 쓰는 쪽이 권장되지만
 *  원본 API 호환을 위해 인자로도 받는다(단, count prop 자체는 외부에서 갱신해야 실제로 반영된다). */
function reload() {
    setPage(1, false)
    emit("reload")
}

defineExpose({ page, next, prev, first, last, reload })
</script>

<template>
    <div class="paging" :class="size">
        <a class="prev" href="javascript:void(0)" @click="prev">Previous</a>
        <div class="list">
            <template v-for="(p, idx) in pages" :key="p">
                <!-- v-for가 반복하는 노드 사이에는 자연스러운 공백 텍스트 노드가 없다(ButtonGroup.vue와
                     같은 이유) - 원본의 줄바꿈 마크업이 만드는 공백을 보간된 텍스트로 재현한다. -->
                {{ idx > 0 ? " " : "" }}<a
                    class="page"
                    :class="{ active: p === currentPage }"
                    href="javascript:void(0)"
                    @click="setPage(p, true)"
                >{{ p }}</a>
            </template>
        </div>
        <a class="next" href="javascript:void(0)" @click="next">Next</a>
    </div>
</template>
