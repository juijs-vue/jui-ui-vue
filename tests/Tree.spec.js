import { describe, it, expect, vi } from "vitest"
import { mount } from "@vue/test-utils"
import Tree from "../src/components/Tree.vue"

describe("Tree", () => {
    it("renders the root node's title", () => {
        const wrapper = mount(Tree, { props: { root: { title: "C:\\" } } })
        expect(wrapper.find("li.root").text()).toContain("C:\\")
    })

    it("append(data) adds a top-level child under the root", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "child1" })
        expect(wrapper.vm.list()).toHaveLength(1)
        expect(wrapper.vm.list()[0].data.title).toBe("child1")
        expect(wrapper.vm.list()[0].index).toBe("0")
    })

    it("append(index, data) adds a child under the node at that index", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" })
        const node = wrapper.vm.get("0")
        expect(node.children).toHaveLength(1)
        expect(node.children[0].data.title).toBe("a-child")
        expect(node.children[0].index).toBe("0.0")
    })

    it("remove(index) deletes a node and its subtree", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        wrapper.vm.remove("0")
        expect(wrapper.vm.list()).toHaveLength(1)
        expect(wrapper.vm.list()[0].data.title).toBe("b")
        expect(wrapper.vm.list()[0].index).toBe("0") // 재인덱싱됨
    })

    it("open(index)/fold(index) toggle a node's children visibility and emit events", async () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" })
        await wrapper.vm.$nextTick()

        wrapper.vm.fold("0")
        expect(wrapper.emitted("fold")).toBeTruthy()
        expect(wrapper.vm.get("0").type).toBe("fold")

        wrapper.vm.open("0")
        expect(wrapper.emitted("open")).toBeTruthy()
        expect(wrapper.vm.get("0").type).toBe("open")
    })

    it("select(index) sets activeIndex() and emits select", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.select("0")
        expect(wrapper.vm.activeIndex()).toBe("0")
        expect(wrapper.emitted("select")[0][0].data.title).toBe("a")
    })

    it("clicking a node's label emits select via the DOM", async () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        await wrapper.vm.$nextTick()
        await wrapper.find("li:not(.root) > div").trigger("click")
        expect(wrapper.emitted("select")).toBeTruthy()
    })

    it("clicking the toggle icon folds an open node with children", async () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" })
        await wrapper.vm.$nextTick()

        const aNode = wrapper.findAll("li")[1] // [0]=root, [1]=a
        await aNode.find("i").trigger("click")
        expect(wrapper.vm.get("0").type).toBe("fold")
    })

    it("move(index, targetIndex) reparents a node and updates indices", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        wrapper.vm.move("1", "0.0") // b를 a의 자식으로
        expect(wrapper.vm.list()).toHaveLength(1)
        expect(wrapper.vm.get("0").children).toHaveLength(1)
        expect(wrapper.vm.get("0").children[0].data.title).toBe("b")
    })

    it("move() refuses to move a node into its own descendant", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" })
        wrapper.vm.move("0", "0.0.0") // a를 자기 자손 밑으로 옮기려는 시도 -> 무시되어야 함
        expect(wrapper.vm.list()).toHaveLength(1)
        expect(wrapper.vm.get("0").data.title).toBe("a")
    })

    it("listAll()/getAll() return the node and all descendants flattened", () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" } } })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" })
        expect(wrapper.vm.listAll()).toHaveLength(2)
        expect(wrapper.vm.getAll("0")).toHaveLength(2) // a 자신 + a-child
    })

    it("rootHide=true hides the root row but keeps its children visible", async () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" }, rootHide: true } })
        wrapper.vm.append({ title: "a" })
        await wrapper.vm.$nextTick()
        const rootLi = wrapper.find("li.root")
        expect(rootLi.find("i").isVisible()).toBe(false)
        expect(wrapper.find("li:not(.root)").text()).toContain("a")
    })

    it("drag=true: dropping a dragged node onto another node moves it as that node's last child", async () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" }, drag: true }, attachTo: document.body })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        await wrapper.vm.$nextTick()

        const items = wrapper.findAll("li:not(.root)")
        await items[0].trigger("mousedown") // a 드래그 시작
        await items[1].trigger("mouseup") // b 위에 드롭

        expect(wrapper.vm.get("0").data.title).toBe("b")
        expect(wrapper.vm.get("0").children[0].data.title).toBe("a")
        wrapper.unmount()
    })

    it("drag=true: mousedown on the root row never starts a drag (bug fix - root's real index is null, same as the 'no drag' sentinel, so dragstart used to fire but dragover/dragend never followed)", async () => {
        const wrapper = mount(Tree, { props: { root: { title: "root" }, drag: true }, attachTo: document.body })
        wrapper.vm.append({ title: "a" })
        await wrapper.vm.$nextTick()

        await wrapper.find("li.root").trigger("mousedown")
        expect(wrapper.emitted("dragstart")).toBeUndefined()

        await wrapper.findAll("li:not(.root)")[0].trigger("mouseup")
        expect(wrapper.emitted("dragend")).toBeUndefined()
        // 드래그가 애초에 시작되지 않았으니 재배치도 없어야 한다
        expect(wrapper.vm.list()[0].data.title).toBe("a")
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: dropping directly onto a node does nothing (matches original ui.js)", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        await wrapper.vm.$nextTick()

        const items = wrapper.findAll("li:not(.root)")
        await items[0].trigger("mousedown") // a 드래그 시작
        await items[1].trigger("mouseup") // b 위에 드롭(자식으로 편입 시도)

        expect(wrapper.vm.list()[0].data.title).toBe("a")
        expect(wrapper.vm.list()[1].data.title).toBe("b")
        expect(wrapper.vm.get("0").children).toHaveLength(0)
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: dropping on a node's top half reorders it as a preceding sibling", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        wrapper.vm.append({ title: "c" })
        await wrapper.vm.$nextTick()

        const items = wrapper.findAll("li:not(.root)")
        await items[2].trigger("mousedown") // c 드래그 시작
        // b 행의 위쪽 절반에서 mousemove -> "b 앞"으로 재배치 판정
        await items[1].trigger("mousemove", { clientY: 0 })
        await items[1].trigger("mouseup")

        expect(wrapper.vm.list().map((n) => n.data.title)).toEqual(["a", "c", "b"])
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: dropping on the last sibling's bottom half appends it after that sibling", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        wrapper.vm.append({ title: "c" })
        await wrapper.vm.$nextTick()

        const items = wrapper.findAll("li:not(.root)")
        await items[0].trigger("mousedown") // a 드래그 시작
        // c(마지막 형제) 행의 아래쪽 절반에서 mousemove -> "c 뒤"로 재배치 판정
        await items[2].trigger("mousemove", { clientY: 1000 })
        await items[2].trigger("mouseup")

        expect(wrapper.vm.list().map((n) => n.data.title)).toEqual(["b", "c", "a"])
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: sibling-reorder path emits dragover/dragend too (bug fix - it used to skip both)", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        wrapper.vm.append({ title: "c" })
        await wrapper.vm.$nextTick()

        const items = wrapper.findAll("li:not(.root)")
        await items[2].trigger("mousedown") // c 드래그 시작
        await items[1].trigger("mousemove", { clientY: 0 }) // b 앞으로 재배치 판정
        await items[1].trigger("mouseup")

        expect(wrapper.emitted("dragover")).toBeTruthy()
        expect(wrapper.emitted("dragover")[0][0].data.title).toBe("b")
        expect(wrapper.emitted("dragend")).toBeTruthy()
        expect(wrapper.emitted("dragend")[0][0].data.title).toBe("b")
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: canceling dragend via preventDefault blocks the sibling reorder", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append({ title: "b" })
        wrapper.vm.append({ title: "c" })
        await wrapper.vm.$nextTick()

        const onDragend = vi.fn((_node, _e, control) => control.preventDefault())
        await wrapper.setProps({ onDragend })

        const items = wrapper.findAll("li:not(.root)")
        await items[2].trigger("mousedown") // c 드래그 시작
        await items[1].trigger("mousemove", { clientY: 0 })
        await items[1].trigger("mouseup")

        expect(onDragend).toHaveBeenCalled()
        // 취소됐으므로 순서가 그대로여야 한다 (재배치가 실행되지 않음)
        expect(wrapper.vm.list().map((n) => n.data.title)).toEqual(["a", "b", "c"])
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: dropping on a leaf node's middle nests it as that node's child (leaf -> folder)", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" }) // 원래 자식이 있었다가 지금은 빈 리프가 된 노드 역할
        wrapper.vm.append({ title: "b" })
        await wrapper.vm.$nextTick()

        const rectSpy = vi
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue({ top: 0, height: 30 })

        const items = wrapper.findAll("li:not(.root)")
        await items[1].trigger("mousedown") // b 드래그 시작
        // a(리프)의 가운데(15/30)에서 mousemove -> "a의 자식으로 편입"(폴더화) 판정
        await items[0].trigger("mousemove", { clientY: 15 })
        await items[0].trigger("mouseup")

        expect(wrapper.vm.list()).toHaveLength(1)
        expect(wrapper.vm.get("0").data.title).toBe("a")
        expect(wrapper.vm.get("0").children).toHaveLength(1)
        expect(wrapper.vm.get("0").children[0].data.title).toBe("b")

        rectSpy.mockRestore()
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: dropping on an existing folder's middle also nests it as a new child (root 제외 자유 이동)", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" }) // a는 이미 자식이 있는 폴더
        wrapper.vm.append({ title: "b" })
        await wrapper.vm.$nextTick()

        const rectSpy = vi
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue({ top: 0, height: 30 })

        const items = wrapper.findAll("li:not(.root)")
        await items[items.length - 1].trigger("mousedown") // b 드래그 시작
        await items[0].trigger("mousemove", { clientY: 15 }) // a(폴더)의 가운데
        await items[0].trigger("mouseup")

        const aNode = wrapper.vm.listAll().find((n) => n.data.title === "a")
        expect(aNode.children.map((n) => n.data.title)).toEqual(["a-child", "b"])

        rectSpy.mockRestore()
        wrapper.unmount()
    })

    it("drag=true, dragChild=false: a folder cannot be dropped onto its own descendant", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" }, drag: true, dragChild: false },
            attachTo: document.body
        })
        wrapper.vm.append({ title: "a" })
        wrapper.vm.append("0", { title: "a-child" })
        await wrapper.vm.$nextTick()

        const rectSpy = vi
            .spyOn(HTMLElement.prototype, "getBoundingClientRect")
            .mockReturnValue({ top: 0, height: 30 })

        const items = wrapper.findAll("li:not(.root)")
        await items[0].trigger("mousedown") // a(부모) 드래그 시작
        await items[1].trigger("mousemove", { clientY: 15 }) // a-child(자기 자손)의 가운데
        await items[1].trigger("mouseup")

        expect(wrapper.vm.list().map((n) => n.data.title)).toEqual(["a"]) // 무시됨, 트리 구조 그대로

        rectSpy.mockRestore()
        wrapper.unmount()
    })

    it("custom #default scoped slot overrides the default node label", async () => {
        const wrapper = mount(Tree, {
            props: { root: { title: "root" } },
            slots: { default: `<template #default="{ node }"><b>{{ node.data.title }}!!</b></template>` }
        })
        wrapper.vm.append({ title: "a" })
        await wrapper.vm.$nextTick()
        expect(wrapper.find("li.root b").text()).toBe("root!!")
    })
})
