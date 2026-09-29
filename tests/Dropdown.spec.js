import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Dropdown from "../src/components/Dropdown.vue"

describe("Dropdown", () => {
    it("is hidden (display:none) by default, visible when modelValue is true", async () => {
        const wrapper = mount(Dropdown, { props: { modelValue: false } })
        expect(wrapper.element.style.display).toBe("none")
        await wrapper.setProps({ modelValue: true })
        // .dropdown 클래스 자체가 CSS에서 display:none이므로, 열렸을 때는 인라인 스타일로
        // 명시적으로 "block"을 줘야 한다("" 로 인라인 스타일을 지우기만 하면 클래스의
        // display:none이 그대로 적용되어버리는 실수를 여기서 방지한다).
        expect(wrapper.element.style.display).toBe("block")
    })

    it("renders default slot <li> markup as-is when items is not given", () => {
        const wrapper = mount(Dropdown, {
            slots: { default: "<li value='1'>A</li><li class='divider'></li><li value='2'>B</li>" }
        })
        expect(wrapper.findAll("li")).toHaveLength(3)
    })

    it("renders <li> from the items prop when given", () => {
        const wrapper = mount(Dropdown, {
            props: { items: [{ value: 1, text: "A" }, { divider: true }, { value: 2, text: "B" }] }
        })
        const lis = wrapper.findAll("li")
        expect(lis).toHaveLength(3)
        expect(lis[0].text()).toBe("A")
        expect(lis[1].classes()).toContain("divider")
    })

    it("clicking a selectable <li> emits change with index/value/text, and hides when close=true (default)", async () => {
        const wrapper = mount(Dropdown, {
            props: { modelValue: true, items: [{ value: 10, text: "First" }, { value: 20, text: "Second" }] }
        })
        await wrapper.findAll("li")[1].trigger("click")
        expect(wrapper.emitted("change")[0][0]).toEqual({ index: 1, value: "20", text: "Second" })
        expect(wrapper.emitted("update:modelValue")[0]).toEqual([false])
    })

    it("clicking a divider/title/disabled <li> does not emit change", async () => {
        const wrapper = mount(Dropdown, {
            props: { modelValue: true, items: [{ divider: true }, { value: 1, text: "A", disabled: true }] }
        })
        await wrapper.findAll("li")[0].trigger("click")
        await wrapper.findAll("li")[1].trigger("click")
        expect(wrapper.emitted("change")).toBeUndefined()
    })

    it("close=false keeps the dropdown open after a selection", async () => {
        const wrapper = mount(Dropdown, {
            props: { modelValue: true, close: false, items: [{ value: 1, text: "A" }] }
        })
        await wrapper.findAll("li")[0].trigger("click")
        expect(wrapper.emitted("change")).toBeTruthy()
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    })

    it("exposed show()/hide() emit update:modelValue, and only one dropdown stays 'active' at a time", async () => {
        const a = mount(Dropdown, { props: { modelValue: false } })
        const b = mount(Dropdown, { props: { modelValue: false } })

        a.vm.show()
        expect(a.emitted("update:modelValue")[0]).toEqual([true])
        await a.setProps({ modelValue: true })

        // b가 열리면(show) 내부적으로 a 대신 b가 "활성" 드롭다운이 되어야 한다 —
        // 전역 document 클릭시 활성 드롭다운만 닫히는 것으로 간접 확인한다.
        b.vm.show()
        await b.setProps({ modelValue: true })

        document.body.dispatchEvent(new MouseEvent("click", { bubbles: true }))
        // a는 이미 활성 상태에서 밀려났으므로 hide가 호출되지 않아야 하고, b만 hide되어야 한다.
        expect(b.emitted("update:modelValue").at(-1)).toEqual([false])
    })

    it("driving modelValue directly (without calling show()) still closes a previously-open sibling (bug fix - the auto-close used to live only inside show())", async () => {
        const a = mount(Dropdown, { props: { modelValue: false } })
        const b = mount(Dropdown, { props: { modelValue: false } })

        // show()를 거치지 않고 v-model 그 자체를 바꾸는, 문서가 약속한 "일반적인" 경로
        await a.setProps({ modelValue: true })
        await b.setProps({ modelValue: true })

        expect(a.emitted("update:modelValue")?.at(-1)).toEqual([false])
    })

    it("keydown navigation (down/down/enter) selects the second selectable item when keydown=true", async () => {
        const wrapper = mount(Dropdown, {
            props: {
                modelValue: true,
                keydown: true,
                items: [{ value: 1, text: "A" }, { divider: true }, { value: 2, text: "B" }]
            },
            attachTo: document.body
        })
        wrapper.vm.wheel(40) // down -> index 0(A)
        wrapper.vm.wheel(40) // down -> divider(1) 건너뛰고 index 2(B)
        wrapper.vm.wheel(13) // enter -> B 클릭
        expect(wrapper.emitted("change")[0][0]).toEqual({ index: 2, value: "2", text: "B" })
        wrapper.unmount()
    })
})
