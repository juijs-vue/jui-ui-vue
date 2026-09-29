import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Progress from "../src/components/Progress.vue"

describe("Progress", () => {
    it("sets the bar width as a percentage of (value - min) / (max - min)", () => {
        const wrapper = mount(Progress, { props: { modelValue: 30 } })
        expect(wrapper.find(".bar").attributes("style")).toContain("width: 30%")
    })

    it("respects custom min/max range", () => {
        const wrapper = mount(Progress, { props: { modelValue: 25, min: 0, max: 50 } })
        expect(wrapper.find(".bar").attributes("style")).toContain("width: 50%")
    })

    it("orient=vertical sets height instead of width", () => {
        const wrapper = mount(Progress, { props: { modelValue: 40, orient: "vertical" } })
        const style = wrapper.find(".bar").attributes("style")
        expect(style).toContain("height: 40%")
        expect(style).not.toContain("width")
    })

    it("applies variant and orient classes to the root", () => {
        const wrapper = mount(Progress, { props: { modelValue: 0, variant: "simple flat", orient: "vertical" } })
        expect(wrapper.classes()).toContain("vertical")
        expect(wrapper.classes()).toContain("simple")
        expect(wrapper.classes()).toContain("flat")
    })

    it("applies striped/animated classes to the bar", () => {
        const wrapper = mount(Progress, { props: { modelValue: 0, striped: true, animated: true } })
        const bar = wrapper.find(".bar")
        expect(bar.classes()).toContain("striped")
        expect(bar.classes()).toContain("animated")
    })

    it("exposed getValue/setValue mirror modelValue", () => {
        const wrapper = mount(Progress, { props: { modelValue: 20 } })
        expect(wrapper.vm.getValue()).toBe(20)

        wrapper.vm.setValue(80)
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([80])
    })

    // Ports `progress.js`'s `this.setStriped(isStriped)`/`this.setAnimated(isAnimated)` (lines
    // 89-103 of the original) - an undocumented gap found by a completeness audit against the
    // real jui-ui source: the Vue port only ever bound `striped`/`animated` as plain reactive
    // props with no imperative escape hatch, dropping this API surface silently.
    it("exposed setStriped(isStriped)/setAnimated(isAnimated) override the striped/animated classes regardless of props", async () => {
        const wrapper = mount(Progress, { props: { modelValue: 0, striped: true, animated: true } })
        const bar = () => wrapper.find(".bar")
        expect(bar().classes()).toContain("striped")
        expect(bar().classes()).toContain("animated")

        wrapper.vm.setStriped(false)
        wrapper.vm.setAnimated(false)
        await wrapper.vm.$nextTick()
        expect(bar().classes()).not.toContain("striped")
        expect(bar().classes()).not.toContain("animated")
    })

    // Source's no-argument call (`self.setStriped()`/`self.setAnimated()`, called once from
    // `init()`) re-syncs the class to the CURRENT option value rather than toggling/clearing it -
    // a real, distinct second call signature, hand-traced against `progress.js:89-103`'s
    // `typeof isStriped == "undefined"` branch.
    it("setStriped()/setAnimated() called with no argument re-syncs to the current striped/animated prop, not a toggle", async () => {
        const wrapper = mount(Progress, { props: { modelValue: 0, striped: true, animated: true } })
        wrapper.vm.setStriped(false)
        wrapper.vm.setAnimated(false)
        await wrapper.vm.$nextTick()
        expect(wrapper.find(".bar").classes()).not.toContain("striped")

        wrapper.vm.setStriped() // no arg -> re-sync to the `striped` prop (true), not a toggle to `true` from `false`
        wrapper.vm.setAnimated()
        await wrapper.vm.$nextTick()
        expect(wrapper.find(".bar").classes()).toContain("striped")
        expect(wrapper.find(".bar").classes()).toContain("animated")
    })

    // striped/animated는 "초기값일 뿐, setStriped/setAnimated로 prop과 무관하게 override 가능"이라고
    // 문서화돼 있는데, 이전엔 props.striped/animated를 계속 watch해서 로컬 상태에 미러링했다 -
    // override 이후 prop이 어떤 이유로든 바뀌면 그 override가 조용히 되돌아가버리는 버그였다.
    it("an override from setStriped() survives an unrelated later change to the striped prop (bug fix)", async () => {
        const wrapper = mount(Progress, { props: { modelValue: 0, striped: false } })
        wrapper.vm.setStriped(true) // override: prop(false)과 다른 값
        await wrapper.vm.$nextTick()
        expect(wrapper.find(".bar").classes()).toContain("striped")

        // prop이 실제로 값을 바꾼다(false -> true -> false) - 이전엔 이 변화를 계속 watch해서
        // 그때마다 override를 조용히 덮어썼다. 두 번째 변경(false)은 override(true)와 다른
        // 값이라, 남아있는 watch가 있었다면 여기서 바로 드러난다.
        await wrapper.setProps({ striped: true })
        await wrapper.setProps({ striped: false })
        expect(wrapper.find(".bar").classes()).toContain("striped")
    })
})
