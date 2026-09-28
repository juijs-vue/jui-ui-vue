<script setup lang="ts">
import { ref, computed, watch } from "vue"

// 원본(timepicker.js)은 하나의 컴포넌트가 마크업에 .year/.month/.date가 있으면 "날짜" 모드,
// .hours/.minutes가 있으면 위/아래 스피너까지 딸린 "시간" 모드로 동작했다(둘 다 있으면 스피너는
// hours/minutes 둘 다 있을 때만 붙음). Vue 버전은 mode prop으로 명시적으로 나눈다.
type TimeField = "year" | "month" | "date" | "hours" | "minutes"
interface TimeValue {
    /** 연도. mode="date"일 때만 사용된다. */
    year?: number
    /** 월(1~12). mode="date"일 때만 사용된다. */
    month?: number
    /** 일. 상한은 daysInMonth(year, month)로 계산되어 월/윤년에 따라 달라진다. mode="date"일 때만 사용된다. */
    date?: number
    /** 시(0~23). mode="time"일 때만 사용된다. */
    hours?: number
    /** 분(0~59). mode="time"일 때만 사용된다. */
    minutes?: number
}

function pad(v: number) {
    return v < 10 ? `0${v}` : `${v}`
}

function daysInMonth(year: number, month: number) {
    return new Date(year, month, 0).getDate()
}

const now = new Date()

const props = withDefaults(
    defineProps<{
        /** date(year/month/date) | time(hours/minutes, 위아래 스피너 포함). */
        mode?: "date" | "time"
        /** date 모드: { year, month, date } / time 모드: { hours, minutes }. */
        modelValue?: TimeValue
        /** 연도 입력의 하한(mode="date"일 때만 의미가 있음) - 방향키/blur로 이 값 아래로 내려가지 않도록 clamp된다. 기본값 2015. */
        minYear?: number
        /** 연도 입력의 상한(mode="date"일 때만 의미가 있음) - 방향키/blur로 이 값을 넘지 않도록 clamp된다. 기본값 2020. */
        maxYear?: number
        /** 입력창 크기 클래스(large/normal/small/mini). 기본값 "normal". */
        size?: "large" | "normal" | "small" | "mini"
    }>(),
    {
        mode: "date",
        modelValue: undefined,
        minYear: 2015,
        maxYear: 2020,
        size: "normal"
    }
)

const emit = defineEmits<{
    /** v-model 동기화용 - 입력 blur로 값을 확정하거나, time 모드 스피너(▲/▼)를 클릭하거나,
     * 포커스된 필드에서 방향키(↑/↓)를 누를 때마다 매번 그 즉시 발생한다(세 경로 모두 동일하게
     * 커밋한다 - 예전엔 방향키만 화면만 갱신하고 이 이벤트를 안 쏴서 blur 전까지 v-model
     * 소비자가 변경을 알 수 없는 버그가 있었다). */
    "update:modelValue": [value: TimeValue]
    /** update:modelValue와 같은 시점에 같은 값으로 함께 발생한다. */
    change: [value: TimeValue]
}>()

function defaultValue(): TimeValue {
    return props.mode === "date"
        ? { year: now.getFullYear(), month: now.getMonth() + 1, date: now.getDate() }
        : { hours: now.getHours(), minutes: now.getMinutes() }
}

const internal = ref<TimeValue>({ ...defaultValue(), ...props.modelValue })
watch(
    () => props.modelValue,
    (v) => {
        if (v) internal.value = { ...internal.value, ...v }
    },
    { deep: true }
)

function range(field: TimeField): [number, number] {
    if (field === "year") return [props.minYear, props.maxYear]
    if (field === "month") return [1, 12]
    if (field === "date") return [1, daysInMonth(internal.value.year!, internal.value.month!)]
    if (field === "hours") return [0, 23]
    if (field === "minutes") return [0, 59]
    return [0, 99]
}

function clamp(field: TimeField, value: number) {
    const [min, max] = range(field)
    if (Number.isNaN(value)) return min
    if (value > max) return max
    if (value < min) return min
    return value
}

function commit() {
    emit("update:modelValue", { ...internal.value })
    emit("change", { ...internal.value })
}

function setField(field: TimeField, value: number) {
    internal.value = { ...internal.value, [field]: clamp(field, value) }
    commit()
}

const focusedField = ref<TimeField>(props.mode === "date" ? "year" : "hours")

function onFocus(field: TimeField) {
    focusedField.value = field
}

function onKeyup(field: TimeField, e: KeyboardEvent) {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return
    const dist = e.key === "ArrowUp" ? 1 : -1
    // 이전엔 { silent: true }라 키 입력이 내부 상태(입력창에 보이는 값)만 바꾸고
    // update:modelValue/change를 쏘지 않았다 - blur 전까지는 v-model 소비자가 전혀 알 수
    // 없는 버그였다(같은 값 변경 경로인 스핀 버튼 클릭/blur는 둘 다 커밋한다). 세 경로를
    // 일관되게 맞춤.
    setField(field, (internal.value[field] || 0) + dist)
}

function onBlur(field: TimeField, e: FocusEvent) {
    const value = parseInt((e.target as HTMLInputElement).value, 10)
    setField(field, value)
}

function onSpin(dist: number) {
    setField(focusedField.value, (internal.value[focusedField.value] || 0) + dist)
}

const fields = computed<TimeField[]>(() => (props.mode === "date" ? ["year", "month", "date"] : ["hours", "minutes"]))

function maxlength(field: TimeField) {
    return field === "year" ? 4 : 2
}

/** 원본 getYear/getMonth/.../setYear/setMonth/... 대응 */
function makeAccessor(field: TimeField) {
    return {
        get: () => internal.value[field],
        set: (v: number) => setField(field, v)
    }
}
defineExpose({
    year: makeAccessor("year"),
    month: makeAccessor("month"),
    date: makeAccessor("date"),
    hours: makeAccessor("hours"),
    minutes: makeAccessor("minutes")
})
</script>

<template>
    <div class="timepicker" :class="[size, { calendar: mode === 'date' }]">
        <template v-for="(field, i) in fields" :key="field">
            <span v-if="i > 0">{{ mode === "date" ? "-" : " : " }}</span>
            <input
                type="text"
                :class="field"
                :maxlength="maxlength(field)"
                :value="field === 'year' ? internal.year : pad(internal[field] ?? 0)"
                @focus="onFocus(field)"
                @keyup="onKeyup(field, $event)"
                @blur="onBlur(field, $event)"
            />
        </template>
        <i :class="mode === 'date' ? 'icon-calendar' : 'icon-arrow7'"></i>
        <template v-if="mode === 'time'">
            <div style="position: absolute; right: 2px; top: 0; width: 12px; height: 50%; cursor: pointer;" @mouseup="onSpin(1)"></div>
            <div style="position: absolute; right: 2px; bottom: 0; width: 12px; height: 50%; cursor: pointer;" @mouseup="onSpin(-1)"></div>
        </template>
    </div>
</template>
