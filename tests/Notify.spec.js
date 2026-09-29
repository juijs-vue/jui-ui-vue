import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { mount } from "@vue/test-utils"
import Notify from "../src/components/Notify.vue"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("Notify", () => {
    it("add() renders a .notify item with title/message and emits show", async () => {
        const wrapper = mount(Notify, { props: { timeout: 0 } })
        wrapper.vm.add({ title: "T1", message: "M1" })
        await wrapper.vm.$nextTick()

        const item = wrapper.find(".notify")
        expect(item.find(".title").text()).toBe("T1")
        expect(item.find(".message").text()).toBe("M1")
        expect(wrapper.emitted("show")[0]).toEqual([{ title: "T1", message: "M1" }])
    })

    it("applies the color class from data.color", async () => {
        const wrapper = mount(Notify, { props: { timeout: 0 } })
        wrapper.vm.add({ title: "T", message: "M", color: "danger" })
        await wrapper.vm.$nextTick()

        expect(wrapper.find(".notify").classes()).toContain("danger")
    })

    it("top positions prepend new items (newest first, closest to the edge)", async () => {
        const wrapper = mount(Notify, { props: { position: "top-right", timeout: 0 } })
        wrapper.vm.add({ title: "first" })
        wrapper.vm.add({ title: "second" })
        await wrapper.vm.$nextTick()

        const titles = wrapper.findAll(".title").map((t) => t.text())
        expect(titles).toEqual(["second", "first"])
    })

    it("bottom positions append new items (newest last)", async () => {
        const wrapper = mount(Notify, { props: { position: "bottom-left", timeout: 0 } })
        wrapper.vm.add({ title: "first" })
        wrapper.vm.add({ title: "second" })
        await wrapper.vm.$nextTick()

        const titles = wrapper.findAll(".title").map((t) => t.text())
        expect(titles).toEqual(["first", "second"])
    })

    it("auto-removes after timeout and emits hide", async () => {
        const wrapper = mount(Notify, { props: { timeout: 1000 } })
        wrapper.vm.add({ title: "T" })
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll(".notify")).toHaveLength(1)

        vi.advanceTimersByTime(1000)
        await wrapper.vm.$nextTick()

        expect(wrapper.findAll(".notify")).toHaveLength(0)

        // removeItem()은 배열에서 바로 splice하지만, hide emit 자체는 퇴장 애니메이션이
        // 끝나는 hideDuration(기본 500ms)만큼 더 늦게 나간다 - 원본(notify.js)이 슬라이드업
        // 애니메이션 콜백에서 hide를 emit하는 실제 타이밍을 그대로 재현한 것.
        vi.advanceTimersByTime(500)
        expect(wrapper.emitted("hide")[0]).toEqual([{ title: "T" }])
    })

    it("timeout=0 keeps the item until removed manually", async () => {
        const wrapper = mount(Notify, { props: { timeout: 0 } })
        wrapper.vm.add({ title: "T" })
        await wrapper.vm.$nextTick()

        vi.advanceTimersByTime(60000)
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll(".notify")).toHaveLength(1)
    })

    it("clicking an item emits select and removes it", async () => {
        const wrapper = mount(Notify, { props: { timeout: 0 } })
        wrapper.vm.add({ title: "T" })
        await wrapper.vm.$nextTick()

        await wrapper.find(".notify").trigger("click")

        expect(wrapper.emitted("select")[0][0]).toEqual({ title: "T" })

        // 클릭도 removeItem()을 타므로 hide emit은 hideDuration(기본 500ms) 뒤에 나간다.
        vi.advanceTimersByTime(500)
        expect(wrapper.emitted("hide")[0]).toEqual([{ title: "T" }])
        expect(wrapper.findAll(".notify")).toHaveLength(0)
    })

    it("per-call timeout overrides the prop default", async () => {
        const wrapper = mount(Notify, { props: { timeout: 5000 } })
        wrapper.vm.add({ title: "T" }, 100)
        await wrapper.vm.$nextTick()

        vi.advanceTimersByTime(100)
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll(".notify")).toHaveLength(0)
    })

    it("reset() clears all active notifications", async () => {
        const wrapper = mount(Notify, { props: { timeout: 0 } })
        wrapper.vm.add({ title: "A" })
        wrapper.vm.add({ title: "B" })
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll(".notify")).toHaveLength(2)

        wrapper.vm.reset()
        await wrapper.vm.$nextTick()
        expect(wrapper.findAll(".notify")).toHaveLength(0)
    })

    it("reset() still emits hide for each cleared item (bug fix - used to splice the array directly, skipping hide entirely)", async () => {
        const wrapper = mount(Notify, { props: { timeout: 0 } })
        wrapper.vm.add({ title: "A" })
        wrapper.vm.add({ title: "B" })
        await wrapper.vm.$nextTick()

        wrapper.vm.reset()
        vi.advanceTimersByTime(500)

        const hidden = wrapper.emitted("hide").map((call) => call[0].title)
        expect(hidden.sort()).toEqual(["A", "B"])
    })

    it("reset() also neutralizes an already-scheduled auto-remove timeout without a duplicate hide", async () => {
        const wrapper = mount(Notify, { props: { timeout: 1000 } })
        wrapper.vm.add({ title: "A" })
        await wrapper.vm.$nextTick()

        wrapper.vm.reset()
        vi.advanceTimersByTime(500)
        expect(wrapper.emitted("hide")).toHaveLength(1)

        // 원래 예약돼 있던 setTimeout(() => removeItem(id), 1000)이 이 시점에 실행돼도
        // 이미 reset()이 지운 항목이라 findIndex가 -1을 반환해 조용히 no-op돼야 한다(중복 hide 없음).
        vi.advanceTimersByTime(1000)
        expect(wrapper.emitted("hide")).toHaveLength(1)
    })
})
