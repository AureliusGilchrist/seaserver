import { INTERNAL_ProfileSummary as ProfileSummary } from "@/api/generated/types"
import {
    useCreateProfile,
    useDeleteProfile,
    useGetAllowedLibraryPaths,
    useGetProfiles,
    useSetAllowedLibraryPaths,
    useUpdateProfile,
} from "@/api/hooks/profiles.hooks"
import { useServerStatus } from "@/app/(main)/_hooks/use-server-status"
import { SettingsCard, SettingsPageHeader } from "@/app/(main)/settings/_components/settings-card"
import { Avatar } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Modal } from "@/components/ui/modal"
import React from "react"
import { BiEdit, BiPlus, BiTrash } from "react-icons/bi"
import { LuUsers } from "react-icons/lu"
import { toast } from "sonner"

import { useProfileLogout } from "@/api/hooks/profiles.hooks"
import { useRouter } from "@/lib/navigation"

export function ProfileManagement() {
    const serverStatus = useServerStatus()
    const isAdmin = serverStatus?.currentProfile?.isAdmin ?? true
    const { data: profiles, isLoading } = useGetProfiles()
    const { data: allowedPaths } = useGetAllowedLibraryPaths(isAdmin)

    // Add logout logic
    const { mutate: logout, isPending: isLoggingOut } = useProfileLogout()
    const router = useRouter()

    const [createOpen, setCreateOpen] = React.useState(false)
    const [editProfile, setEditProfile] = React.useState<ProfileSummary | null>(null)
    const [pathsValue, setPathsValue] = React.useState("")

    React.useEffect(() => {
        if (allowedPaths) {
            setPathsValue(allowedPaths.join("\n"))
        }
    }, [allowedPaths])

    if (!serverStatus?.profilesEnabled && !(profiles && profiles.length > 0)) {
        return (
            <div className="space-y-4">
                <SettingsPageHeader
                    title="Profiles"
                    description="Multi-profile support is not active. Profiles are created during setup or migration."
                    icon={LuUsers}
                />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <SettingsPageHeader
                title="Profiles"
                description="Manage user profiles and access controls"
                icon={LuUsers}
            />

            <div className="flex justify-end mb-2">
                <Button
                    intent="gray-outline"
                    size="sm"
                    loading={isLoggingOut}
                    onClick={() => {
                        logout(undefined, {
                            onSuccess: () => {
                                router.replace("/profiles")
                            },
                        })
                    }}
                >
                    Log out of profile
                </Button>
            </div>

            <SettingsCard title="Profiles" description="Create, edit, and delete user profiles.">
                <div className="space-y-3">
                    {isLoading && <p className="text-sm text-[--muted]">Loading...</p>}
                    {profiles?.map((profile) => (
                        <ProfileRow
                            key={profile.id}
                            profile={profile}
                            isAdmin={isAdmin}
                            onEdit={() => setEditProfile(profile)}
                        />
                    ))}
                </div>
                {isAdmin && (
                    <Button
                        intent="primary-subtle"
                        size="sm"
                        leftIcon={<BiPlus />}
                        onClick={() => setCreateOpen(true)}
                        className="mt-4"
                    >
                        Add Profile
                    </Button>
                )}
            </SettingsCard>

            {isAdmin && (
                <SettingsCard title="Allowed Library Paths" description="Control which library paths are available to non-admin profiles. One path per line.">
                    <textarea
                        value={pathsValue}
                        onChange={(e) => setPathsValue(e.target.value)}
                        rows={4}
                        placeholder="/path/to/anime&#10;/path/to/movies"
                        className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] font-mono text-sm focus:border-[--brand] focus:outline-none"
                    />
                    <SavePathsButton paths={pathsValue} />
                </SettingsCard>
            )}

            <CreateProfileModal open={createOpen} onClose={() => setCreateOpen(false)} />
            <EditProfileModal profile={editProfile} onClose={() => setEditProfile(null)} />
        </div>
    )
}

function ProfileRow({ profile, isAdmin, onEdit }: { profile: ProfileSummary; isAdmin: boolean; onEdit: () => void }) {
    const { mutate: deleteProfile, isPending } = useDeleteProfile(profile.id)
    const [confirmDelete, setConfirmDelete] = React.useState(false)

    return (
        <div className="flex items-center gap-3 p-3 rounded-md bg-[--subtle] border border-[--border]">
            <Avatar
                src={profile.avatarPath || profile.anilistAvatar || undefined}
                fallback={profile.name.charAt(0).toUpperCase()}
                size="sm"
            />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[--foreground] truncate">{profile.name}</span>
                    {profile.isAdmin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[--brand]/10 text-[--brand] font-bold">Admin</span>
                    )}
                </div>
                {profile.anilistUsername && (
                    <p className="text-xs text-[--muted] truncate">AniList: {profile.anilistUsername}</p>
                )}
            </div>
            {isAdmin && (
                <div className="flex gap-1.5">
                    <Button intent="gray" size="sm" leftIcon={<BiEdit />} onClick={onEdit}>
                        Edit
                    </Button>
                    {confirmDelete ? (
                        <div className="flex gap-1">
                            <Button intent="alert" size="sm" onClick={() => deleteProfile(undefined)} loading={isPending}>
                                Confirm
                            </Button>
                            <Button intent="gray" size="sm" onClick={() => setConfirmDelete(false)}>
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <Button intent="alert-subtle" size="sm" leftIcon={<BiTrash />} onClick={() => setConfirmDelete(true)}>
                            Delete
                        </Button>
                    )}
                </div>
            )}
        </div>
    )
}

function CreateProfileModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [name, setName] = React.useState("")
    const [pin, setPin] = React.useState("")
    const [isAdmin, setIsAdmin] = React.useState(false)
    const { mutate: create, isPending } = useCreateProfile()

    const handleSubmit = () => {
        if (!name.trim()) return
        create(
            { name: name.trim(), pin, isAdmin },
            {
                onSuccess: () => {
                    setName("")
                    setPin("")
                    setIsAdmin(false)
                    onClose()
                },
            },
        )
    }

    return (
        <Modal
            title="Create Profile"
            open={open}
            onOpenChange={(v) => !v && onClose()}
            contentClass="max-w-md"
        >
            <div className="space-y-4 p-1">
                <div>
                    <label className="block text-sm font-medium text-[--foreground] mb-1.5">Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Profile name"
                        className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] focus:border-[--brand] focus:outline-none"
                        autoFocus
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-[--foreground] mb-1.5">PIN (4-8 digits)</label>
                    <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={8}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                        placeholder="Required"
                        className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] focus:border-[--brand] focus:outline-none"
                    />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isAdmin}
                        onChange={(e) => setIsAdmin(e.target.checked)}
                        className="rounded"
                    />
                    <span className="text-sm text-[--foreground]">Admin privileges</span>
                </label>
                <div className="flex gap-3 justify-end pt-2">
                    <Button intent="gray" onClick={onClose}>Cancel</Button>
                    <Button intent="primary" onClick={handleSubmit} loading={isPending} disabled={!name.trim() || pin.length < 4}>
                        Create
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

function EditProfileModal({ profile, onClose }: { profile: ProfileSummary | null; onClose: () => void }) {
    const [name, setName] = React.useState("")
    const [pin, setPin] = React.useState("")
    const [isAdmin, setIsAdmin] = React.useState(false)
    const [avatarFile, setAvatarFile] = React.useState<File | null>(null)
    const fileInputRef = React.useRef<HTMLInputElement>(null)

    const { mutate: update, isPending } = useUpdateProfile(profile?.id ?? 0)

    React.useEffect(() => {
        if (profile) {
            setName(profile.name)
            setIsAdmin(profile.isAdmin)
            setPin("")
            setAvatarFile(null)
        }
    }, [profile])

    const handleSubmit = async () => {
        if (!profile) return
        const updates: { name?: string; pin?: string; isAdmin?: boolean } = {}
        if (name.trim() && name.trim() !== profile.name) updates.name = name.trim()
        if (pin) updates.pin = pin
        if (isAdmin !== profile.isAdmin) updates.isAdmin = isAdmin

        if (avatarFile) {
            // Upload avatar separately via FormData
            const formData = new FormData()
            formData.append("avatar", avatarFile)
            try {
                const { getServerBaseUrl } = await import("@/api/client/server-url")
                const response = await fetch(`${getServerBaseUrl()}/api/v1/profiles/${profile.id}/avatar`, {
                    method: "POST",
                    body: formData,
                })
                if (!response.ok) {
                    toast.error("Failed to upload avatar")
                }
            } catch {
                toast.error("Failed to upload avatar")
            }
        }

        if (Object.keys(updates).length > 0) {
            update(updates, { onSuccess: () => onClose() })
        } else {
            onClose()
        }
    }

    if (!profile) return null

    return (
        <Modal
            title={`Edit ${profile.name}`}
            open={!!profile}
            onOpenChange={(v) => !v && onClose()}
            contentClass="max-w-md"
        >
            <div className="space-y-4 p-1">
                <div className="flex items-center gap-4">
                    <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        <Avatar
                            src={avatarFile ? URL.createObjectURL(avatarFile) : (profile.avatarPath || profile.anilistAvatar || undefined)}
                            fallback={profile.name.charAt(0).toUpperCase()}
                            size="lg"
                            className="w-16 h-16"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 hover:opacity-100 transition-opacity">
                            <BiEdit className="text-white text-lg" />
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                    if (file.size > 5 * 1024 * 1024) {
                                        toast.error("Avatar must be under 5MB")
                                        return
                                    }
                                    setAvatarFile(file)
                                }
                            }}
                        />
                    </div>
                    <p className="text-xs text-[--muted]">Click avatar to change. Max 5MB.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-[--foreground] mb-1.5">Name</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] focus:border-[--brand] focus:outline-none"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-[--foreground] mb-1.5">New PIN (leave blank to keep)</label>
                    <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={8}
                        value={pin}
                        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                        placeholder="••••"
                        className="w-full px-3 py-2 rounded-md border border-[--border] bg-[--paper] text-[--foreground] focus:border-[--brand] focus:outline-none"
                    />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={isAdmin}
                        onChange={(e) => setIsAdmin(e.target.checked)}
                        className="rounded"
                    />
                    <span className="text-sm text-[--foreground]">Admin privileges</span>
                </label>
                <div className="flex gap-3 justify-end pt-2">
                    <Button intent="gray" onClick={onClose}>Cancel</Button>
                    <Button intent="primary" onClick={handleSubmit} loading={isPending}>
                        Save
                    </Button>
                </div>
            </div>
        </Modal>
    )
}

function SavePathsButton({ paths }: { paths: string }) {
    const { mutate: setPaths, isPending } = useSetAllowedLibraryPaths()

    return (
        <Button
            intent="primary"
            size="sm"
            className="mt-3"
            loading={isPending}
            onClick={() => {
                const parsed = paths
                    .split("\n")
                    .map((p) => p.trim())
                    .filter(Boolean)
                setPaths({ paths: parsed })
            }}
        >
            Save Paths
        </Button>
    )
}
