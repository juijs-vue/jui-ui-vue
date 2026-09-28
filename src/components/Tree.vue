<script setup lang="ts">
// 원본(tree.js)의 ui.tree.node/ui.tree.base는 "0.1.2" 같은 점(dot) 인덱스 문자열로 노드를
// 찾고, DOM을 직접 append/insertBefore/remove하며 동기화했다. Vue 버전은 같은 인덱스
// 체계와 CRUD API(append/insert/update/remove/move/open/fold/select/get/getAll/list/
// listAll/listParents/activeIndex)는 그대로 노출하되, 내부 상태는 반응형 트리(reactive
// 객체 그래프)로 두고 DOM 동기화는 재귀 컴포넌트(TreeNode.vue)의 v-for/v-show에 맡긴다 —
// reindex() 한 번으로 전체 인덱스가 재계산되면 나머지는 Vue가 알아서 다시 그린다.
// tpl.node(커스텀 노드 템플릿)는 TreeNode.vue의 default scoped slot으로 대체했다.
import { reactive, ref, provide } from "vue"
import { KeyParser } from "jui-core-ts"
import TreeNode from "./TreeNode.vue"
import type { TreeDragControl, TreeNodeData, TreeNodeInternal } from "../types/tree"

// 원본(tree.js)의 util.index 파서를 그대로 포팅한 jui-core-ts의 KeyParser를 쓴다
// (예전엔 이 리포에 vendoring 안 돼 있어서 ../utils/treeIndex.js에 독자적으로
// 재구현했었음). getParentIndex/getNextIndex는 내부적으로 this.getIndexList를 참조하므로
// 메서드를 분해하지 않고 인스턴스를 그대로 쓴다.
const keyParser = new KeyParser()

const props = withDefaults(
    defineProps<{
        /** 루트 노드 데이터(필수 - 원본과 동일). `children`을 중첩하면 선언적으로, 생략하면
         * `append`/`insert` 같은 명령형 API로 채울 수 있다. */
        root: TreeNodeData
        /** 토글 화살표/들여쓰기 스타일. */
        variant?: "arrow" | "line" | "arrow-file" | "line-file"
        /** 루트 노드 자체의 행을 숨긴다(자식들만 최상위처럼 보이게). */
        rootHide?: boolean
        /** 처음 마운트될 때 루트 노드를 접힌 상태로 시작한다. */
        rootFold?: boolean
        /** 드래그로 노드를 재배치하는 기능을 켠다. */
        drag?: boolean
        /** `false`면 "노드 위에 직접 드롭"(자식으로 편입)만 막고, 형제 사이 재배치는 계속
         * 허용한다(드래그 자체를 끄려면 `drag`를 `false`로). */
        dragChild?: boolean
    }>(),
    {
        variant: "arrow",
        rootHide: false,
        rootFold: false,
        drag: false,
        dragChild: true
    }
)

const emit = defineEmits<{
    select: [node: TreeNodeInternal, e?: Event]
    open: [node: TreeNodeInternal, e?: Event]
    fold: [node: TreeNodeInternal, e?: Event]
    openall: [node: TreeNodeInternal | TreeNodeInternal[]]
    foldall: [node: TreeNodeInternal | TreeNodeInternal[]]
    dragstart: [node: TreeNodeInternal, e: MouseEvent, control: TreeDragControl]
    dragover: [node: TreeNodeInternal, e: MouseEvent, control: TreeDragControl]
    dragend: [node: TreeNodeInternal | null, e: MouseEvent, control: TreeDragControl]
}>()

// root prop이 { title, children: [{ title, children: [...] }, ...] }처럼 자식을 데이터에
// 직접 중첩해서 선언적으로 넘기는 경우(예: play/ui의 tree.html 개요 페이지)를 지원한다 -
// 원본/imperative API(append/insert)만 쓰는 예제는 data.children이 없으므로 영향 없다.
function makeNode(data: TreeNodeData): TreeNodeInternal {
    const node = reactive({
        data,
        parent: null,
        children: [],
        type: "open",
        index: null,
        nodenum: null,
        depth: 0
    }) as TreeNodeInternal
    if (Array.isArray(data.children)) {
        node.children = data.children.map(makeNode)
    }
    return node
}

