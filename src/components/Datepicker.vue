<script setup lang="ts">
// 원본(datepicker.js)의 tpl.date/tpl.dates(마크업 템플릿 기반 셀 렌더링)는 Vue의 #cell
// scoped slot으로 대체했다(Dropdown/Select와 동일한 방향의 단순화) — day(0=일~6=토)/type
// (""/"now"/"active"/"none")/no(날짜·월·연도 숫자)를 슬롯 프롭으로 넘겨준다.
// .datepicker와 .calendar는 원본에서 동일한 컴포넌트에 CSS 클래스만 다르게 준 스킨 차이라
// (datepicker.less vs calendar.less), variant prop으로 그 둘을 고른다.
import { ref, computed, watch } from "vue"
import { dateFormat } from "jui-core-ts"
import { getStartDate, getLastDate } from "../utils/date.js"

interface DateCell {
    type: string
    no: number
    day?: number
}

const props = withDefaults(
    defineProps<{
        type?: "daily" | "monthly" | "yearly"
        variant?: "datepicker" | "calendar"
        size?: "normal" | "large"
        /** v-model - 선택된 날짜. */
        modelValue?: Date | null
        titleFormat?: string
        format?: string
        minDate?: Date | null
        maxDate?: Date | null
        /** head에 prev-year/next-year(≪/≫) 버튼 표시. */
        moveYear?: boolean
    }>(),
    {
        type: "daily",
        variant: "datepicker",
        size: "normal",
        modelValue: null,
        titleFormat: "yyyy.MM",
        format: "yyyy-MM-dd",
        minDate: null,
        maxDate: null,
        moveYear: false
    }
)
const emit = defineEmits<{
    "update:modelValue": [value: Date]
    select: [formatted: string, date: Date]
    prev: []
    next: []
    reload: []
}>()

function today() {
    return getStartDate(new Date())
}

// 원본(datepicker.js)의 date 옵션 기본값은 now(오늘)이고, init()이 끝에서 무조건
// this.select(opts.date)를 호출한다 - 즉 명시적으로 date를 안 주면 오늘이 항상 selDate로
// 미리 선택된 채 시작한다("active"). 그리고 오늘 셀은 "now"와 "active" 조건이 둘 다 참이면
// 두 클래스를 함께 받는다(class="now active" - 실제 운영 사이트 렌더 결과로 확인됨). 단일
// type 문자열로 덮어쓰면 이 조합이 나올 수 없어서, 여기서는 배열로 모아 공백 join한다.
const selDate = ref<Date>(props.modelValue ? getStartDate(props.modelValue) : today())
const viewYear = ref(selDate.value.getFullYear())
const viewMonth = ref(selDate.value.getMonth() + 1)

function checkDate(y: number, m: number, d: number): [number, number, number] {
    if (props.minDate) {
        const minY = props.minDate.getFullYear(),
            minM = props.minDate.getMonth() + 1,
            minD = props.minDate.getDate()
        if (y < minY || (y === minY && m < minM)) return [minY, minM, minD]
    }
    if (props.maxDate) {
        const maxY = props.maxDate.getFullYear(),
            maxM = props.maxDate.getMonth() + 1,
            maxD = props.maxDate.getDate()
        if (y > maxY || (y === maxY && m > maxM)) return [maxY, maxM, maxD]
    }
    return [y, m, d]
}

function getDateList(y: number, m: number): DateCell[] {
    const cells: DateCell[] = []
    let no = 1
    const d = new Date()
    const mm = m < 10 ? "0" + m : String(m)
    const start = new Date(y + "-" + mm).getDay()
    let ldate = getLastDate(y, m)
    let sdate = 0

    const prevYear = m === 1 ? y - 1 : y
    const prevMonth = m === 1 ? 12 : m - 1
    const prevLastDay = getLastDate(prevYear, prevMonth)

    if (props.minDate && props.minDate.getFullYear() === y && props.minDate.getMonth() + 1 === m) {
        sdate = props.minDate.getDate()
    }
    if (props.maxDate && props.maxDate.getFullYear() === y && props.maxDate.getMonth() + 1 === m) {
        ldate = props.maxDate.getDate()
    }

    for (let i = 0; i < start; i++) {
        cells[i] = { type: "none", no: prevLastDay - start + (i + 1), day: i % 7 }
    }
    for (let i = start; i < 42; i++) {
        if (sdate <= no && no <= ldate) {
            const classes = []
            if (d.getMonth() + 1 === m && d.getDate() === no) classes.push("now")
            if (selDate.value && selDate.value.getFullYear() === y && selDate.value.getMonth() + 1 === m && selDate.value.getDate() === no) {
                classes.push("active")
            }
            cells[i] = { type: classes.join(" "), no, day: i % 7 }
            no++
        } else if (no > ldate) {
            // 이번 달의 실제 마지막 날(getLastDate) 이후 = 다음 달로 넘어간 채움 칸
            cells[i] = { type: "none", no: no - ldate, day: i % 7 }
            no++
        } else {
            // no < sdate: minDate 이전이라 선택 불가능할 뿐, 여전히 "이번 달의 그 날짜"다.
            // 원본은 이 경우도 위 분기와 같은 `no - ldate` 공식을 써서 음수가 표시되는
            // 버그가 있었다(예: minDate가 이번 달 10일이면 1~9일이 -30, -29... 로 표시됨) —
            // 달력 UI에서 음수 표시는 명백히 의도된 동작일 수 없으므로 실제 날짜 숫자를 쓰도록 고쳤다.
            cells[i] = { type: "none", no, day: i % 7 }
            no++
        }
    }
    return cells
}

