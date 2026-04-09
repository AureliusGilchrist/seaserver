import { ProfileSummary } from "@/api/generated/types"
import { useProfileLogin } from "@/api/hooks/profiles.hooks"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import React from "react"
import { BiPlus } from "react-icons/bi"

type ProfileSelectorProps = {
    profiles: ProfileSummary[]
    onManageProfiles?: () => void
}

export function ProfileSelector({ profiles, onManageProfiles }: ProfileSelectorProps) {
    const [selectedProfile, setSelectedProfile] = React.useState<ProfileSummary | null>(null)
    const [pin, setPin] = React.useState("")
    const [pinError, setPinError] = React.useState("")
    const { mutate: login, isPending } = useProfileLogin()
    const pinInputRef = React.useRef<HTMLInputElement>(null)

    const handleProfileClick = (profile: ProfileSummary) => {
        setSelectedProfile(profile)
        setPin("")
        setPinError("")
    }

    const handlePinSubmit = () => {
        if (!selectedProfile) return
        setPinError("")
        login(
            { profileId: selectedProfile.id, pin },
            {
                onError: () => {
                    setPinError("Incorrect PIN")
                    setPin("")
                },
            },
        )
    }

    const handleBack = () => {
        setSelectedProfile(null)
        setPin("")
        setPinError("")
    }

    const handlePinKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") {
            handlePinSubmit()
        }
        if (e.key === "Escape") {
            handleBack()
        }
    }

    // PIN entry screen
    if (selectedProfile) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center bg-[--background]">
                <div className="mb-8">
                    <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto" />
                </div>
                <div className="flex flex-col items-center gap-6">
                    <Avatar
                        src={selectedProfile.avatarPath || selectedProfile.anilistAvatar || undefined}
                        fallback={selectedProfile.name.charAt(0).toUpperCase()}
                        size="xl"
                        className="w-24 h-24 text-3xl"
                    />
                    <h2 className="text-xl font-semibold text-[--foreground]">
                        {selectedProfile.name}
                    </h2>
                    <div className="flex flex-col items-center gap-3" onClick={() => pinInputRef.current?.focus()}>
                        <p className="text-sm text-[--muted]">Enter your PIN</p>
                        <div className="flex gap-2 cursor-text">
                            {[0, 1, 2, 3, 4, 5].map((i) => (
                                <div
                                    key={i}
                                    className={`w-12 h-14 rounded-md border-2 flex items-center justify-center text-2xl font-bold transition-colors ${
                                        i < pin.length
                                            ? "border-[--brand] bg-[--brand]/10 text-[--brand]"
                                            : "border-[--border] bg-[--paper]"
                                    }`}
                                >
                                    {i < pin.length ? "•" : ""}
                                </div>
                            ))}
                        </div>
                        <input
                            ref={pinInputRef}
                            type="password"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={pin}
                            onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "")
                                setPin(val)
                            }}
                            onKeyDown={handlePinKeyDown}
                            className="sr-only"
                            autoFocus
                        />
                        {pinError && (
                            <p className="text-sm text-red-500">{pinError}</p>
                        )}
                        <div className="flex gap-3 mt-2">
                            <Button intent="gray" size="sm" onClick={handleBack}>
                                Back
                            </Button>
                            <Button
                                intent="primary"
                                size="sm"
                                onClick={handlePinSubmit}
                                loading={isPending}
                                disabled={pin.length < 4}
                            >
                                Continue
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // Profile grid
    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[--background]">
            <div className="mb-8">
                <img src="/seanime-logo.png" alt="logo" className="w-14 h-auto" />
            </div>
            <h1 className="text-2xl font-bold text-[--foreground] mb-8">Who's watching?</h1>
            <div className="flex flex-wrap justify-center gap-6 max-w-2xl">
                {profiles.map((profile) => (
                    <button
                        key={profile.id}
                        onClick={() => handleProfileClick(profile)}
                        className="group flex flex-col items-center gap-3 p-4 rounded-lg transition-all hover:bg-[--subtle] focus:outline-none focus-visible:ring-2 focus-visible:ring-[--brand]"
                    >
                        <div className="relative">
                            <Avatar
                                src={profile.avatarPath || profile.anilistAvatar || undefined}
                                fallback={profile.name.charAt(0).toUpperCase()}
                                size="xl"
                                className="w-24 h-24 text-3xl rounded-lg border-2 border-transparent group-hover:border-[--brand] transition-colors"
                            />
                            {profile.isAdmin && (
                                <div className="absolute -top-1 -right-1 bg-[--brand] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                                    Admin
                                </div>
                            )}
                        </div>
                        <span className="text-sm font-medium text-[--muted] group-hover:text-[--foreground] transition-colors">
                            {profile.name}
                        </span>
                    </button>
                ))}
            </div>
            {onManageProfiles && (
                <Button
                    intent="gray"
                    size="sm"
                    className="mt-8"
                    leftIcon={<BiPlus />}
                    onClick={onManageProfiles}
                >
                    Manage Profiles
                </Button>
            )}
        </div>
    )
}
