import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import AutoComplete from "../src/components/AutoComplete.vue"

const words = ["Java", "JavaScript", "Python", "Ruby", "C", "C++"]

describe("AutoComplete", () => {
    it("shows no dropdown when input is empty and showAll is false", () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "", words } })
        expect(wrapper.find(".dropdown").exists()).toBe(false)
    })

    it("inputStyle applies to the actual input, not the wrapper (root class/style still go to the wrapper)", () => {
        const wrapper = mount(AutoComplete, {
            props: { modelValue: "", words, inputStyle: "width: 100px" },
            attrs: { class: "group" }
        })

        expect(wrapper.find("input").attributes("style")).toContain("width: 100px")
        expect(wrapper.classes()).toContain("group")
        expect(wrapper.classes()).toContain("ac")
    })

    it("typing filters words case-insensitively by substring and opens the dropdown", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "", words } })
        const input = wrapper.find("input")

        await input.setValue("java")
        await input.trigger("keyup")

        const items = wrapper.findAll(".dropdown li")
        expect(items.map((i) => i.text())).toEqual(["Java", "JavaScript"])
    })

    it("emits update:modelValue as the user types", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "", words } })
        await wrapper.find("input").setValue("py")

        expect(wrapper.emitted("update:modelValue")[0]).toEqual(["py"])
    })

    it("clicking a dropdown item selects it and emits change", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "java", words } })
        await wrapper.find("input").trigger("keyup")

        await wrapper.findAll(".dropdown li")[1].trigger("mousedown")

        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["JavaScript"])
        expect(wrapper.emitted("change")[0][0]).toBe("JavaScript")
    })

    it("showAll: focusing an empty input shows every word", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "", words, showAll: true } })
        await wrapper.find("input").trigger("focus")

        expect(wrapper.findAll(".dropdown li")).toHaveLength(words.length)
    })

    it("ArrowDown/ArrowUp move the highlighted item, Enter selects it", async () => {
        const wrapper = mount(AutoComplete, {
            props: { modelValue: "ap", words: ["Apple", "Apricot", "Banana"] }
        })
        const input = wrapper.find("input")
        await input.trigger("keyup") // opens dropdown for "Apple", "Apricot"

        await input.trigger("keydown", { key: "ArrowDown" })
        expect(wrapper.findAll(".dropdown li")[0].classes()).toContain("active")

        await input.trigger("keydown", { key: "ArrowDown" })
        expect(wrapper.findAll(".dropdown li")[1].classes()).toContain("active")

        await input.trigger("keydown", { key: "Enter" })
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["Apricot"])
    })

    it("Escape closes the dropdown", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "java", words } })
        await wrapper.find("input").trigger("keyup")
        expect(wrapper.find(".dropdown").exists()).toBe(true)

        await wrapper.find("input").trigger("keydown", { key: "Escape" })
        expect(wrapper.find(".dropdown").exists()).toBe(false)
    })

    it("typing (input event alone, no keyup - e.g. paste) still opens the dropdown (bug fix - open state used to only sync from keyup)", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "", words } })
        await wrapper.find("input").setValue("java") // setValue만 - keyup은 일부러 트리거하지 않는다

        const items = wrapper.findAll(".dropdown li")
        expect(items.map((i) => i.text())).toEqual(["Java", "JavaScript"])
    })

    it("external words prop changes are reflected without calling update() (bug fix - used to only apply at initial render)", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "rub", words: [] } })
        expect(wrapper.find(".dropdown").exists()).toBe(false)

        await wrapper.setProps({ words: ["Ruby", "Rust"] })
        await wrapper.find("input").trigger("keyup")

        expect(wrapper.vm.list()).toEqual(["Ruby"])
    })

    it("exposed update()/close()/list()", async () => {
        const wrapper = mount(AutoComplete, { props: { modelValue: "rub", words: [] } })

        wrapper.vm.update(["Ruby", "Rust"])
        await wrapper.find("input").trigger("keyup")

        expect(wrapper.vm.list()).toEqual(["Ruby"])

        wrapper.vm.close()
        await wrapper.vm.$nextTick()
        expect(wrapper.find(".dropdown").exists()).toBe(false)
    })
})