const root = makeNode(props.root)
// node.index는 root 노드의 경우 null이다(reindex() 참고) - activeIndex의 '선택 없음' 상태도
// null이면 root와 값이 같아져 TreeNode.vue의 `active: ctx.activeIndex.value === props.node.index`가
// 페이지 로드 직후부터 root 노드에 거짓으로 true가 된다(hover도 dragEnd에서 동일 문제).
// 그래서 내부 센티널은 어떤 노드의 index와도 절대 같을 수 없는 undefined를 쓰고,
// 외부에 노출하는 getActiveIndex()에서만 원본 API대로 null로 변환한다.
const activeIndex = ref<string | null | undefined>(undefined)

function reindex(node: TreeNodeInternal, nodenum?: number, parent?: TreeNodeInternal | null) {
    if (parent !== undefined) node.parent = parent
    if (nodenum !== undefined) node.nodenum = nodenum
    node.index = node.parent ? (node.parent.index == null ? String(node.nodenum) : node.parent.index + "." + node.nodenum) : null
    node.depth = node.index == null ? 0 : node.index.split(".").length
    node.children.forEach((child, i) => reindex(child, i, node))
}
reindex(root)
if (props.rootFold) root.type = "fold"

function getNode(index: null): TreeNodeInternal[]
function getNode(index: string): TreeNodeInternal | null
function getNode(index: string | null): TreeNodeInternal[] | TreeNodeInternal | null
function getNode(index: string | null): TreeNodeInternal[] | TreeNodeInternal | null {
    if (index == null) return root.children
    const keys = keyParser.getIndexList(index)
    let node = root.children[keys[0]]
    for (let i = 1; i < keys.length && node; i++) node = node.children[keys[i]]
    return node || null
}
function getNodeParent(index: string): TreeNodeInternal {
    const keys = keyParser.getIndexList(index)
    if (keys.length === 1) return root
    return getNode(keys.slice(0, -1).join(".")) as TreeNodeInternal
}
function getNodeAll(index?: string | null): TreeNodeInternal[] {
    const result: TreeNodeInternal[] = []
    const start = index == null ? root.children : [getNode(index)].filter((n): n is TreeNodeInternal => n !== null)
    ;(function collect(list: TreeNodeInternal[]) {
        for (const n of list) {
            result.push(n)
            if (n.children.length) collect(n.children)
        }
    })(start)
    return result
}

function append(dataList: TreeNodeData | TreeNodeData[]): TreeNodeInternal | undefined
function append(index: string, dataList: TreeNodeData | TreeNodeData[]): TreeNodeInternal | undefined
function append(): TreeNodeInternal | undefined {
    const hasIndex = arguments.length === 2
    let dataList = hasIndex ? arguments[1] : arguments[0]
    const index: string | null = hasIndex ? arguments[0] : null
    if (!Array.isArray(dataList)) dataList = [dataList]

    let created: TreeNodeInternal | undefined
    for (const data of dataList) {
        const parent = index != null ? getNode(index)! : root
        const node = makeNode(data)
        parent.children.push(node)
        created = node
    }
    reindex(root)
    return created
}

function insert(index: string, data: TreeNodeData | TreeNodeData[]): TreeNodeInternal | undefined {
    const dataList = Array.isArray(data) ? data : [data]
    let created: TreeNodeInternal | undefined
    for (const d of dataList) {
        if (root.children.length === 0 && parseInt(index, 10) === 0) {
            const node = makeNode(d)
            root.children.push(node)
            created = node
        } else {
            const parent = getNodeParent(index)
            const keys = keyParser.getIndexList(index)
            const pos = keys[keys.length - 1]
            const node = makeNode(d)
            node.parent = parent
            parent.children.splice(pos, 0, node)
            created = node
        }
    }
    reindex(root)
    return created
}

