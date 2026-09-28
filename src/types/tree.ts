import type { Ref } from "vue"

/** Raw node data as given to the `root` prop / `append`/`insert`/`update` - arbitrary
 * app-defined fields (e.g. `title`, `href`, `disabled`), plus an optional nested `children`
 * list for declarative trees (see Tree.vue's `makeNode()`). */
export interface TreeNodeData {
    [key: string]: unknown
    children?: TreeNodeData[]
}

/** The reactive node graph Tree.vue actually builds from `TreeNodeData` (see `makeNode()`/
 * `reindex()`) - what TreeNode.vue and the CRUD API (`get`/`getAll`/`list`/...) work with. */
export interface TreeNodeInternal {
    data: TreeNodeData
    parent: TreeNodeInternal | null
    children: TreeNodeInternal[]
    type: "open" | "fold"
    index: string | null
    nodenum: number | null
    depth: number
}

/** Passed as the third argument to `dragstart`/`dragover`/`dragend` - lets a listener cancel
 * the in-progress drag operation the same way the legacy jQuery custom events' `return false`
 * did (see Tree.vue's `emitCancelable()`). */
export interface TreeDragControl {
    defaultPrevented: boolean
    preventDefault(): void
}

/** `provide("treeCtx", ...)`'s payload - everything TreeNode.vue needs from its ancestor
 * Tree.vue instance (state refs + the handlers a node's DOM events call into). */
export interface TreeCtx {
    activeIndex: Ref<string | null | undefined>
    dragEnd: Ref<string | null | undefined>
    dragBarRef: Ref<{ index: string | null; after: boolean; nest: boolean }>
    drag: boolean
    rootHide: boolean
    open(index: string | null, e?: Event): void
    fold(index: string | null, e?: Event): void
    select(node: TreeNodeInternal, e?: Event): TreeNodeInternal | undefined
    dragStartNode(node: TreeNodeInternal, e: MouseEvent): void
    dragOverNode(node: TreeNodeInternal, e: MouseEvent): void
    dragDropOnNode(node: TreeNodeInternal, e: MouseEvent): void
    dragBarOverNode(node: TreeNodeInternal, e: MouseEvent): void
}
