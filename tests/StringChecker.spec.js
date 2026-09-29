import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import StringChecker from "../src/components/StringChecker.vue"

describe("StringChecker", () => {
    it("renders the initial modelValue when it's valid JSON-string-safe text", () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "hello" } })
        expect(wrapper.find("input").element.value).toBe("hello")
    })

    it("blur commits the value when valid (no pattern/minLength/maxLength)", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "" } })
        const input = wrapper.find("input")

        await input.setValue("world")
        await input.trigger("blur")

        expect(input.element.value).toBe("world")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["world"])
        expect(input.classes()).not.toContain("invalid")
    })

    it("validBlank: blank value emits invalid but is still accepted (원본 특성 — 막지는 않음)", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "x", validBlank: true } })
        const input = wrapper.find("input")

        await input.setValue("")
        await input.trigger("blur")

        expect(wrapper.emitted("invalid")[0]).toEqual(["blank", ""])
        expect(input.classes()).not.toContain("invalid")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([""])
    })

    it("pattern=email rejects a non-matching value and marks invalid with placeholder", async () => {
        const wrapper = mount(StringChecker, {
            props: { modelValue: "", pattern: "email", message: "이메일 형식이 아닙니다" }
        })
        const input = wrapper.find("input")

        await input.trigger("focus") // 마운트 시점의 초기값("") 검증으로 이미 invalid가 찍혀 있을 수 있어 정리
        await input.setValue("not-an-email")
        await input.trigger("blur")

        expect(input.classes()).toContain("invalid")
        expect(input.element.value).toBe("")
        expect(input.attributes("placeholder")).toBe("이메일 형식이 아닙니다")
        expect(wrapper.emitted("invalid").at(-1)).toEqual(["email", "not-an-email"])
    })

    it("pattern=email accepts a matching value", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "", pattern: "email" } })
        const input = wrapper.find("input")

        await input.trigger("focus") // 마운트 시점 초기값("") 검증으로 찍힌 invalid를 정리
        await input.setValue("user@example.com")
        await input.trigger("blur")

        expect(input.classes()).not.toContain("invalid")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["user@example.com"])
    })

    it("a RegExp pattern works too (원본은 여기서 존재하지 않는 변수를 참조해 터지는 버그가 있었음)", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "", pattern: /^\d+$/ } })
        const input = wrapper.find("input")

        await input.setValue("abc")
        await input.trigger("blur")
        expect(input.classes()).toContain("invalid")

        await input.trigger("focus")
        await input.setValue("123")
        await input.trigger("blur")
        expect(input.classes()).not.toContain("invalid")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["123"])
    })

    it("minLength/maxLength violations emit invalid but do not block (원본 특성)", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "", minLength: 5, maxLength: 10 } })
        const input = wrapper.find("input")

        await input.setValue("ab")
        await input.trigger("blur")

        expect(wrapper.emitted("invalid").at(-1)).toEqual(["min", "ab"])
        expect(input.classes()).not.toContain("invalid")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual(["ab"])
    })

    it("validJson: an invalid string for the JSON wrapper is rejected", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "" } })
        const input = wrapper.find("input")

        await input.setValue('some "quoted" text')
        await input.trigger("blur")

        expect(input.classes()).toContain("invalid")
    })

    it("focus clears the invalid state", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "", pattern: "email" } })
        const input = wrapper.find("input")

        await input.setValue("bad")
        await input.trigger("blur")
        expect(input.classes()).toContain("invalid")

        await input.trigger("focus")
        expect(input.classes()).not.toContain("invalid")
    })

    it("invalidMessage overrides the placeholder per invalid type", async () => {
        const wrapper = mount(StringChecker, {
            props: {
                modelValue: "",
                pattern: "email",
                message: "기본 메시지",
                invalidMessage: (type) => (type === "email" ? "이메일이 이상해요" : null)
            }
        })
        const input = wrapper.find("input")

        await input.setValue("bad")
        await input.trigger("blur")

        expect(input.attributes("placeholder")).toBe("이메일이 이상해요")
    })

    it("external modelValue changes are reflected in the displayed value (bug fix - used to only apply at initial render)", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "hello" } })
        await wrapper.setProps({ modelValue: "world" })
        expect(wrapper.find("input").element.value).toBe("world")
    })

    it("an external modelValue change clears a stale invalid state", async () => {
        const wrapper = mount(StringChecker, { props: { modelValue: "", pattern: "email" } })
        const input = wrapper.find("input")
        await input.setValue("bad")
        await input.trigger("blur")
        expect(input.classes()).toContain("invalid")

        await wrapper.setProps({ modelValue: "reset" })
        expect(input.classes()).not.toContain("invalid")
        expect(wrapper.find("input").element.value).toBe("reset")
    })
})
