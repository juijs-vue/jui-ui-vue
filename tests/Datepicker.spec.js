import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Datepicker from "../src/components/Datepicker.vue"

describe("Datepicker", () => {
    it("daily: renders a 7-column grid with S/M/T/W/T/F/S header", () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 15) } }) // 2024-05-15
        // 원본(jui.js)도 헤더 행을 <thead> 없이 <tbody>의 첫 <tr>로 둔다 - 이 컴포넌트가
        // 그대로 포팅한 실제 구조라, <thead th> 대신 그냥 <th>로 찾아야 한다.
        expect(wrapper.findAll("th")).toHaveLength(7)
        expect(wrapper.find(".title").text()).toBe("2024.05")
    })

    it("daily: the selected date's cell has class 'active'", () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 15) } })
        const active = wrapper.find("td.active")
        expect(active.exists()).toBe(true)
        expect(active.text()).toBe("15")
    })

    it("clicking a selectable date cell emits update:modelValue and select", async () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 1) } })
        const cells = wrapper.findAll("td:not(.none)")
        const target = cells.find((c) => c.text() === "20")
        await target.trigger("click")

        expect(wrapper.emitted("update:modelValue")).toBeTruthy()
        const emittedDate = wrapper.emitted("update:modelValue")[0][0]
        expect(emittedDate.getDate()).toBe(20)
        expect(wrapper.emitted("select")[0][0]).toBe("2024-05-20")
    })

    it("clicking a 'none' (previous/next month filler) cell does nothing", async () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 1) } })
        const noneCell = wrapper.find("td.none")
        expect(noneCell.exists()).toBe(true)
        await noneCell.trigger("click")
        expect(wrapper.emitted("update:modelValue")).toBeUndefined()
    })

    it("next()/prev() navigate months and update the title", async () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 15) } })
        await wrapper.find(".next").trigger("click")
        expect(wrapper.find(".title").text()).toBe("2024.06")
        await wrapper.find(".prev").trigger("click")
        await wrapper.find(".prev").trigger("click")
        expect(wrapper.find(".title").text()).toBe("2024.04")
    })

    it("moveYear=true shows prev-year/next-year buttons that jump by a year", async () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 15), moveYear: true } })
        expect(wrapper.find(".prev-year").exists()).toBe(true)
        await wrapper.find(".next-year").trigger("click")
        expect(wrapper.find(".title").text()).toBe("2025.05")
    })

    it("respects minDate: the day cell right before minDate is marked 'none', the day of minDate itself is selectable", () => {
        const wrapper = mount(Datepicker, {
            props: { modelValue: new Date(2024, 4, 15), minDate: new Date(2024, 4, 10) }
        })
        const cells = wrapper.findAll("tbody td")
        // 5월 1일(수)부터 시작하는 주의 순서상 10번째 셀(0-indexed로 앞의 none 채움 포함)이
        // minDate(5/10) 셀이며, 그 앞 셀들은 전부 .none이어야 한다.
        const minDateCell = cells.find((c) => c.classes().includes("active") === false && c.text() === "10" && !c.classes().includes("none"))
        expect(minDateCell).toBeTruthy()
    })

    it("days before minDate within the same month show their real day number, not a negative placeholder", () => {
        // 원본은 minDate 이전 날짜를 "다음 달 채움 칸"과 같은 공식(no-ldate)으로 계산해서
        // 음수(예: -18)가 표시되는 버그가 있었다 — 실제 날짜 숫자가 나오도록 고친 것을 검증한다.
        const wrapper = mount(Datepicker, {
            props: { modelValue: new Date(2024, 4, 15), minDate: new Date(2024, 4, 10) }
        })
        const day5 = wrapper.findAll("tbody td").find((c) => c.text() === "5")
        expect(day5).toBeTruthy()
        expect(day5.classes()).toContain("none")
        expect(Number(day5.text())).toBeGreaterThan(0)
    })

    it("monthly type renders a 3-column, 4-row grid of month numbers 1..12", () => {
        const wrapper = mount(Datepicker, {
            props: { type: "monthly", titleFormat: "yyyy", modelValue: new Date(2024, 4, 15) }
        })
        const rows = wrapper.findAll("tbody tr")
        expect(rows).toHaveLength(4)
        expect(wrapper.findAll("tbody td")).toHaveLength(12)
        expect(wrapper.find(".title").text()).toBe("2024")
    })

    it("yearly type renders a 12-year grid centered around the current year (y-4..y+7)", () => {
        const wrapper = mount(Datepicker, { props: { type: "yearly", modelValue: new Date(2024, 4, 15) } })
        const texts = wrapper.findAll("tbody td").map((td) => td.text())
        expect(texts).toEqual(["2020", "2021", "2022", "2023", "2024", "2025", "2026", "2027", "2028", "2029", "2030", "2031"])
    })

    it("exposed getFormat(format) and getDate()/getTime() mirror the 원본 API", () => {
        const wrapper = mount(Datepicker, { props: { modelValue: new Date(2024, 4, 15) } })
        expect(wrapper.vm.getFormat("yyyyMMdd")).toBe("20240515")
        expect(wrapper.vm.getDate().getDate()).toBe(15)
        expect(wrapper.vm.getTime()).toBe(wrapper.vm.getDate().getTime())
    })

    it("custom #cell slot overrides the default cell content", () => {
        const wrapper = mount(Datepicker, {
            props: { modelValue: new Date(2024, 4, 15) },
            slots: { cell: `<template #cell="{ type, no }"><b v-if="type !== 'none'">D{{ no }}</b></template>` }
        })
        expect(wrapper.find("td.active b").text()).toBe("D15")
    })

    it("daily: #cell slot's day prop is the real 0(Sun)-6(Sat) day-of-week (bug fix - it used to be the row's own column index, coincidentally right here but wrong for monthly/yearly)", () => {
        // 2024-05-01 is a Wednesday (day=3) - the very first grid cell of May 2024 is April 28th
        // (Sunday, day=0), so this also exercises a "previous month filler" cell, not just the
        // selected date's own cell.
        const wrapper = mount(Datepicker, {
            props: { modelValue: new Date(2024, 4, 1) },
            slots: { cell: `<template #cell="{ no, day }"><b>{{ no }}:{{ day }}</b></template>` }
        })
        const firstCellText = wrapper.findAll("td b")[0].text()
        expect(firstCellText).toBe("28:0")
    })

    it("monthly/yearly: #cell slot's day prop is undefined, not a stray column index (bug fix)", () => {
        const monthly = mount(Datepicker, {
            props: { type: "monthly", modelValue: new Date(2024, 4, 15) },
            slots: { cell: `<template #cell="{ day }"><b>{{ String(day) }}</b></template>` }
        })
        expect(monthly.findAll("td b").map((b) => b.text())).toEqual(Array(12).fill("undefined"))

        const yearly = mount(Datepicker, {
            props: { type: "yearly", modelValue: new Date(2024, 4, 15) },
            slots: { cell: `<template #cell="{ day }"><b>{{ String(day) }}</b></template>` }
        })
        expect(yearly.findAll("td b").map((b) => b.text())).toEqual(Array(12).fill("undefined"))
    })
})