function update(index: string, data: Record<string, unknown>): void
function update(dataList: { index: string; data: TreeNodeData }[]): void
function update(indexOrList: string | { index: string; data: TreeNodeData }[], data?: Record<string, unknown>) {
    if (arguments.length === 2) {
        const node = getNode(indexOrList as string)
        if (!node) return
        Object.assign(node.data, data)
    } else {
        const dataList = indexOrList as { index: string; data: TreeNodeData }[]
        root.children.splice(0, root.children.length)
        for (const row of dataList) {
            const pIndex = keyParser.getParentIndex(row.index)
            if (pIndex == null) append(row.data)
            else append(pIndex, row.data)
        }
    }
    reindex(root)
}

function remove(index: string) {
    const node = getNode(index)
    if (!node || !node.parent) return
    const i = node.parent.children.indexOf(node)
    if (i >= 0) node.parent.children.splice(i, 1)
    reindex(root)
}

function reset() {
    root.children.splice(0, root.children.length)
    reindex(root)
}

function isDescendant(maybeDescendant: TreeNodeInternal, ancestor: TreeNodeInternal): boolean {
    let p = maybeDescendant.parent
    while (p) {
        if (p === ancestor) return true
        p = p.parent
    }
    return false
}

function move(index: string, targetIndex: string) {
    if (index === targetIndex) return
    const node = getNode(index)
    const targetParent = getNodeParent(targetIndex)
    if (!node || !targetParent) return
    if (targetParent === node || isDescendant(targetParent, node)) return

    const oldParent = node.parent
    if (oldParent) {
        const i = oldParent.children.indexOf(node)
        if (i >= 0) oldParent.children.splice(i, 1)
    }
    const keys = keyParser.getIndexList(targetIndex)
    const pos = Math.min(keys[keys.length - 1], targetParent.children.length)
    node.parent = targetParent
    targetParent.children.splice(pos, 0, node)
    reindex(root)
}

function open(index: string | null, e?: Event) {
    if (index == null && props.rootHide) return
    const node = index == null ? root : getNode(index)
    if (!node) return
    node.type = "open"
    emit("open", node, e)
}
function fold(index: string | null, e?: Event) {
    if (index == null && props.rootHide) return
    const node = index == null ? root : getNode(index)
    if (!node) return
    node.type = "fold"
    emit("fold", node, e)
}
function openAll(index?: string | null) {
    for (const n of getNodeAll(index)) n.type = "open"
    if (index == null) root.type = "open"
    emit("openall", index == null ? root : (getNode(index) ?? []))
}
function foldAll(index?: string | null) {
    for (const n of getNodeAll(index)) n.type = "fold"
    if (index == null) root.type = "fold"
    emit("foldall", index == null ? root : (getNode(index) ?? []))
}

function select(nodeOrIndex: TreeNodeInternal | string | null, e?: Event): TreeNodeInternal | undefined {
    const node = typeof nodeOrIndex === "object" ? nodeOrIndex : nodeOrIndex == null ? root : getNode(nodeOrIndex)
    if (!node) return
    activeIndex.value = node.index
    emit("select", node, e)
    return node
}
function unselect() {
    if (activeIndex.value == null) return
    const node = getNode(activeIndex.value)
    activeIndex.value = undefined
    return node
}

function list() {
    return root.children
}
function listAll() {
    return getNodeAll(null)
}
function listParents(index: string): TreeNodeInternal[] {
    const node = getNode(index)
    const parents: TreeNodeInternal[] = []
    let p = node && node.parent
    while (p && p.index != null) {
        parents.push(p)
        p = p.parent
    }
    return parents.reverse()
}
function get(index: string | null): TreeNodeInternal | null {
    if (index == null) return null
    return getNode(index)
}
function getAll(index: string | null): TreeNodeInternal[] | null {
    if (index == null) return null
    return getNodeAll(index)
}
function getActiveIndex(): string | null {
    return activeIndex.value ?? null
}
function getRoot() {
    return root
}

