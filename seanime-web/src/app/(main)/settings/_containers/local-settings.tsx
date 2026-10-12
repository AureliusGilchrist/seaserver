import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SettingsCard, SettingsPageHeader } from "@/app/(main)/settings/_components/settings-card"
import { SettingsSubmitButton } from "@/app/(main)/settings/_components/settings-submit-button"
import { AnilistUploadButton } from "@/app/(main)/settings/_components/anilist-upload-button"
import { cn } from "@/components/ui/core/styling"
import { Field } from "@/components/ui/form"
import { Separator } from "@/components/ui/separator"
import React from "react"
import { LuUserCog } from "react-icons/lu"

type Props = {
    isPending: boolean
    children?: React.ReactNode
}

export function LocalSettings(props: Props) {

    const {
        isPending,
        children,
        ...rest
    } = props

    const serverStatus = useServerStatus()

    return (
        <div className="space-y-4">

            <SettingsPageHeader
                title="Local Account"
                description="Local anime and manga list managed by Seanime"
                icon={LuUserCog}
            />

            <SettingsCard
                title="AniList"
                // description="You can upload your local Seanime collection to your AniList account."
            >
                <div className={cn(serverStatus?.user?.isSimulated && "opacity-50 pointer-events-none")}>
                    <Field.Switch
                        side="right"
                        name="autoSyncToLocalAccount"
                        label="Auto sync from AniList"
                        help="Periodically update your local collection by using your AniList data."
                    />
                </div>
                <Separator />
                <AnilistUploadButton />
            </SettingsCard>

            <SettingsSubmitButton isPending={isPending} />
        </div>
    )
}
