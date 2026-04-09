import { INTERNAL_ProfileSummary as ProfileSummary } from "@/api/generated/types"
import { useProfileLogin } from "@/api/hooks/profiles.hooks"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/components/ui/core/styling"
import React from "react"
import { BiArrowBack, BiCheck, BiPlus } from "react-icons/bi"
import { MdBackspace } from "react-icons/md"

const MAX_PIN_LENGTH = 8
const MIN_PIN_LENGTH = 4

type ProfileSelectorProps = {
    profiles: ProfileSummary[]
    onManageProfiles?: () => void
}

export function ProfileSelector({ profiles, onManageProfiles }: ProfileSelectorProps) {
    const [selectedProfile, setSelectedProfile] = React.useState<ProfileSummary | null>(null)
    const [pin, setPin] = React.useState("")
    const [pinError, setPinError] = React.useState("")
    const [pressedKey, setPressedKey] = React.useState<string | null>(null)
    const { mutate: login, isPending } = useProfileLogin()

    const handleProfileClick = (profile: ProfileSummary) => {
        if (!profile.hasPIN) {
            // Auto-login for profiles without PIN
            login(
                { profileId: profile.id, pin: "" },
                {
                    onError: () => {
                        setPinError("Login failed")
                    },
                },
            )
            return
        }
        setSelectedProfile(profile)
        setPin("")
        setPinError("")
    }

    const handlePinSubmit = () => {
        if (!selectedProfile || pin.length < MIN_PIN_LENGTH) return
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

    const handleKeypadPress = (key: string) => {
        setPressedKey(key)
        setTimeout(() => setPressedKey(null), 150)

        if (key === "backspace") {
            setPin(prev => prev.slice(0, -1))
            setPinError("")
        } else if (key === "submit") {
            handlePinSubmit()
        } else {
            setPin(prev => {
                if (prev.length >= MAX_PIN_LENGTH) return prev
                setPinError("")
                return prev + key
            })
        }
    }

    // Keyboard support
    React.useEffect(() => {
        if (!selectedProfile) return

        const handler = (e: KeyboardEvent) => {
            if (e.key >= "0" && e.key <= "9") {
                handleKeypadPress(e.key)
            } else if (e.key === "Backspace") {
                handleKeypadPress("backspace")
            } else if (e.key === "Enter") {
                handlePinSubmit()
            } else if (e.key === "Escape") {
                handleBack()
            }
        }
        window.addEventListener("keydown", handler)
        return () => window.removeEventListener("keydown", handler)
    }, [selectedProfile, pin])

    // PIN entry screen with keypad
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

                    <p className="text-sm text-[--muted]">Enter your PIN</p>

                    {/* Dot indicators */}
                    <div className="flex gap-3">
                        {Array.from({ length: MAX_PIN_LENGTH }).map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    "w-3 h-3 rounded-full transition-all duration-200",
                                    i < pin.length
                                        ? "bg-[--brand] scale-110"
                                        : i < MIN_PIN_LENGTH
                                            ? "bg-[--border]"
                                            : "bg-[--border] opacity-40",
                                )}
                            />
                        ))}
                    </div>

                    {pinError && (
                        <p className="text-sm text-red-500 animate-shake">{pinError}</p>
                    )}

                    {/* 3×4 Keypad grid */}
                    <div className="grid grid-cols-3 gap-3 mt-2">
                        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
                            <KeypadButton
                                key={digit}
                                label={digit}
                                pressed={pressedKey === digit}
                                onClick={() => handleKeypadPress(digit)}
                                disabled={pin.length >= MAX_PIN_LENGTH}
                            />
                        ))}
                        <KeypadButton
                            label={<MdBackspace className="text-xl" />}
                            pressed={pressedKey === "backspace"}
                            onClick={() => handleKeypadPress("backspace")}
                            disabled={pin.length === 0}
                            variant="utility"
                        />
                        <KeypadButton
                            label="0"
                            pressed={pressedKey === "0"}
                            onClick={() => handleKeypadPress("0")}
                            disabled={pin.length >= MAX_PIN_LENGTH}
                        />
                        <KeypadButton
                            label={<BiCheck className="text-2xl" />}
                            pressed={pressedKey === "submit"}
                            onClick={() => handleKeypadPress("submit")}
                            disabled={pin.length < MIN_PIN_LENGTH || isPending}
                            variant="submit"
                        />
                    </div>

                    <Button
                        intent="gray-basic"
                        size="sm"
                        leftIcon={<BiArrowBack />}
                        onClick={handleBack}
                        className="mt-2"
                    >
                        Back
                    </Button>
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

type KeypadButtonProps = {
    label: React.ReactNode
    pressed: boolean
    onClick: () => void
    disabled?: boolean
    variant?: "digit" | "utility" | "submit"
}

function KeypadButton({ label, pressed, onClick, disabled, variant = "digit" }: KeypadButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold transition-all duration-150 select-none",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[--brand] focus-visible:ring-offset-2 focus-visible:ring-offset-[--background]",
                "disabled:opacity-30 disabled:cursor-not-allowed",
                variant === "digit" && [
                    "bg-[--paper] border border-[--border] text-[--foreground]",
                    "hover:bg-[--subtle] active:bg-[--brand]/20 active:border-[--brand]/50",
                    pressed && "scale-90 bg-[--brand]/20 border-[--brand]/50",
                ],
                variant === "utility" && [
                    "bg-transparent border border-transparent text-[--muted]",
                    "hover:bg-[--subtle] active:text-[--foreground]",
                    pressed && "scale-90 text-[--foreground]",
                ],
                variant === "submit" && [
                    "bg-[--brand]/20 border border-[--brand]/30 text-[--brand]",
                    "hover:bg-[--brand]/30 active:bg-[--brand]/40",
                    pressed && "scale-90 bg-[--brand]/40",
                ],
            )}
        >
            {label}
        </button>
    )
}