// ---- 드래그 앤 드롭 ----
// 원본(ui.js)은 두 가지 독립된 드롭 경로를 갖는다:
//   1) 노드 위에 직접 드롭 -> 그 노드의 마지막 자식으로 편입 (dragChild !== false일 때만)
//   2) 각 노드 위/마지막 자식 뒤에 깔아둔 반투명 .drag 바 위에 드롭 -> 형제 사이 특정
//      위치로 재배치 (dragChild 값과 무관하게 항상 동작)
// 예전엔 1)만 "문서화된 단순화"로 구현했지만, 그 결과 dragChild: false로 쓰는 예제
// (tree_3 등 - 원본에서는 "노드 위 직접 드롭"만 막고 형제 재배치는 여전히 되는 옵션)가
// 로컬에서는 드래그해도 아무 동작도 하지 않는 버그가 됐다. 원본처럼 별도 .drag 바 DOM을
// 절대좌표로 그리는 대신, 이미 존재하는 노드 자신의 mouseover 이벤트에서 커서가 그 행의
// 위쪽 절반인지 아래쪽 절반인지로 "이 노드 앞" / "이 노드가 마지막 자식이면 그 뒤"를
// 판정한다 - DOM 측정 patch 없이 같은 결과(형제 재배치, dragChild 무관)를 낸다.
//
// 원본은 jQuery 커스텀 이벤트라 리스너가 false를 리턴하면 그 자리에서 동작을 취소할 수
// 있었다(tree_drag.html 예제가 실제로 dragover/dragend에서 file 노드 위로는 못 옮기게
// false를 리턴함). Vue의 emit은 리스너의 리턴값을 모으지 않으므로, node/e 뒤에 취소용
// control 객체(preventDefault)를 세 번째 인자로 함께 넘기고 그 결과를 직접 확인한다.
const dragStart = ref<string | null>(null) // 드래그 시작 노드의 index
const dragEnd = ref<string | null | undefined>(undefined) // 현재 hover 중인 대상 노드의 index (activeIndex와 동일한 이유로 undefined가 '없음')
const dragBarRef = ref<{ index: string | null; after: boolean; nest: boolean }>({ index: null, after: false, nest: false }) // dragChild===false 모드에서 형제 재배치(index 앞/뒤) 또는 자식 편입(nest) 대상 - root 제외 모든 노드가 대상

function emitCancelable(
    name: "dragstart" | "dragover" | "dragend",
    node: TreeNodeInternal | null,
    nativeEvent: MouseEvent
): boolean {
    const control: TreeDragControl = {
        defaultPrevented: false,
        preventDefault() {
            this.defaultPrevented = true
        }
    }
    // emit()의 오버로드는 이벤트별로 node의 널 허용 여부가 갈리는데(dragend만 null 허용),
    // 이 헬퍼는 세 이벤트를 동일하게 다루는 공용 디스패치라 유니언 이름으로는 타입이 안
    // 맞는다 - 실제 인자 형태는 각 emitCancelable 호출부가 이미 올바르게 보장한다.
    ;(emit as (name: string, node: TreeNodeInternal | null, e: MouseEvent, control: TreeDragControl) => void)(
        name,
        node,
        nativeEvent,
        control
    )
    return !control.defaultPrevented
}

