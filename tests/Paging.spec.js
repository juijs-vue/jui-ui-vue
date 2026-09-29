import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Paging from "../src/components/Paging.vue"

describe("Paging", () => {
    it("computes lastPage from count/pageCount and renders that many page links when under screenCount", () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10 } }) // lastPage = 4
        const pages = wrapper.findAll(".page").map((p) => p.text())
        expect(pages).toEqual(["1", "2", "3", "4"])
    })

    it("marks the current page active", () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10, modelValue: 2 } })
        const active = wrapper.find(".page.active")
        expect(active.text()).toBe("2")
    })

    it("clicking a page number emits update:modelValue and page", async () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10, modelValue: 1 } })
        await wrapper.findAll(".page")[2].trigger("click") // "3"

        expect(wrapper.emitted("update:modelValue")[0]).toEqual([3])
        expect(wrapper.emitted("page")[0]).toEqual([3])
    })

    it("next/prev move by one page and clamp at the edges", async () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10, modelValue: 1 } })

        await wrapper.find(".prev").trigger("click") // 이미 1페이지라 그대로 1 유지
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([1])

        await wrapper.find(".next").trigger("click")
        expect(wrapper.emitted("update:modelValue")[1]).toEqual([2])
    })

    it("exposed first()/last()/page() without args", async () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10, modelValue: 2 } })

        expect(wrapper.vm.page()).toBe(2) // 인자 없으면 현재 페이지 반환

        wrapper.vm.last()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([4])

        wrapper.vm.first()
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([1])
    })

    it("screenCount limits how many page numbers show, centered on the current page", () => {
        const wrapper = mount(Paging, { props: { count: 200, pageCount: 10, screenCount: 5, modelValue: 10 } }) // lastPage = 20
        const pages = wrapper.findAll(".page").map((p) => p.text())
        expect(pages).toHaveLength(5)
        expect(pages).toContain("10")
    })

    it("works without v-model: tracks the page internally", async () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10 } })
        await wrapper.findAll(".page")[1].trigger("click") // "2"

        expect(wrapper.find(".page.active").text()).toBe("2")
    })

    it("reload() resets to page 1 and emits reload", async () => {
        const wrapper = mount(Paging, { props: { count: 35, pageCount: 10, modelValue: 3 } })
        wrapper.vm.reload()
        await wrapper.vm.$nextTick()

        expect(wrapper.emitted("reload")).toHaveLength(1)
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([1])
    })

    it("with count=0 (no data yet), first()/last()/reload() still land on page 1, never page 0 (bug fix)", async () => {
        const wrapper = mount(Paging, { props: { count: 0, pageCount: 10 } })

        wrapper.vm.first()
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([1])

        wrapper.vm.last()
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([1])

        wrapper.vm.reload()
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([1])

        wrapper.vm.next()
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([1])
    })
})
