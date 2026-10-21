export const __isDesktop__ = process.env.NEXT_PUBLIC_PLATFORM === "desktop" // Tauri
export const __isElectronDesktop__ = process.env.NEXT_PUBLIC_DESKTOP === "electron"
export const __isTauriDesktop__ = process.env.NEXT_PUBLIC_DESKTOP === "tauri"
/** The Denshi Mobile shell: an Electron client rendering the app in a phone-shaped window. */
export const __isMobileShell__ = process.env.NEXT_PUBLIC_PLATFORM === "mobile"
export const __CAST_ENABLED__ = true
export const HIDE_IMAGES = false
