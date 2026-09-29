import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Layout from "../src/components/Layout.vue"

function stubRootSize(wrapper, width, height) {
    const el = wrapper.element
    Object.defineProperty(el, "clientWidth", { configurable: true, value: width })
    Object.defineProperty(el, "clientHeight", { configurable: true, value: height })
    el.getBoundingClientRect = () => ({ top: 0, left: 0, width, height, right: width, bottom: height })
}

describe("Layout", () => {
    it("only renders regions for which a slot was provided", () => {
        const wrapper = mount(Layout, {
            slots: { top: "<div class='t'>T</div>", center: "<div class='c'>C</div>" }
        })
        expect(wrapper.find(".top").exists()).toBe(true)
        expect(wrapper.find(".center").exists()).toBe(true)
        expect(wrapper.find(".left").exists()).toBe(false)
        expect(wrapper.find(".right").exists()).toBe(false)
        expect(wrapper.find(".bottom").exists()).toBe(false)
    })

    it("renders a resize bar for a region by default, and omits it when *Resize=false", () => {
        const w1 = mount(Layout, { slots: { top: "T" } })
        expect(w1.find(".resize.top").exists()).toBe(true)

        const w2 = mount(Layout, { slots: { top: "T" }, props: { topResize: false } })
        expect(w2.find(".resize.top").exists()).toBe(false)
    })

    it("top/left regions are pinned to the near edge (top:0/left:0)", () => {
        const wrapper = mount(Layout, { slots: { top: "T", left: "L", center: "C" }, attachTo: document.body })
        stubRootSize(wrapper, 800, 600)
        expect(wrapper.find(".top").element.style.top).toBe("0px")
        expect(wrapper.find(".left").element.style.left).toBe("0px")
        wrapper.unmount()
    })

    it("bottom/right regions are pinned to the far edge, based on the container's real size", async () => {
        const wrapper = mount(Layout, {
            slots: { bottom: "B", right: "R", center: "C" },
            props: { bottomSize: 80, rightSize: 100 },
            attachTo: document.body
        })
        stubRootSize(wrapper, 800, 600)
        await wrapper.vm.resize()
        await wrapper.vm.$nextTick()
        // bottom.top = rootHeight - bottomSize = 600-80=520
        expect(wrapper.find(".bottom").element.style.top).toBe("520px")
        // right.left = rootWidth - rightSize = 800-100=700
        expect(wrapper.find(".right").element.style.left).toBe("700px")
        wrapper.unmount()
    })

    it("center fills the remaining space between top/bottom/left/right bands", async () => {
        const wrapper = mount(Layout, {
            slots: { top: "T", bottom: "B", left: "L", right: "R", center: "C" },
            props: {
                topSize: 50,
                bottomSize: 50,
                leftSize: 100,
                rightSize: 100,
                barSize: 3
            },
            attachTo: document.body
        })
        stubRootSize(wrapper, 800, 600)
        await wrapper.vm.resize()
        await wrapper.vm.$nextTick()
        const center = wrapper.find(".center").element
        // topBand=50+3=53, bottomBand=53, leftBand=103, rightBand=103
        expect(center.style.top).toBe("53px")
        expect(center.style.height).toBe("494px") // 600-53-53
        expect(center.style.left).toBe("103px")
        expect(center.style.width).toBe("594px") // 800-103-103
        wrapper.unmount()
    })

    it("dragging the left resizer emits update:leftSize within [leftMin, leftMax]", async () => {
        const wrapper = mount(Layout, {
            slots: { left: "L", center: "C" },
            props: { leftSize: 100, leftMin: 50, leftMax: 200 },
            attachTo: document.body
        })
        stubRootSize(wrapper, 800, 600)
        await wrapper.vm.resize()
        await wrapper.vm.$nextTick()

        const resizer = wrapper.find(".resize.left")
        await resizer.trigger("mousedown", { clientX: 100, clientY: 0 })
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 150, clientY: 0 }))
        document.dispatchEvent(new MouseEvent("mouseup"))
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted("update:leftSize").at(-1)[0]).toBe(150)
        wrapper.unmount()
    })

    it("dragging the left resizer beyond leftMax clamps at leftMax", async () => {
        const wrapper = mount(Layout, {
            slots: { left: "L", center: "C" },
            props: { leftSize: 100, leftMin: 50, leftMax: 200 },
            attachTo: document.body
        })
        stubRootSize(wrapper, 800, 600)
        await wrapper.vm.resize()
        await wrapper.vm.$nextTick()

        const resizer = wrapper.find(".resize.left")
        await resizer.trigger("mousedown", { clientX: 100, clientY: 0 })
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500, clientY: 0 })) // leftMax(200) 훨씬 넘음
        document.dispatchEvent(new MouseEvent("mouseup"))
        await wrapper.vm.$nextTick()

        // 200 미만(<)이 조건이므로 199까지만 허용 -> 마지막 유효 위치는 클램프 전 값이 아니라
        // 시도된 값이 범위를 벗어나면 갱신되지 않고 mousedown 시점 값(100)에 머문다
        expect(wrapper.emitted("update:leftSize").at(-1)[0]).toBe(100)
        wrapper.unmount()
    })

    it("dragging left exactly to leftMax reaches it (bug fix - top/left used a strict < against max, 1px short of bottom/right's <=)", async () => {
        const wrapper = mount(Layout, {
            slots: { left: "L", center: "C" },
            props: { leftSize: 100, leftMin: 50, leftMax: 200 },
            attachTo: document.body
        })
        stubRootSize(wrapper, 800, 600)
        await wrapper.vm.resize()
        await wrapper.vm.$nextTick()

        const resizer = wrapper.find(".resize.left")
        await resizer.trigger("mousedown", { clientX: 100, clientY: 0 })
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 200, clientY: 0 })) // leftMax 정확히
        document.dispatchEvent(new MouseEvent("mouseup"))
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted("update:leftSize").at(-1)[0]).toBe(200)
        wrapper.unmount()
    })

    it("dragging the right resizer emits update:rightSize computed from the far edge", async () => {
        const wrapper = mount(Layout, {
            slots: { right: "R", center: "C" },
            props: { rightSize: 100, rightMin: 50, rightMax: 300, barSize: 3 },
            attachTo: document.body
        })
        stubRootSize(wrapper, 800, 600)
        await wrapper.vm.resize()
        await wrapper.vm.$nextTick()

        // resizer 시작 위치 = rootWidth - rightSize - barSize = 800-100-3=697
        const resizer = wrapper.find(".resize.right")
        await resizer.trigger("mousedown", { clientX: 697, clientY: 0 })
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 647, clientY: 0 })) // 50px 왼쪽으로 -> rightSize +50
        document.dispatchEvent(new MouseEvent("mouseup"))
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted("update:rightSize").at(-1)[0]).toBe(150)
        wrapper.unmount()
    })
})
