import { useWebsocketMessageListener } from "@/app/(main)/_hooks/handle-websockets"
import { WSEvents } from "@/lib/server/ws-events"
import { toast } from "sonner"

type ToastPayload = string | { title: string; description?: string }

function parseToast(data: ToastPayload): { title: string; description?: string } {
    if (typeof data === "string") return { title: data }
    return { title: data.title, description: data.description }
}

export function useMiscEventListeners() {

    useWebsocketMessageListener<ToastPayload>({
        type: WSEvents.INFO_TOAST, onMessage: data => {
            if (!data) return
            const { title, description } = parseToast(data)
            if (title) toast.info(title, { description })
        },
    })

    useWebsocketMessageListener<ToastPayload>({
        type: WSEvents.SUCCESS_TOAST, onMessage: data => {
            if (!data) return
            const { title, description } = parseToast(data)
            if (title) toast.success(title, { description })
        },
    })

    useWebsocketMessageListener<ToastPayload>({
        type: WSEvents.WARNING_TOAST, onMessage: data => {
            if (!data) return
            const { title, description } = parseToast(data)
            if (title) toast.warning(title, { description })
        },
    })

    useWebsocketMessageListener<ToastPayload>({
        type: WSEvents.ERROR_TOAST, onMessage: data => {
            if (!data) return
            const { title, description } = parseToast(data)
            if (title) toast.error(title, { description })
        },
    })

    useWebsocketMessageListener<string>({
        type: WSEvents.CONSOLE_LOG, onMessage: data => {
            console.log(data)
        },
    })

    useWebsocketMessageListener<string>({
        type: WSEvents.CONSOLE_WARN, onMessage: data => {
            console.warn(data)
        },
    })

}
