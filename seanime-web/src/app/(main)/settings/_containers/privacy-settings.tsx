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

const privacySchema = defineSchema(({ z }) => z.object({
    dohEnabled: z.boolean(),
    dohProviders: z.string().min(0),
    socks5Enabled: z.boolean(),
    socks5Address: z.string().min(0),
    socks5Port: z.coerce.number().min(1).max(65535),
    dnsCryptEnabled: z.boolean(),
    failMode: z.string(),
}))

export function PrivacySettings() {
    const { data: status, isLoading } = useGetPrivacySettings(true)
    const { mutate: save, isPending: isSaving } = useSavePrivacySettings()
    const { mutate: testConnection, isPending: isTesting, data: testResult } = useTestPrivacyConnection()
    const { mutate: installDNSCrypt, isPending: isInstalling } = useInstallDNSCrypt()

    if (isLoading || !status) return <LoadingSpinner />

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
                            dohProviders: data.dohProviders.split(",").map((s: string) => s.trim()).filter(Boolean),
                            socks5Enabled: data.socks5Enabled,
                            socks5Address: data.socks5Address,
                            socks5Port: data.socks5Port,
                            dnsCryptEnabled: data.dnsCryptEnabled,
                            failMode: data.failMode,
                        },
                    })
                }}
                defaultValues={{
                    dohEnabled: status.settings.dohEnabled,
                    dohProviders: status.settings.dohProviders?.join(", ") ?? "",
                    socks5Enabled: status.settings.socks5Enabled,
                    socks5Address: status.settings.socks5Address || "127.0.0.1",
                    socks5Port: status.settings.socks5Port || 1080,
                    dnsCryptEnabled: status.settings.dnsCryptEnabled,
                    failMode: status.settings.failMode || "open",
                }}
                stackClass="space-y-4"
            >
                {(f) => (
                    <>
                        {/* DNS-over-HTTPS */}
                        <SettingsCard title="DNS-over-HTTPS (DoH)" description="Encrypts DNS queries so your ISP cannot see which domains you resolve. Multiple providers are used with automatic failover.">
                            <Field.Switch name="dohEnabled" label="Enable DoH" />
                            <Field.Textarea
                                name="dohProviders"
                                label="DoH Providers (comma-separated)"
                                help="Ordered by priority. First working provider is used."
                            />
                            {status.activeDoHProvider && (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-[--muted]">Active:</span>
                                    <Badge intent="success" size="sm">{status.activeDoHProvider}</Badge>
                                </div>
                            )}
                        </SettingsCard>

                        {/* SOCKS5 Proxy */}
                        <SettingsCard title="SOCKS5 Proxy (Mullvad)" description="Routes ALL outgoing traffic through a SOCKS5 proxy. When using Mullvad VPN, the app traffic is routed through the VPN tunnel.">
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

                        {/* Fail Mode */}
                        <SettingsCard title="Fail Mode">
                            <Field.Select
                                name="failMode"
                                label="When proxy is unreachable"
                                options={[
                                    { label: "Fail Open (fallback to direct)", value: "open" },
                                    { label: "Fail Closed (block all traffic)", value: "closed" },
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
