import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import Colorpicker from "../src/components/Colorpicker.vue"

// .information 안의 input 4개만 hex/r/g/b (opacity 표시용 input은 .control 안에 따로 있음)
function infoInputs(wrapper) {
    return wrapper.findAll(".information input.input")
}

describe("Colorpicker", () => {
    it("initializes the HEX/R/G/B inputs from modelValue", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" } })
        await wrapper.vm.$nextTick()
        const inputs = infoInputs(wrapper)
        expect(inputs[0].element.value).toBe("#ff0000")
        expect(inputs[1].element.value).toBe("255")
        expect(inputs[2].element.value).toBe("0")
        expect(inputs[3].element.value).toBe("0")
    })

    it("clicking the saturation/value square emits update:modelValue and change", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" }, attachTo: document.body })
        const color = wrapper.find(".color")
        await color.trigger("mousedown", { clientX: 0, clientY: 0 })
        expect(wrapper.emitted("update:modelValue")).toBeTruthy()
        expect(wrapper.emitted("change")).toBeTruthy()
        wrapper.unmount()
    })

    it("typing a valid RGB triple recomputes the HEX field (rgb -> hex sync)", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#000000" } })
        const inputs = infoInputs(wrapper)
        await inputs[1].setValue("0")
        await inputs[2].setValue("255")
        await inputs[3].setValue("0")
        await inputs[3].trigger("keyup")
        expect(infoInputs(wrapper)[0].element.value).toBe("#00ff00")
    })

    it("typing a valid HEX and pressing Enter emits an 'enter' event and syncs R/G/B", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#000000" } })
        const hex = infoInputs(wrapper)[0]
        await hex.setValue("#0000ff")
        hex.element.dispatchEvent(new KeyboardEvent("keyup", { which: 13, bubbles: true }))
        await wrapper.vm.$nextTick()
        expect(wrapper.emitted("enter")).toBeTruthy()
        expect(wrapper.emitted("enter")[0][0]).toBe("#0000ff")
        const inputs = infoInputs(wrapper)
        expect(inputs[1].element.value).toBe("0")
        expect(inputs[2].element.value).toBe("0")
        expect(inputs[3].element.value).toBe("255")
    })

    it("R/G/B input keydown blocks non-numeric keys via preventDefault", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#000000" } })
        const rInput = infoInputs(wrapper)[1]
        const event = new KeyboardEvent("keydown", { which: 65, bubbles: true, cancelable: true })
        rInput.element.dispatchEvent(event)
        expect(event.defaultPrevented).toBe(true)
    })

    it("exposed getColor('hex') returns the current hex color derived from drag state", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" }, attachTo: document.body })
        expect(wrapper.vm.getColor("hex").toLowerCase()).toBe("#ff0000")
        wrapper.unmount()
    })

    it("exposed setColor(hex) re-initializes the picker to that color", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" } })
        wrapper.vm.setColor("#00FF00")
        await wrapper.vm.$nextTick()
        expect(infoInputs(wrapper)[0].element.value).toBe("#00ff00")
    })

    it("dragging the opacity bar lowers alpha and switches the emitted color format to rgba", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" }, attachTo: document.body })
        const opacityContainer = wrapper.find(".opacity .container")
        await opacityContainer.trigger("mousedown", { clientX: -9999 }) // 맨 왼쪽 끝 -> opacity 0
        const lastChange = wrapper.emitted("change").at(-1)
        expect(lastChange[1].a).toBe(0)
        wrapper.unmount()
    })

    it("exposed setColor accepts an RGBColor object with a 0-valued channel (bug fix - falsy check used to drop it)", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" } })
        wrapper.vm.setColor({ r: 0, g: 0, b: 0 })
        await wrapper.vm.$nextTick()
        expect(infoInputs(wrapper)[0].element.value).toBe("#000000")
    })

    it("exposed setColor accepts an rgba() string (bug fix - '#' prefix check used to reject it)", async () => {
        const wrapper = mount(Colorpicker, { props: { modelValue: "#FF0000" } })
        wrapper.vm.setColor("rgba(0,255,0,1)")
        await wrapper.vm.$nextTick()
        expect(infoInputs(wrapper)[0].element.value).toBe("#00ff00")
    })
})
