<script setup lang="ts">
// 원본은 매 reloadUI()마다 setNodeStatus()로 open/fold/leaf/last/root 클래스를 노드
// DOM에 직접 지웠다 다시 붙였다(removeClass+addClass). Vue 버전은 이 클래스들을 node의
// 현재 상태(type/children/parent/lastChild 여부)에서 매번 계산하는 순수 computed로
// 대체했다 — 트리 구조가 바뀌면 Vue가 알아서 다시 그린다.
import { computed, inject } from "vue"
import type { TreeCtx, TreeNodeInternal } from "../types/tree"

const props = withDefaults(
    defineProps<{
        node: TreeNodeInternal
        isRoot?: boolean
    }>(),
    { isRoot: false }
)

const ctx = inject<TreeCtx>("treeCtx")!

defineSlots<{
    default(props: { node: { index: string | null; data: TreeNodeInternal["data"]; depth: number } }): unknown
}>()

const isLeaf = computed(() => props.node.children.length === 0)
const isLast = computed(() => props.node.parent && props.node.parent.children.at(-1) === props.node)

const classes = computed(() => ({
    root: props.isRoot,
    leaf: !props.isRoot && isLeaf.value,
    open: (props.isRoot || !isLeaf.value) && props.node.type === "open",
    fold: (props.isRoot || !isLeaf.value) && props.node.type === "fold",
    last: isLast.value,
    active: ctx.activeIndex.value === props.node.index,
    hover: ctx.dragEnd.value === props.node.index,
    "drag-before": ctx.dragBarRef.value.index === props.node.index && !ctx.dragBarRef.value.after && !ctx.dragBarRef.value.nest,
    "drag-after": ctx.dragBarRef.value.index === props.node.index && ctx.dragBarRef.value.after && !ctx.dragBarRef.value.nest,
    "drag-nest": ctx.dragBarRef.value.index === props.node.index && ctx.dragBarRef.value.nest,
    disabled: !!props.node.data.disabled
}))

const hideRow = computed(() => props.isRoot && ctx.rootHide)

function isToggleIcon(e: MouseEvent) {
    // e.target.tagName === "I"만으로는 부족하다 - 슬롯 템플릿이 파일 아이콘용 <i>를
    // 따로 두는 경우(tree_3처럼)가 많아서, 앞쪽 토글 화살표(li의 첫 번째 자식)와
    // 혼동되면 그 아이콘 위에서만 드래그 추적이 끊기는 것처럼 보인다.
    return e.target === (e.currentTarget as HTMLElement).children[0]
}
function onToggleClick(e: MouseEvent) {
    if (props.node.type === "open") ctx.fold(props.node.index, e)
    else ctx.open(props.node.index, e)
    e.stopPropagation()
}
function onSelectClick(e: MouseEvent) {
    if (classes.value.disabled) return
    ctx.select(props.node, e)
    e.stopPropagation()
}
function onMouseDown(e: MouseEvent) {
    if (isToggleIcon(e)) return
    ctx.dragStartNode(props.node, e)
    e.preventDefault() // 원본은 jQuery 핸들러에서 return false(=preventDefault+stopPropagation) -
    // 이게 없으면 드래그하는 동안 브라우저가 텍스트 선택으로 인식해버린다
}
function onMouseUp(e: MouseEvent) {
    if (isToggleIcon(e)) return
    ctx.dragDropOnNode(props.node, e)
    e.preventDefault()
}
function onMouseOver(e: MouseEvent) {
    if (isToggleIcon(e)) return
    ctx.dragOverNode(props.node, e)
    e.stopPropagation() // 조상 노드의 mouseover까지 버블링되어 dragEnd가 덮어써지는 것을 방지
}
function onMouseMove(e: MouseEvent) {
    // 위/가운데/아래 3구간 판정은 커서의 y좌표를 계속 따라가야 한다. mouseover는 이 행에
    // "처음 들어온 순간"에만 한 번 발생해서(대개 위쪽 가장자리로 진입) 그 좌표로 계속 고정돼
    // 버리면 가운데/아래 판정이 거의 나오지 않는다 - mousemove로 계속 갱신해야 안정적이다.
    if (isToggleIcon(e)) return
    ctx.dragBarOverNode(props.node, e)
    e.stopPropagation()
}
</script>

<template>
    <li :class="classes" :style="isRoot && hideRow ? { paddingLeft: '0px' } : null" @mousedown="ctx.drag ? onMouseDown($event) : null" @mouseup="ctx.drag ? onMouseUp($event) : null" @mouseover="ctx.drag ? onMouseOver($event) : null" @mousemove="ctx.drag ? onMouseMove($event) : null"><i v-show="!hideRow" @click="onToggleClick"></i> <component :is="node.data.href ? 'a' : 'div'" v-show="!hideRow" :href="node.data.href" @click="onSelectClick"><slot :node="{ index: node.index, data: node.data, depth: node.depth }"><i></i> {{ node.data.title }}</slot></component> <ul v-show="node.type === 'open'"><TreeNode v-for="child in node.children" :key="child.index ?? undefined" :node="child"><template #default="slotProps"><slot v-bind="slotProps" /></template></TreeNode></ul>
    </li>
</template>
