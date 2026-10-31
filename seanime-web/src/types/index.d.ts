import "@total-typescript/ts-reset"

declare global {
    interface AudioTrack {
        id: string;
        kind: string;
        label: string;
        language: string;
        enabled: boolean;
    }

    interface AudioTrackList extends EventTarget {
        readonly length: number;
        onchange: ((this: AudioTrackList, ev: Event) => any) | null;
        onaddtrack: ((this: AudioTrackList, ev: TrackEvent) => any) | null;
        onremovetrack: ((this: AudioTrackList, ev: TrackEvent) => any) | null;

        [index: number]: AudioTrack;

        getTrackById(id: string): AudioTrack | null;
    }

    interface HTMLMediaElement {
        readonly audioTracks: AudioTrackList | undefined;
    }

    interface Window {
        electron?: {
            window: {
                minimize: () => void;
                maximize: () => void;
                close: () => void;
                isMaximized: () => Promise<boolean>;
                isMinimizable: () => Promise<boolean>;
                isMaximizable: () => Promise<boolean>;
                isClosable: () => Promise<boolean>;
                isFullscreen: () => Promise<boolean>;
                setFullscreen: (fullscreen: boolean) => void;
                /** Element fullscreen for the element matching `selector`, run as a user gesture (works outside a click). */
                requestElementFullscreen?: (selector: string) => Promise<boolean>;
                toggleMaximize: () => void;
                hide: () => void;
                show: () => void;
                isVisible: () => Promise<boolean>;
                setTitleBarStyle: (style: string) => void;
                getCurrentWindow: () => Promise<string>;
                isMainWindow: () => Promise<boolean>;
                // Fork: open (or reuse) the always-on-top popout player window
                openPlayerPopout: (url: string) => Promise<void>;
                // Fork: lock the popout window's size to the video's aspect ratio
                setPopoutAspectRatio: (ratio: number) => Promise<void>;
                popoutDragStart: () => void;
                popoutDragMove: (dx: number, dy: number) => void;
                popoutDragEnd: () => void;
                returnPlayerFromPopout: (state: { path: string; time: number; paused: boolean; from?: string }) => Promise<void>;
            };
            localServer: {
                getPort: () => Promise<number>;
            },
            media?: {
                setMetadata: (metadata: any) => Promise<boolean>
                clearSession: () => Promise<boolean>
                stopAllMedia: () => Promise<boolean>
            }
            on: (channel: string, callback: (...args: any[]) => void) => (() => void) | undefined;
            // Send events
            emit: (channel: string, data?: any) => void;
            // General send method
            send: (channel: string, ...args: any[]) => void;
            platform: NodeJS.Platform;
            shell: {
                open: (url: string) => Promise<void>;
            };
            clipboard: {
                writeText: (text: string) => Promise<void>;
            };
            denshiSettings: {
                get: () => Promise<DenshiSettings>;
                set: (settings: DenshiSettings) => Promise<DenshiSettings>;
            };
            liveUpdate?: {
                updateBackend: () => Promise<LiveUpdateResult>;
                updateFrontend: () => Promise<LiveUpdateResult>;
                checkBackend: () => Promise<LiveUpdateCheck>;
                checkFrontend: () => Promise<LiveUpdateCheck>;
                getInfo: () => Promise<{
                    repoRoot: string | null;
                    repoOrigin?: string | null;
                    remote?: boolean;
                    busy: boolean;
                    hasLiveBackend: boolean;
                    hasLiveFrontend: boolean
                }>;
                // Frontend updates from GitHub releases (no account, no git needed)
                checkGitHub?: () => Promise<LiveUpdateGitHubCheck>;
                updateGitHub?: () => Promise<LiveUpdateGitHubResult>;
                getGitHubInfo?: () => Promise<{
                    busy: boolean;
                    repo: string;
                    version: string | null;
                    source: "github" | "local" | "bundled";
                    installedAt?: string | null;
                    marker?: { version: string; tag?: string; asset?: string; installedAt?: string } | null;
                }>;
            };
            discord?: {
                setActivity: (payload: any) => Promise<boolean>;
                clearActivity: () => Promise<boolean>;
            };
            cast?: {
                discover: () => Promise<void>;
                stopDiscovery: () => Promise<void>;
                getDevices: () => Promise<CastDevice[]>;
                connect: (deviceId: string) => Promise<CastSessionState>;
                disconnect: () => Promise<void>;
                getStatus: () => Promise<CastStatus>;
                loadMedia: (opts: CastLoadMediaOptions) => Promise<number>;
                play: () => Promise<void>;
                pause: () => Promise<void>;
                seek: (time: number) => Promise<void>;
                stop: () => Promise<void>;
                setVolume: (level: number) => Promise<void>;
                setMuted: (muted: boolean) => Promise<void>;
                sendSubtitleEvents: (events: any[]) => Promise<void>;
                sendSubtitleTracks: (tracks: any[]) => Promise<void>;
                switchSubtitleTrack: (trackNumber: number) => Promise<void>;
                sendFonts: (fontUrls: string[], serverPort?: number) => Promise<void>;
                sendSubtitleHeader: (header: string) => Promise<void>;
                disableSubtitles: () => Promise<void>;
                getLanIP: () => Promise<string>;
            };
        };

        __isElectronDesktop__?: boolean;
    }

    interface CastDevice {
        id: string;
        name: string;
        host: string;
        port: number;
    }

    interface CastSessionState {
        connected: boolean;
        device: CastDevice | null;
        sessionId: string | null;
    }

    interface CastStatus {
        connected: boolean;
        device: CastDevice | null;
        sessionId: string | null;
        mediaStatus: CastMediaStatus | null;
    }

    interface CastMediaStatus {
        mediaSessionId: number;
        playerState: "IDLE" | "BUFFERING" | "PLAYING" | "PAUSED";
        currentTime: number;
        duration?: number;
        volume?: { level: number; muted: boolean };
        idleReason?: string;
    }

    interface CastLoadMediaOptions {
        streamUrl: string;
        contentType: string;
        title?: string;
        subtitle?: string;
        imageUrl?: string;
        duration?: number;
        serverPort?: number;
    }

    interface LiveUpdateFileChange {
        path: string;
        insertions: number;
        deletions: number;
    }

    interface LiveUpdateCheck {
        ok: boolean;
        error?: string;
        /** Frontend: whether a previous build was recorded to compare against. */
        baseline?: boolean;
        /** Backend: how many commits the fork has that this checkout lacks. */
        behind?: number;
        files?: LiveUpdateFileChange[];
    }

    interface LiveUpdateResult {
        ok: boolean;
        message?: string;
        error?: string;
        stats?: { files: number; insertions: number; deletions: number; lines: number; changes?: LiveUpdateFileChange[]; baseline?: boolean };
    }

    interface LiveUpdateGitHubCheck {
        ok: boolean;
        error?: string;
        /** Version of the frontend currently in use; null when it is a local build. */
        current?: string | null;
        currentSource?: "github" | "local" | "bundled";
        installedAt?: string | null;
        /** Newest version with a frontend bundle on GitHub; null when none was found. */
        latest?: string | null;
        tag?: string | null;
        assetName?: string | null;
        releaseUrl?: string | null;
        /** A newer GitHub frontend exists than the one in use. */
        updateAvailable?: boolean;
        /** A frontend bundle can be installed over what is in use right now. */
        canInstall?: boolean;
    }

    interface LiveUpdateGitHubResult extends LiveUpdateGitHubCheck {
        message?: string;
        version?: string | null;
    }

    interface DenshiSettings {
        minimizeToTray: boolean;
        openInBackground: boolean;
        openAtLaunch: boolean;
        sourceRepoPath?: string;
        autoUpdateFrontend?: boolean;
    }
}
