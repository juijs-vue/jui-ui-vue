import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Slider from "../src/components/Slider.vue"

function stubTrack(wrapper, { left = 0, top = 0, width = 200, height = 200 } = {}) {
    const track = wrapper.find(".track").element
    track.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height })
    Object.defineProperty(track, "offsetWidth", { configurable: true, value: width })
    Object.defineProperty(track, "offsetHeight", { configurable: true, value: height })
}

describe("Slider", () => {
    it("single type: renders one handle, no 'to' handle", () => {
        const wrapper = mount(Slider, { props: { min: 0, max: 10, from: 5 } })
        expect(wrapper.findAll(".handle")).toHaveLength(1)
        expect(wrapper.find(".handle.from").exists()).toBe(true)
        expect(wrapper.find(".handle.to").exists()).toBe(false)
    })

    it("double type: renders both from/to handles", () => {
        const wrapper = mount(Slider, { props: { type: "double", min: -10, max: 10, from: 1, to: 5 } })
        expect(wrapper.findAll(".handle")).toHaveLength(2)
    })

    it("from handle position reflects the `from` prop as a percentage of min..max", async () => {
        const wrapper = mount(Slider, { props: { min: 0, max: 10, from: 5 }, attachTo: document.body })
        await wrapper.vm.$nextTick()
        expect(wrapper.find(".handle.from").element.style.left).toBe("50%")
        wrapper.unmount()
    })

    it("clicking the track (single type) jumps the handle and emits update:from/change", async () => {
        const wrapper = mount(Slider, { props: { min: 0, max: 10, from: 0, step: 1 }, attachTo: document.body })
        stubTrack(wrapper)
        await wrapper.find(".track").trigger("mousedown", { clientX: 100, clientY: 0 }) // 중앙 -> 50% -> value 5
        expect(wrapper.emitted("update:from").at(-1)).toEqual([5])
        expect(wrapper.emitted("change").at(-1)[0]).toMatchObject({ type: "from", from: 5 })
        wrapper.unmount()
    })

    it("double type: dragging 'from' past 'to' clamps at 'to' (cannot cross)", async () => {
        const wrapper = mount(Slider, {
            props: { type: "double", min: 0, max: 10, from: 2, to: 5, step: 1 },
            attachTo: document.body
        })
        stubTrack(wrapper)
        await wrapper.vm.$nextTick()
        // from 핸들을 오른쪽 끝(track 전체, value=10)으로 드래그 시도 -> to(5)에서 clamp
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 199, clientY: 0 }))
        wrapper.find(".handle.from").trigger("mousedown")
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 199, clientY: 0 }))
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.getFromValue()).toBe(5)
        wrapper.unmount()
    })

    it("step snapping rounds to the nearest step (e.g. step=0.05)", async () => {
        const wrapper = mount(Slider, { props: { min: 0, max: 10, from: 0, step: 0.05 }, attachTo: document.body })
        stubTrack(wrapper)
        // 37%쯤 클릭 -> raw value 3.7 -> step 0.05 배수로 스냅되어야 함(3.70)
        await wrapper.find(".track").trigger("mousedown", { clientX: 74, clientY: 0 })
        const emitted = wrapper.emitted("update:from").at(-1)[0]
        expect(Math.abs(emitted / 0.05 - Math.round(emitted / 0.05))).toBeLessThan(1e-9)
        wrapper.unmount()
    })

    it("exposed setFromValue/setToValue/getFromValue/getToValue mirror the 원본 API", async () => {
        const wrapper = mount(Slider, { props: { type: "double", min: 0, max: 10, from: 1, to: 5 } })
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.getFromValue()).toBe(1)
        expect(wrapper.vm.getToValue()).toBe(5)

        wrapper.vm.setFromValue(3)
        await wrapper.vm.$nextTick()
        expect(wrapper.vm.getFromValue()).toBe(3)
    })

    it("vertical orientation uses `top` instead of `left` for handle positioning", async () => {
        // 원본(production) 실측 결과: 세로 슬라이더는 top 기준(값이 클수록 아래로 내려감)이고
        // margin-top 보정도 없다 - bottom 기준으로 뒀던 이전 구현은 위치가 실제와 달랐고
        // (드래그 방향도 마우스와 반대로 계산돼 있었다) 이번에 함께 바로잡았다.
        const wrapper = mount(Slider, { props: { orient: "vertical", min: 100, max: 1000, from: 550, step: 10 } })
        await wrapper.vm.$nextTick()
        const style = wrapper.find(".handle.from").element.style
        expect(style.top).not.toBe("")
        expect(style.left).toBe("")
    })

    it("tooltip is shown and displays the current value when tooltip=true", async () => {
        const wrapper = mount(Slider, { props: { min: 0, max: 10, from: 5, tooltip: true }, attachTo: document.body })
        await wrapper.vm.$nextTick()
        const tooltip = wrapper.find(".tooltip")
        expect(tooltip.element.style.display).not.toBe("none")
        expect(tooltip.find(".message").text()).toBe("5")
        wrapper.unmount()
    })

    it("does not emit 'change' from the initial mount-time value, only from real interaction", async () => {
        // 원본은 마운트 시 초기 위치를 잡는 setFromValue()/setToValue() 호출에서 change를 쏘지
        // 않는다 - 이 이벤트에 반응해 뭔가 보여주는 데모(slider_2)가 로드하자마자 표시되는
        // 버그로 실제로 드러났었다.
        const wrapper = mount(Slider, {
            props: { type: "double", min: 0, max: 100, from: 50, to: 70, step: 1 },
            attachTo: document.body
        })
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted("change")).toBeUndefined()

        stubTrack(wrapper)
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, clientY: 0 }))
        await wrapper.find(".handle.from").trigger("mousedown")
        document.dispatchEvent(new MouseEvent("mousemove", { clientX: 20, clientY: 0 }))
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted("change")).toBeDefined()
        wrapper.unmount()
    })

    it("switching type from single to double does not emit NaN for 'to' (bug fix - toDist was never initialized while in single mode)", async () => {
        const wrapper = mount(Slider, { props: { type: "single", min: 0, max: 10, from: 5, to: 8 } })
        await wrapper.vm.$nextTick()

        await wrapper.setProps({ type: "double" })
        await wrapper.vm.$nextTick()

        expect(wrapper.vm.getToValue()).not.toBeNaN()
        expect(wrapper.vm.getToValue()).toBe(8)
        const lastTo = wrapper.emitted("update:to")?.at(-1)
        if (lastTo) expect(lastTo[0]).not.toBeNaN()
    })
})