function getMonthList(y: number): DateCell[] {
    const d = new Date()
    const cells: DateCell[] = []
    for (let i = 1; i <= 12; i++) {
        const classes = []
        if (d.getFullYear() === y && d.getMonth() + 1 === i) classes.push("now")
        if (selDate.value && selDate.value.getFullYear() === y && selDate.value.getMonth() + 1 === i) classes.push("active")
        cells.push({ type: classes.join(" "), no: i })
    }
    return cells
}

function getYearList(y: number): DateCell[] {
    const d = new Date()
    const cells: DateCell[] = []
    const startYear = y - 4
    for (let i = startYear; i < startYear + 12; i++) {
        const classes = []
        if (d.getFullYear() === i) classes.push("now")
        if (selDate.value && selDate.value.getFullYear() === i) classes.push("active")
        cells.push({ type: classes.join(" "), no: i })
    }
    return cells
}

const cells = computed(() => {
    if (props.type === "daily") return getDateList(viewYear.value, viewMonth.value)
    if (props.type === "monthly") return getMonthList(viewYear.value)
    return getYearList(viewYear.value)
})

// daily는 7칸씩(요일), monthly/yearly는 3칸씩 줄바꿈
const rows = computed(() => {
    const size = props.type === "daily" ? 7 : 3
    const result = []
    for (let i = 0; i < cells.value.length; i += size) {
        result.push(cells.value.slice(i, i + size))
    }
    return result
})

// 원본(datepicker.js)의 getCalendarDate()도 type "yearly"에서는 year(표시 중인 12년 범위)가
// 아니라 그냥 new Date()(오늘)를 넘긴다 - title은 항상 "오늘이 속한 연도"를 보여준다. 여기
// early-return으로 빈 문자열을 내보내던 게 버그였다(아래 else 분기가 이미 그 동작을
// 구현해뒀는데 도달하지 못했다).
const title = computed(() => {
    let d
    if (props.type === "daily") {
        const mm = viewMonth.value < 10 ? "0" + viewMonth.value : String(viewMonth.value)
        d = new Date(viewYear.value + "/" + mm + "/01")
    } else if (props.type === "monthly") {
        d = new Date(viewYear.value + "/01/01")
    } else {
        d = new Date()
    }
    return dateFormat(getStartDate(d), props.titleFormat)
})

function page(y: number, m?: number) {
    if (props.type === "daily") {
        viewYear.value = y
        viewMonth.value = m as number
    } else {
        viewYear.value = y
    }
}

function prev(moveYearFlag?: boolean) {
    if (props.type === "daily") {
        let y: number, m: number
        if (moveYearFlag) {
            y = viewYear.value - 1
            m = viewMonth.value
        } else {
            y = viewMonth.value === 1 ? viewYear.value - 1 : viewYear.value
            m = viewMonth.value === 1 ? 12 : viewMonth.value - 1
        }
        if (props.minDate && props.minDate.getFullYear() === viewYear.value && props.minDate.getMonth() + 1 === viewMonth.value) {
            return
        }
        page(y, m)
    } else if (props.type === "monthly") {
        page(viewYear.value - 1)
    } else {
        page(viewYear.value - 12)
    }
    emit("prev")
}

function next(moveYearFlag?: boolean) {
    if (props.type === "daily") {
        let y: number, m: number
        if (moveYearFlag) {
            y = viewYear.value + 1
            m = viewMonth.value
        } else {
            y = viewMonth.value === 12 ? viewYear.value + 1 : viewYear.value
            m = viewMonth.value === 12 ? 1 : viewMonth.value + 1
        }
        if (props.maxDate && props.maxDate.getFullYear() === viewYear.value && props.maxDate.getMonth() + 1 === viewMonth.value) {
            return
        }
        page(y, m)
    } else if (props.type === "monthly") {
        page(viewYear.value + 1)
    } else {
        page(viewYear.value + 12)
    }
    emit("next")
}

