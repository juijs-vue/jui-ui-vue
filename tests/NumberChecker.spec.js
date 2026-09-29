import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import NumberChecker from "../src/components/NumberChecker.vue"

describe("NumberChecker", () => {
    it("renders the initial modelValue", () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5 } })
        expect(wrapper.find("input").element.value).toBe("5")
    })

    it("원본과 동일하게, modelValue 없이 시작하면 빈 값도 invalid로 취급해 처음부터 invalid 상태로 시작한다", () => {
        const wrapper = mount(NumberChecker, { props: { message: "Invalid number" } })
        const input = wrapper.find("input")

        expect(input.classes()).toContain("invalid")
        expect(input.attributes("placeholder")).toBe("Invalid number")
    })

    it("valid input within range emits update:modelValue while typing", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 0, min: 0, max: 100 } })
        const input = wrapper.find("input")

        await input.setValue("42")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([42])
    })

    it("input outside min/max range does not emit while typing", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 0, min: 0, max: 10 } })
        const input = wrapper.find("input")

        await input.setValue("999")
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    })

    it("non-numeric input does not emit while typing", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 0 } })
        const input = wrapper.find("input")

        await input.setValue("abc")
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    })

    it("blur clamps an out-of-range value to min/max", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5, min: 0, max: 10 } })
        const input = wrapper.find("input")

        await input.setValue("999")
        await input.trigger("blur")

        expect(input.element.value).toBe("10")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([10])
    })

    it("blur with empty=\"min\" resets an invalid value to min", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5, min: 0, max: 10, empty: "min" } })
        const input = wrapper.find("input")

        await input.setValue("abc")
        await input.trigger("blur")

        expect(input.element.value).toBe("0")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([0])
    })

    it("blur without empty option marks invalid and shows the message as placeholder", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5, message: "숫자를 입력하세요" } })
        const input = wrapper.find("input")

        await input.setValue("abc")
        await input.trigger("blur")

        expect(input.classes()).toContain("invalid")
        expect(input.element.value).toBe("")
        expect(input.attributes("placeholder")).toBe("숫자를 입력하세요")
    })

    it("focus clears the invalid state", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5 } })
        const input = wrapper.find("input")

        await input.setValue("abc")
        await input.trigger("blur")
        expect(input.classes()).toContain("invalid")

        await input.trigger("focus")
        expect(input.classes()).not.toContain("invalid")
        expect(input.attributes("placeholder")).toBe("")
    })

    it("integer=false allows decimal values", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 0, integer: false } })
        const input = wrapper.find("input")

        await input.setValue("3.14")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([3.14])
    })

    it("blur with empty=\"min\" but no min given marks invalid instead of silently blanking (bug fix)", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5, empty: "min", message: "Invalid number" } })
        const input = wrapper.find("input")

        await input.setValue("abc")
        await input.trigger("blur")

        expect(input.element.value).toBe("")
        expect(input.classes()).toContain("invalid")
        expect(input.attributes("placeholder")).toBe("Invalid number")
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    })

    it("external modelValue changes are reflected in the displayed value (bug fix - used to only apply at initial render)", async () => {
        const wrapper = mount(NumberChecker, { props: { modelValue: 5 } })
        await wrapper.setProps({ modelValue: 42 })
        expect(wrapper.find("input").element.value).toBe("42")
    })
})
