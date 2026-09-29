import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Accordion from "../src/components/Accordion.vue"

const items = [
    { title: "Group Item #1", value: "a" },
    { title: "Group Item #2", value: "b" },
    { title: "Group Item #3", value: "c" }
]

describe("Accordion", () => {
    it("opens the panel at modelValue and shows only that content", () => {
        const wrapper = mount(Accordion, { props: { items, modelValue: 1 } })
        const titles = wrapper.findAll(".title")
        const contents = wrapper.findAll(".content")

        expect(titles[1].classes()).toContain("active")
        expect(titles[0].classes()).not.toContain("active")
        expect(contents[1].isVisible()).toBe(true)
        expect(contents[0].isVisible()).toBe(false)
    })

    it("clicking a different title emits update:modelValue and open (single-panel mode)", async () => {
        const wrapper = mount(Accordion, { props: { items, modelValue: 0 } })
        await wrapper.findAll(".title")[2].trigger("click")

        expect(wrapper.emitted("update:modelValue")[0]).toEqual([2])
        expect(wrapper.emitted("open")[0]).toEqual([2, expect.anything()])
    })

    it("without autoFold, clicking the already-open title re-emits open and stays open", async () => {
        const wrapper = mount(Accordion, { props: { items, modelValue: 0, autoFold: false } })
        await wrapper.findAll(".title")[0].trigger("click")

        expect(wrapper.emitted("open")[0]).toEqual([0, expect.anything()])
        expect(wrapper.emitted("fold")).toBeUndefined()
    })

    it("with autoFold, clicking the already-open title folds it", async () => {
        const wrapper = mount(Accordion, { props: { items, modelValue: 0, autoFold: true } })
        await wrapper.findAll(".title")[0].trigger("click")

        expect(wrapper.emitted("fold")[0]).toEqual([0, expect.anything()])
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([null])
    })

    it("multipanel: multiple panels can be open at once, tracked as an array", async () => {
        const wrapper = mount(Accordion, { props: { items, modelValue: [0], multipanel: true } })
        await wrapper.findAll(".title")[2].trigger("click")

        expect(wrapper.emitted("update:modelValue")[0]).toEqual([[0, 2]])
    })

    it("multipanel + autoFold: folding one panel removes only its own index", async () => {
        const wrapper = mount(Accordion, {
            props: { items, modelValue: [0, 2], multipanel: true, autoFold: true }
        })
        await wrapper.findAll(".title")[0].trigger("click")

        expect(wrapper.emitted("update:modelValue")[0]).toEqual([[2]])
    })

    it("renders named content slots keyed by item value", () => {
        const wrapper = mount(Accordion, {
            props: { items, modelValue: 1 },
            slots: {
                "content-a": "<p class=\"content-a\">A</p>",
                "content-b": "<p class=\"content-b\">B</p>"
            }
        })

        expect(wrapper.find(".content-b").isVisible()).toBe(true)
        expect(wrapper.find(".content-a").isVisible()).toBe(false)
    })

    it("works without v-model: tracks state internally", async () => {
        const wrapper = mount(Accordion, { props: { items } })
        await wrapper.findAll(".title")[1].trigger("click")

        expect(wrapper.findAll(".title")[1].classes()).toContain("active")
    })

    it("exposed activeIndex() returns the real open index (원본의 항상 0 반환하던 죽은 코드를 고침)", async () => {
        const wrapper = mount(Accordion, { props: { items, modelValue: 0 } })
        await wrapper.findAll(".title")[2].trigger("click")
        await wrapper.setProps({ modelValue: 2 })

        expect(wrapper.vm.activeIndex()).toBe(2)
    })

    it("emits init once on mount", () => {
        const wrapper = mount(Accordion, { props: { items } })
        expect(wrapper.emitted("init")).toHaveLength(1)
    })

    it("content: null falls back to the named slot instead of rendering nothing (bug fix - typeof null === 'object')", () => {
        const itemsWithNullContent = [{ title: "Item", value: "x", content: null }]
        const wrapper = mount(Accordion, {
            props: { items: itemsWithNullContent, modelValue: 0 },
            slots: { "content-x": "<p class=\"content-x\">from slot</p>" }
        })
        expect(wrapper.find(".content-x").exists()).toBe(true)
    })
})
