import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import TimePicker from "../src/components/TimePicker.vue"

describe("TimePicker", () => {
    it("date mode renders year/month/date inputs with padded month/date", () => {
        const wrapper = mount(TimePicker, {
            props: { mode: "date", modelValue: { year: 2017, month: 5, date: 1 } }
        })
        const inputs = wrapper.findAll("input")
        expect(inputs.map((i) => i.element.value)).toEqual(["2017", "05", "01"])
    })

    it("time mode renders hours/minutes with padding and a calendar icon vs arrow icon differs by mode", () => {
        const wrapper = mount(TimePicker, { props: { mode: "time", modelValue: { hours: 9, minutes: 5 } } })
        const inputs = wrapper.findAll("input")
        expect(inputs.map((i) => i.element.value)).toEqual(["09", "05"])
        expect(wrapper.find(".icon-arrow7").exists()).toBe(true)
        expect(wrapper.find(".icon-calendar").exists()).toBe(false)
    })

    it("ArrowUp/ArrowDown on a focused field adjusts it by 1 and commits immediately (bug fix - it used to stay silent until blur)", async () => {
        const wrapper = mount(TimePicker, { props: { mode: "time", modelValue: { hours: 10, minutes: 0 } } })
        const hours = wrapper.findAll("input")[0]

        await hours.trigger("focus")
        await hours.trigger("keyup", { key: "ArrowUp" })
        expect(hours.element.value).toBe("11")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([{ hours: 11, minutes: 0 }])
        expect(wrapper.emitted("change").at(-1)).toEqual([{ hours: 11, minutes: 0 }])

        // blur re-parses the input and commits again (setField always commits, even to the same
        // value - a separate, pre-existing characteristic, not something this fix changes)
        await hours.trigger("blur")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([{ hours: 11, minutes: 0 }])
    })

    it("values clamp to the field's min/max range", async () => {
        const wrapper = mount(TimePicker, { props: { mode: "time", modelValue: { hours: 23, minutes: 0 } } })
        const hours = wrapper.findAll("input")[0]

        await hours.trigger("focus")
        await hours.trigger("keyup", { key: "ArrowUp" }) // 23 -> would be 24, clamps to 23
        expect(hours.element.value).toBe("23")
    })

    it("date field max depends on year/month (daysInMonth)", async () => {
        const wrapper = mount(TimePicker, {
            props: { mode: "date", modelValue: { year: 2024, month: 2, date: 28 } } // 윤년
        })
        const date = wrapper.findAll("input")[2]

        await date.trigger("focus")
        await date.trigger("keyup", { key: "ArrowUp" }) // 2월 29일까지 있어야 함(2024는 윤년)
        expect(date.element.value).toBe("29")

        await date.trigger("keyup", { key: "ArrowUp" }) // 더 이상 못 올라감(30일 없음)
        expect(date.element.value).toBe("29")
    })

    it("the up/down spinner buttons (time mode) adjust whichever field last had focus", async () => {
        const wrapper = mount(TimePicker, { props: { mode: "time", modelValue: { hours: 5, minutes: 30 } } })
        const minutes = wrapper.findAll("input")[1]
        await minutes.trigger("focus")

        const upButton = wrapper.findAll("div")[1] // [0]은 .timepicker 루트 자신, [1]이 up 버튼
        await upButton.trigger("mouseup")

        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([{ hours: 5, minutes: 31 }])
    })

    it("blur clamps out-of-range typed values (e.g. minutes=99 -> 59)", async () => {
        const wrapper = mount(TimePicker, { props: { mode: "time", modelValue: { hours: 5, minutes: 30 } } })
        const minutes = wrapper.findAll("input")[1]

        await minutes.setValue("99")
        await minutes.trigger("blur")

        expect(minutes.element.value).toBe("59")
        expect(wrapper.emitted("change").at(-1)).toEqual([{ hours: 5, minutes: 59 }])
    })

    it("exposed field accessors (get/set) mirror 원본 getYear/setYear 등", async () => {
        const wrapper = mount(TimePicker, { props: { mode: "date", modelValue: { year: 2017, month: 5, date: 1 } } })

        expect(wrapper.vm.year.get()).toBe(2017)
        wrapper.vm.month.set(12)
        await wrapper.vm.$nextTick()

        expect(wrapper.findAll("input")[1].element.value).toBe("12")
        expect(wrapper.emitted("update:modelValue").at(-1)).toEqual([{ year: 2017, month: 12, date: 1 }])
    })
})
