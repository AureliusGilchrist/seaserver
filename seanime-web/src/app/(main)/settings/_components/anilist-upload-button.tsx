import { useLocalSyncSimulatedDataToAnilist } from "@/api/hooks/local.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { Button } from "@/components/ui/button"
import React from "react"
import { LuCloudUpload } from "react-icons/lu"
import { SiAnilist } from "react-icons/si"

/**
 * Uploads the local collection to AniList. Confirmation happens in place: the button turns into
 * a short "are you sure" row instead of opening a dialog.
 */
export function AnilistUploadButton(props: { label?: string }) {
    const serverStatus = useServerStatus()
    const { mutate: upload, isPending } = useLocalSyncSimulatedDataToAnilist()
    const [confirming, setConfirming] = React.useState(false)

    const disabled = !!serverStatus?.user?.isSimulated

    if (confirming && !isPending) {
        return (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand-500/30 bg-brand-500/10 px-4 py-3">
                <SiAnilist className="size-5 text-brand-200 shrink-0" />
                <p className="text-sm flex-1 min-w-[12rem]">
                    This will overwrite your AniList lists with your local collection. Continue?
                </p>
                <Button size="sm" intent="gray-subtle" rounded onClick={() => setConfirming(false)}>
                    Cancel
                </Button>
                <Button
                    size="sm"
                    intent="primary"
                    rounded
                    leftIcon={<LuCloudUpload className="size-4" />}
                    onClick={() => {
                        setConfirming(false)
                        upload()
                    }}
                >
                    Upload
                </Button>
            </div>
        )
    }

    return (
        <Button
            size="sm"
            intent="primary-subtle"
            rounded
            loading={isPending}
            disabled={disabled}
            leftIcon={<SiAnilist className="size-4" />}
            onClick={() => setConfirming(true)}
        >
            {props.label ?? "Upload to AniList"}
        </Button>
    )
}