function dragStartNode(node: TreeNodeInternal, e: MouseEvent) {
    if (dragStart.value != null) return
    if (!emitCancelable("dragstart", node, e)) return
    dragStart.value = node.index
}
function dragOverNode(node: TreeNodeInternal, e: MouseEvent) {
    if (dragStart.value == null || dragStart.value === node.index) return
    if (props.dragChild === false) return
    if (!emitCancelable("dragover", node, e)) return
    dragEnd.value = node.index
}
function lastChildSlotIndex(node: TreeNodeInternal): string {
    const lastChild = node.children.at(-1)
    return lastChild ? keyParser.getNextIndex(lastChild.index as string) : node.index + ".0"
}

function dragDropOnNode(node: TreeNodeInternal, e: MouseEvent) {
    if (dragStart.value == null) {
        dragStart.value = null
        dragEnd.value = undefined
        return
    }
    if (props.dragChild !== false && dragStart.value !== node.index) {
        const target = getNode(node.index as string)
        if (emitCancelable("dragend", get(node.index), e)) {
            move(dragStart.value, lastChildSlotIndex(target!))
        }
    }
    dragStart.value = null
    dragEnd.value = undefined
}

function dragBarOverNode(node: TreeNodeInternal, e: MouseEvent) {
    if (props.dragChild !== false) return // 1)번 경로가 열려 있으면 형제 재배치는 관여하지 않는다
    if (dragStart.value == null || dragStart.value === node.index) return
    if (node.parent == null) return // 원본도 root는 재배치 대상에서 제외

    // 아이콘/제목을 담은 행(row)만의 높이를 써야 한다 - li 전체엔 열린 자식 <ul>까지
    // 포함돼 있어서 그 높이를 쓰면 자식이 있는 노드에서 판정이 어긋난다.
    const row = (e.currentTarget as HTMLElement).children[1] as HTMLElement | undefined
    const isLastChild = node.parent.children.at(-1) === node
    let after = false
    let nest = false

    if (row) {
        const rect = row.getBoundingClientRect()
        const ratio = rect.height > 0 ? (e.clientY - rect.top) / rect.height : e.clientY > 0 ? 1 : 0

        // root를 제외한 모든 노드는 리프/폴더 구분 없이 자유롭게 이동 대상이 된다 - 행
        // 가운데(50%)에 놓으면 그 노드의 자식으로 편입(이미 자식이 있는 폴더든, 자식이
        // 없어져서 리프가 된 노드든 동일하게 다시 폴더가 됨), 위/아래 가장자리는 형제
        // 재배치. 자기 자신/자손으로의 이동은 move()가 알아서 무시한다.
        if (ratio > 0.25 && ratio < 0.75) {
            nest = true
        } else {
            after = isLastChild && ratio >= 0.75
        }
    }

    dragBarRef.value = { index: node.index, after, nest }
}
function dragBarDrop() {
    if (props.dragChild !== false) return
    const { index, after, nest } = dragBarRef.value
    if (dragStart.value != null && index != null && index !== dragStart.value) {
        if (nest) {
            move(dragStart.value, lastChildSlotIndex(getNode(index)!))
        } else {
            move(dragStart.value, after ? keyParser.getNextIndex(index) : index)
        }
    }
    dragStart.value = null
    dragBarRef.value = { index: null, after: false, nest: false }
}

provide("treeCtx", {
    activeIndex,
    dragEnd,
    dragBarRef,
    drag: props.drag,
    rootHide: props.rootHide,
    open,
    fold,
    select,
    dragStartNode,
    dragOverNode,
    dragDropOnNode,
    dragBarOverNode
})

defineExpose({
    append,
    insert,
    update,
    remove,
    reset,
    move,
    open,
    fold,
    openAll,
    foldAll,
    select,
    unselect,
    list,
    listAll,
    listParents,
    get,
    getAll,
    activeIndex: getActiveIndex,
    getRoot
})
</script>

<template>
    <ul class="tree" :class="variant" @mouseup.capture="dragBarDrop">
        <TreeNode :node="root" is-root>
            <template #default="slotProps"><slot v-bind="slotProps" /></template>
        </TreeNode>
    </ul>
</template>
