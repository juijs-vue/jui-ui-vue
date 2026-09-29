import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Combo from "../src/components/Combo.vue"

const items = [
    { value: "a", text: "Apple" },
    { value: "b", text: "Banana" },
    { divider: true },
    { value: "c", text: "Cherry" }
]

describe("Combo", () => {
    it("shows the item at `index` as the button text when no modelValue is given", () => {
        const wrapper = mount(Combo, { props: { items, index: 1 } })
        expect(wrapper.find(".btn").text()).toBe("Banana")
    })

    it("modelValue overrides `index` when it matches an item's value", () => {
        const wrapper = mount(Combo, { props: { items, index: 0, modelValue: "c" } })
        expect(wrapper.find(".btn").text()).toBe("Cherry")
    })

    it("the dropdown list is hidden until the toggle button is clicked", async () => {
        // .combo > ul은 CSS(combo.less)에서 이미 display:none이므로, jsdom처럼 실제 스타일시트가
        // 로드되지 않는 환경에서는 isVisible()만으로 이 값을 못 잡는다(브라우저 기본값인 block으로
        // 오판). 인라인 style.display 값 자체를 명시적으로 검증한다(Dropdown.vue와 동일한 교훈).
        const wrapper = mount(Combo, { props: { items }, attachTo: document.body })
        expect(wrapper.find("ul").element.style.display).toBe("none")
        await wrapper.find(".toggle").trigger("click")
        expect(wrapper.find("ul").element.style.display).toBe("block")
        wrapper.unmount()
    })

    it("clicking a selectable <li> emits update:modelValue and change, and closes the dropdown", async () => {
        const wrapper = mount(Combo, { props: { items }, attachTo: document.body })
        await wrapper.find(".toggle").trigger("click")
        await wrapper.findAll("li")[1].trigger("click")
        expect(wrapper.emitted("update:modelValue")[0]).toEqual(["b"])
        expect(wrapper.emitted("change")[0][0]).toEqual({ index: 1, value: "b", text: "Banana" })
        expect(wrapper.find("ul").isVisible()).toBe(false)
        wrapper.unmount()
    })

    it("clicking a divider <li> does not emit change", async () => {
        const wrapper = mount(Combo, { props: { items } })
        await wrapper.find(".toggle").trigger("click")
        await wrapper.findAll("li")[2].trigger("click")
        expect(wrapper.emitted("change")).toBeUndefined()
    })

    it("clicking a divider <li> does not close the dropdown (bug fix - hideAll() used to fire unconditionally)", async () => {
        const wrapper = mount(Combo, { props: { items }, attachTo: document.body })
        await wrapper.find(".toggle").trigger("click")
        expect(wrapper.find("ul").isVisible()).toBe(true)
        await wrapper.findAll("li")[2].trigger("click")
        expect(wrapper.find("ul").isVisible()).toBe(true)
        wrapper.unmount()
    })

    it("exposed setIndex/setValue on a divider are a no-op (bug fix - used to select the divider itself)", () => {
        const wrapper = mount(Combo, { props: { items } })
        wrapper.vm.setIndex(2) // divider의 index
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()

        wrapper.vm.setValue(undefined) // divider의 value(undefined)
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    })

    it("clicking outside the combo (document click) closes it", async () => {
        const wrapper = mount(Combo, { props: { items }, attachTo: document.body })
        await wrapper.find(".toggle").trigger("click")
        expect(wrapper.find("ul").isVisible()).toBe(true)

        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(wrapper.find("ul").isVisible()).toBe(false)
        wrapper.unmount()
    })

    it("clicking the toggle button itself does not bubble up and immediately re-close it", async () => {
        const wrapper = mount(Combo, { props: { items }, attachTo: document.body })
        await wrapper.find(".toggle").trigger("click")
        expect(wrapper.find("ul").isVisible()).toBe(true)
        wrapper.unmount()
    })

    it("exposed setIndex/setValue/getData/getValue/getText mirror the 원본 imperative API", async () => {
        const wrapper = mount(Combo, { props: { items } })
        wrapper.vm.setIndex(3)
        expect(wrapper.emitted("update:modelValue")[0]).toEqual(["c"])

        await wrapper.setProps({ modelValue: "c" })
        expect(wrapper.vm.getData()).toEqual({ index: 3, value: "c", text: "Cherry" })
        expect(wrapper.vm.getValue()).toBe("c")
        expect(wrapper.vm.getText()).toBe("Cherry")

        wrapper.vm.setValue("a")
        expect(wrapper.emitted("update:modelValue")[1]).toEqual(["a"])
    })

    it("keydown navigation starts from the current index(0=Apple), 'down' moves to Banana, and skips the divider", async () => {
        const wrapper = mount(Combo, { props: { items, keydown: true }, attachTo: document.body })
        await wrapper.find(".toggle").trigger("click")

        // 원본은 keydown 활성화 시 init()에서 index = options.index(기본 0)로 커서를 미리
        // 맞춰둔다(selectItem 호출) — 첫 'down'이 이미 다음 항목(Banana)으로 이동시킨다.
        window.dispatchEvent(new KeyboardEvent("keydown", { which: 40 })) // down: Apple(0) -> Banana(1)
        window.dispatchEvent(new KeyboardEvent("keydown", { which: 13 })) // enter -> Banana 선택

        expect(wrapper.emitted("change")[0][0]).toEqual({ index: 1, value: "b", text: "Banana" })
        wrapper.unmount()
    })

    it("keydown 'down' skips over a divider to land on the next selectable item", async () => {
        const wrapper = mount(Combo, { props: { items, keydown: true }, attachTo: document.body })
        await wrapper.find(".toggle").trigger("click")

        window.dispatchEvent(new KeyboardEvent("keydown", { which: 40 })) // Apple -> Banana
        window.dispatchEvent(new KeyboardEvent("keydown", { which: 40 })) // Banana -> divider 건너뛰고 Cherry
        window.dispatchEvent(new KeyboardEvent("keydown", { which: 13 })) // enter -> Cherry 선택

        expect(wrapper.emitted("change")[0][0]).toEqual({ index: 3, value: "c", text: "Cherry" })
        wrapper.unmount()
    })
})
