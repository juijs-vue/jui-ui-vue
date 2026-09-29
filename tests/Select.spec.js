import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Select from "../src/components/Select.vue"

const items = [
    { value: "jennifer", text: "Jennifer" },
    { value: "dark", text: "Dark" },
    { value: "pastel", html: "<strong>Pastel</strong>" },
    { type: "divider" },
    { value: "pattern", text: "Pattern" }
]

describe("Select", () => {
    it("shows the placeholder when nothing is selected", () => {
        const wrapper = mount(Select, { props: { items, placeholder: "THEME" } })
        expect(wrapper.find(".title-content").text()).toBe("THEME")
    })

    it("clicking the title toggles the open class", async () => {
        const wrapper = mount(Select, { props: { items } })
        expect(wrapper.classes()).not.toContain("open")

        await wrapper.find(".title").trigger("click")
        expect(wrapper.classes()).toContain("open")
    })

    it("renders a divider for type: 'divider' items", () => {
        const wrapper = mount(Select, { props: { items } })
        expect(wrapper.find("hr.item.divider").exists()).toBe(true)
        expect(wrapper.findAll(".item.option")).toHaveLength(4)
    })

    it("clicking an option selects it, closes the dropdown, and emits change", async () => {
        const wrapper = mount(Select, { props: { items } })
        await wrapper.find(".title").trigger("click")

        await wrapper.findAll(".item.option")[1].trigger("click") // "dark"

        expect(wrapper.emitted("update:modelValue")[0]).toEqual(["dark"])
        expect(wrapper.emitted("change")[0]).toEqual(["dark", undefined])
        expect(wrapper.classes()).not.toContain("open")
        expect(wrapper.find(".title-content").text()).toBe("Dark")
    })

    it("renders raw html items via v-html", async () => {
        const wrapper = mount(Select, { props: { items, modelValue: "pastel" } })
        expect(wrapper.find(".item.option.selected strong").text()).toBe("Pastel")
    })

    it("string items are normalized to { text, value }", () => {
        const wrapper = mount(Select, { props: { items: ["A", "B"] } })
        const options = wrapper.findAll(".item.option")
        expect(options.map((o) => o.text())).toEqual(["A", "B"])
    })

    it("multi: clicking toggles items in/out of the array and dropdown stays open", async () => {
        const wrapper = mount(Select, { props: { items, multi: true } })
        await wrapper.find(".title").trigger("click")

        await wrapper.findAll(".item.option")[0].trigger("click") // jennifer
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([["jennifer"]])
        expect(wrapper.classes()).toContain("open") // multi는 선택해도 안 닫힌다

        await wrapper.setProps({ modelValue: ["jennifer"] })
        await wrapper.findAll(".item.option")[1].trigger("click") // dark 추가
        expect(wrapper.emitted("update:modelValue")[1]).toEqual([["jennifer", "dark"]])
    })

    it("applies align/valign classes", () => {
        const wrapper = mount(Select, { props: { items, align: "right", valign: "bottom" } })
        expect(wrapper.classes()).toContain("select-right")
        expect(wrapper.classes()).toContain("select-bottom")
    })

    it("items with selected:true seed the initial value when no v-model is given", () => {
        const wrapper = mount(Select, {
            props: { items: [{ value: "a", text: "A", selected: true }, { value: "b", text: "B" }] }
        })
        expect(wrapper.find(".title-content").text()).toBe("A")
    })

    it("exposed getValue/setValue/getSelectedIndex/setSelectedIndex", async () => {
        const wrapper = mount(Select, { props: { items, modelValue: "dark" } })

        expect(wrapper.vm.getValue()).toBe("dark")
        expect(wrapper.vm.getSelectedIndex()).toBe(1)

        wrapper.vm.setSelectedIndex(0)
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["jennifer"])
    })

    it("multi: exposed setSelectedIndex toggles into the existing selection instead of replacing it (bug fix)", () => {
        const wrapper = mount(Select, { props: { items, multi: true, modelValue: ["jennifer", "dark"] } })

        wrapper.vm.setSelectedIndex(4) // "pattern" - 기존에 없던 값이므로 추가돼야 한다
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([["jennifer", "dark", "pattern"]])
    })

    it("multi: exposed setSelectedIndex on an already-selected item removes it (toggle off)", async () => {
        const wrapper = mount(Select, { props: { items, multi: true, modelValue: ["jennifer", "dark"] } })

        wrapper.vm.setSelectedIndex(0) // "jennifer" - 이미 선택돼 있으므로 제거돼야 한다
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([["dark"]])
    })

    it("clicking outside closes the dropdown", async () => {
        const wrapper = mount(Select, { props: { items }, attachTo: document.body })
        await wrapper.find(".title").trigger("click")
        expect(wrapper.classes()).toContain("open")

        document.body.click()
        await wrapper.vm.$nextTick()
        expect(wrapper.classes()).not.toContain("open")

        wrapper.unmount()
    })
})