function selectCell(cell: DateCell) {
    if (cell.type === "none") return

    if (props.type === "daily") {
        const mm = viewMonth.value < 10 ? "0" + viewMonth.value : String(viewMonth.value)
        const dd = cell.no < 10 ? "0" + cell.no : String(cell.no)
        selDate.value = getStartDate(new Date(viewYear.value + "/" + mm + "/" + dd))
    } else if (props.type === "monthly") {
        const mm = cell.no < 10 ? "0" + cell.no : String(cell.no)
        selDate.value = getStartDate(new Date(viewYear.value + "/" + mm + "/01"))
    } else {
        selDate.value = getStartDate(new Date(cell.no + "/01/01"))
    }

    emit("update:modelValue", selDate.value)
    emit("select", getFormat(), selDate.value)
}

function select(): void
function select(dateOrTimestamp: Date | number | string): void
function select(y: number, m: number, d: number): void
function select(yOrDate?: number | Date | string, m?: number, d?: number) {
    let y = viewYear.value,
        mm = viewMonth.value,
        dd = selDate.value ? selDate.value.getDate() : 1

    if (arguments.length === 3) {
        y = yOrDate as number
        mm = m as number
        dd = d as number
    } else if (arguments.length === 1) {
        const time = yOrDate instanceof Date ? yOrDate : new Date(yOrDate as number | string)
        y = time.getFullYear()
        mm = time.getMonth() + 1
        dd = time.getDate()
    }

    if (props.type === "daily") {
        if (props.minDate || props.maxDate) {
            const checked = checkDate(y, mm, dd)
            y = checked[0]
            mm = checked[1]
            dd = checked[2]
        }
        page(y, mm)
        selectCell({ type: "", no: dd })
    } else if (props.type === "monthly") {
        page(y)
        selectCell({ type: "", no: mm })
    } else {
        page(y)
        selectCell({ type: "", no: y })
    }
}

function addTime(time: Date | number) {
    const base = selDate.value ? selDate.value.getTime() : Date.now()
    const t = time instanceof Date ? time.getTime() : base + time
    select(new Date(t))
}

function getDate() {
    return selDate.value
}
function getTime() {
    return selDate.value ? selDate.value.getTime() : null
}
function getFormat(format?: string) {
    return dateFormat(selDate.value, typeof format === "string" ? format : props.format)
}
function reload() {
    select(selDate.value)
    emit("reload")
}

watch(
    () => props.modelValue,
    (v) => {
        if (v && (!selDate.value || v.getTime() !== selDate.value.getTime())) {
            select(v)
        }
    }
)

defineExpose({ page, prev, next, select, addTime, getDate, getTime, getFormat, reload })
</script>

<template>
    <div :class="{ [variant]: true, [size]: size !== 'normal' }">
        <div class="head" :class="{ 'move-year': moveYear }">
            <div v-if="moveYear" class="prev-year" @click="prev(true)">&laquo;</div>
            <div class="prev" @click="prev(false)"><i class="icon-chevron-left"></i></div>
            <div class="title">{{ title }}</div>
            <div class="next" @click="next(false)"><i class="icon-chevron-right"></i></div>
            <div v-if="moveYear" class="next-year" @click="next(true)">&raquo;</div>
        </div>
        <table class="body">
            <tbody>
                <tr v-if="type === 'daily'" :key="-1">
                    <th>{{ variant === 'calendar' ? 'SUN' : 'SU' }}</th>
                    <th>{{ variant === 'calendar' ? 'MON' : 'MO' }}</th>
                    <th>{{ variant === 'calendar' ? 'TUE' : 'TU' }}</th>
                    <th>{{ variant === 'calendar' ? 'WED' : 'WE' }}</th>
                    <th>{{ variant === 'calendar' ? 'THU' : 'TH' }}</th>
                    <th>{{ variant === 'calendar' ? 'FRI' : 'FR' }}</th>
                    <th>{{ variant === 'calendar' ? 'SAT' : 'SA' }}</th>
                </tr>
                <tr v-for="(row, ri) in rows" :key="ri">
                    <td v-for="(cell, ci) in row" :key="ci" :class="cell.type" @click="selectCell(cell)">
                        <slot name="cell" :type="cell.type" :no="cell.no" :day="ci">{{ cell.no }}</slot>
                    </td>
                </tr>
            </tbody>
        </table>
    </div>
</template>
