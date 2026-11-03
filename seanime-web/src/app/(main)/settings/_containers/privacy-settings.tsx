import { useGetPrivacySettings, useInstallDNSCrypt, useSavePrivacySettings, useTestPrivacyConnection } from "@/api/hooks/privacy.hooks"
import { SettingsCard, SettingsPageHeader } from "@/app/(main)/settings/_components/settings-card"
import { SettingsSubmitButton } from "@/app/(main)/settings/_components/settings-submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { defineSchema, Field, Form } from "@/components/ui/form"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Separator } from "@/components/ui/separator"
import React from "react"
import { LuShieldCheck } from "react-icons/lu"

const CUSTOM_PROVIDER = "custom"

const privacySchema = defineSchema(({ z }) => z.object({
    dohEnabled: z.boolean(),
    dohProvider: z.string().min(0),
    dohCustomProvider: z.string().min(0),
    socks5Enabled: z.boolean(),
    socks5Address: z.string().min(0),
    socks5Port: z.coerce.number().min(1).max(65535),
    dnsCryptEnabled: z.boolean(),
    failMode: z.string(),
    torrentEncryption: z.string(),
}))

export function PrivacySettings() {
    const { data: status, isLoading } = useGetPrivacySettings(true)
    const { mutate: save, isPending: isSaving } = useSavePrivacySettings()
    const { mutate: testConnection, isPending: isTesting, data: testResult } = useTestPrivacyConnection()
    const { mutate: installDNSCrypt, isPending: isInstalling } = useInstallDNSCrypt()

    if (isLoading || !status) return <LoadingSpinner />

    const knownProviders = status.knownProviders ?? []
    const currentProvider = status.settings.dohProviders?.[0] ?? ""
    const isCustom = !!currentProvider && !knownProviders.some(p => p.url === currentProvider)

    return (
        <>
            <SettingsPageHeader
                title="Privacy & Network"
                description="Encrypt DNS queries, route traffic through SOCKS5 proxy, and enable DNSCrypt"
                icon={LuShieldCheck}
            />

            <Form
                schema={privacySchema}
                onSubmit={data => {
                    save({
                        settings: {
                            dohEnabled: data.dohEnabled,
                            dohProviders: [
                                data.dohProvider === CUSTOM_PROVIDER
                                    ? data.dohCustomProvider.trim()
                                    : data.dohProvider,
                            ].filter(Boolean),
                            socks5Enabled: data.socks5Enabled,
                            socks5Address: data.socks5Address,
                            socks5Port: data.socks5Port,
                            dnsCryptEnabled: data.dnsCryptEnabled,
                            failMode: data.failMode,
                            torrentEncryption: data.torrentEncryption,
                        },
                    })
                }}
                defaultValues={{
                    dohEnabled: status.settings.dohEnabled,
                    dohProvider: isCustom ? CUSTOM_PROVIDER : currentProvider,
                    dohCustomProvider: isCustom ? currentProvider : "",
                    socks5Enabled: status.settings.socks5Enabled,
                    socks5Address: status.settings.socks5Address || "127.0.0.1",
                    socks5Port: status.settings.socks5Port || 1080,
                    dnsCryptEnabled: status.settings.dnsCryptEnabled,
                    failMode: status.settings.failMode || "open",
                    torrentEncryption: status.settings.torrentEncryption || "prefer",
                }}
                stackClass="space-y-4"
                noFormElement
            >
                {(f) => (
                    <>
                        {/* DNS-over-HTTPS */}
                        <SettingsCard title="DNS-over-HTTPS (DoH)" description="Encrypts DNS queries so your ISP cannot see which domains you resolve. It also covers torrent tracker and DHT lookups. If the resolver goes down, Fail Mode below decides what happens.">
                            <Field.Switch name="dohEnabled" label="Enable DoH" />
                            <Field.Select
                                name="dohProvider"
                                label="Resolver"
                                help={
                                    knownProviders.find(p => p.url === f.watch("dohProvider"))?.description
                                    ?? "Enter any DoH endpoint URL."
                                }
                                options={[
                                    ...knownProviders.map(p => ({
                                        label: p.filtering === "none" ? p.name : `${p.name} — blocks ${p.filtering.replace("+", " + ")}`,
                                        value: p.url,
                                    })),
                                    { label: "Custom…", value: CUSTOM_PROVIDER },
                                ]}
                            />
                            {f.watch("dohProvider") === CUSTOM_PROVIDER && (
                                <Field.Text
                                    name="dohCustomProvider"
                                    label="Custom DoH endpoint"
                                    placeholder="https://example.com/dns-query"
                                />
                            )}
                            {status.activeDoHProvider && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-[--muted]">Active:</span>
                                    <Badge intent="success" size="sm">{status.activeDoHProvider}</Badge>
                                </div>
                            )}
                        </SettingsCard>

                        {/* SOCKS5 Proxy */}
                        <SettingsCard title="SOCKS5 Proxy (Mullvad)" description="Routes outgoing web traffic and torrent tracker announces through a SOCKS5 proxy, with hostnames resolved on the proxy side. Local and LAN addresses (qBittorrent, your NAS) are always reached directly. Torrent peer connections are not proxied: use a VPN for those.">
                            <Field.Switch name="socks5Enabled" label="Enable SOCKS5 Proxy" />
                            <div className="grid grid-cols-2 gap-4">
                                <Field.Text name="socks5Address" label="Address" />
                                <Field.Number name="socks5Port" label="Port" />
                            </div>
                        </SettingsCard>

                        {/* DNSCrypt */}
                        <SettingsCard title="DNSCrypt-proxy" description="Local DNS resolver that authenticates and encrypts DNS traffic. Uses no-log servers by default.">
                            <Field.Switch name="dnsCryptEnabled" label="Enable DNSCrypt" />
                            <div className="flex items-center gap-3">
                                <span className="text-sm">Status:</span>
                                {status.dnsCrypt.installed ? (
                                    <Badge intent={status.dnsCrypt.running ? "success" : "warning"} size="sm">
                                        {status.dnsCrypt.running ? "Running" : "Installed (not running)"}
                                    </Badge>
                                ) : (
                                    <>
                                        <Badge intent="gray" size="sm">Not installed</Badge>
                                        <Button
                                            intent="primary-subtle"
                                            size="sm"
                                            onClick={() => installDNSCrypt()}
                                            loading={isInstalling}
                                        >
                                            Install via dnf
                                        </Button>
                                    </>
                                )}
                            </div>
                        </SettingsCard>

                        {/* Torrent encryption */}
                        <SettingsCard title="Torrent Encryption" description="BitTorrent protocol encryption for torrent streaming, the built-in client and qBittorrent. It hides torrent traffic from simple ISP inspection and throttling.">
                            <Field.Select
                                name="torrentEncryption"
                                label="Peer connections"
                                help={f.watch("torrentEncryption") === "require"
                                    ? "Unencrypted peers are refused. Some torrents will have fewer peers and may load slower. qBittorrent is switched to \"Require encryption\"."
                                    : "Encrypts with every peer that supports it and still connects to the rest. Your qBittorrent settings are left as they are."}
                                options={[
                                    { label: "Prefer encryption (recommended)", value: "prefer" },
                                    { label: "Require encryption", value: "require" },
                                ]}
                            />
                        </SettingsCard>

                        {/* Fail Mode */}
                        <SettingsCard title="Fail Mode" description="The SOCKS5 proxy never falls back to a direct connection: if it is down, proxied requests fail.">
                            <Field.Select
                                name="failMode"
                                label="When every DoH resolver is unreachable"
                                options={[
                                    { label: "Fail Open (use the system resolver)", value: "open" },
                                    { label: "Fail Closed (block DNS lookups)", value: "closed" },
                                ]}
                            />
                        </SettingsCard>

                        <Separator />

                        {/* Connection Test */}
                        <SettingsCard title="Connection Test">
                            <Button
                                intent="white-subtle"
                                onClick={() => testConnection()}
                                loading={isTesting}
                            >
                                Test Privacy Layers
                            </Button>
                            {testResult && (
                                <div className="space-y-2 mt-3">
                                    <div className="flex items-center gap-2">
                                        <Badge intent={testResult.dohWorking ? "success" : "alert"} size="sm">
                                            DoH: {testResult.dohWorking ? "Working" : "Failed"}
                                        </Badge>
                                        {testResult.dohProvider && (
                                            <span className="text-xs text-[--muted]">{testResult.dohProvider}</span>
                                        )}
                                    </div>
                                    <Badge intent={testResult.socks5Working ? "success" : "alert"} size="sm">
                                        SOCKS5: {testResult.socks5Working ? "Connected" : "Not connected"}
                                    </Badge>
                                    <Badge intent={testResult.dnsCryptRunning ? "success" : "alert"} size="sm">
                                        DNSCrypt: {testResult.dnsCryptRunning ? "Running" : "Not running"}
                                    </Badge>
                                </div>
                            )}
                        </SettingsCard>

                        <SettingsSubmitButton isPending={isSaving} />
                    </>
                )}
            </Form>
        </>
    )
}
