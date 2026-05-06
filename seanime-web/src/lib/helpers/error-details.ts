"use client"

import { AxiosError } from "axios"

export type DetailedError = {
    title: string
    description: string
    context?: string
    action?: string
}

/**
 * Extracts detailed, actionable error information from any error type.
 * Use this for EVERY error toast to ensure users know exactly what went wrong.
 */
export function getDetailedError(error: unknown, context?: string): DetailedError {
    // Default unknown error
    const defaultError: DetailedError = {
        title: context ? `${context} failed` : "Something went wrong",
        description: "An unexpected error occurred. Please try again.",
        context,
    }

    if (!error) return defaultError

    // Handle Axios errors (API calls)
    if (error instanceof AxiosError) {
        const status = error.response?.status
        const url = error.config?.url || "Unknown endpoint"
        const method = error.config?.method?.toUpperCase() || "REQUEST"
        const serverError = error.response?.data?.error as string | undefined

        // Network errors
        if (!error.response) {
            return {
                title: "Network Error",
                description: `Cannot reach server. Check your connection and try again.`,
                context: `${method} ${url}`,
                action: "Check internet connection",
            }
        }

        // Status code specific errors
        switch (status) {
            case 400:
                return {
                    title: "Bad Request",
                    description: serverError || `The server rejected the request.`,
                    context: `${method} ${url}`,
                }
            case 401:
                return {
                    title: "Authentication Required",
                    description: "Your session has expired. Please log in again.",
                    context: context || url,
                    action: "Re-authenticate",
                }
            case 403:
                return {
                    title: "Access Denied",
                    description: serverError || "You don't have permission to perform this action.",
                    context: url,
                }
            case 404:
                return {
                    title: "Not Found",
                    description: `The requested resource could not be found.`,
                    context: url,
                }
            case 409:
                return {
                    title: "Conflict",
                    description: serverError || "This action conflicts with the current state.",
                    context: url,
                }
            case 422:
                return {
                    title: "Validation Error",
                    description: serverError || "The provided data is invalid.",
                    context: url,
                }
            case 429:
                return {
                    title: "Too Many Requests",
                    description: "Please slow down and try again in a moment.",
                    context: url,
                    action: "Wait a few seconds",
                }
            case 500:
            case 502:
            case 503:
            case 504:
                return {
                    title: `Server Error (${status})`,
                    description: serverError || "The server encountered an error. Please try again later.",
                    context: url,
                    action: "Try again later",
                }
        }

        // Generic HTTP error with server message
        if (serverError) {
            return {
                title: `Request Failed (${status})`,
                description: serverError,
                context: `${method} ${url}`,
            }
        }

        return {
            title: `HTTP Error ${status}`,
            description: error.message || "The request failed.",
            context: url,
        }
    }

    // Handle standard Error objects
    if (error instanceof Error) {
        // Check for specific error patterns
        const message = error.message || ""

        // Network/connection errors
        if (message.includes("fetch") || message.includes("network") || message.includes("connection")) {
            return {
                title: "Connection Failed",
                description: message,
                context,
                action: "Check your internet connection",
            }
        }

        // Timeout errors
        if (message.includes("timeout") || message.includes("ETIMEDOUT")) {
            return {
                title: "Request Timed Out",
                description: "The operation took too long to complete.",
                context,
                action: "Try again",
            }
        }

        // JSON parse errors
        if (message.includes("JSON") || message.includes("parse")) {
            return {
                title: "Data Parsing Error",
                description: "The server returned invalid data.",
                context,
            }
        }

        // File system errors
        if (message.includes("ENOENT") || message.includes("no such file")) {
            return {
                title: "File Not Found",
                description: "The requested file or directory does not exist.",
                context,
            }
        }

        if (message.includes("EACCES") || message.includes("permission")) {
            return {
                title: "Permission Denied",
                description: "Cannot access the file or directory due to permissions.",
                context,
                action: "Check file permissions",
            }
        }

        // Storage/quota errors
        if (message.includes("quota") || message.includes("storage") || message.includes("localStorage")) {
            return {
                title: "Storage Error",
                description: "Your browser storage may be full or unavailable.",
                context,
                action: "Clear browser data",
            }
        }

        return {
            title: context ? `${context} failed` : "Error",
            description: message,
            context,
        }
    }

    // Handle string errors
    if (typeof error === "string") {
        return {
            title: context ? `${context} failed` : "Error",
            description: error,
            context,
        }
    }

    // Handle objects with error property
    if (typeof error === "object" && error !== null) {
        const errObj = error as Record<string, unknown>

        if (errObj.error && typeof errObj.error === "string") {
            return {
                title: context ? `${context} failed` : "Error",
                description: errObj.error,
                context,
            }
        }

        if (errObj.message && typeof errObj.message === "string") {
            return {
                title: context ? `${context} failed` : "Error",
                description: errObj.message,
                context,
            }
        }
    }

    return defaultError
}

/**
 * Helper to format error for toast display.
 * Returns { title, description } for use with sonner toast.
 */
export function formatErrorForToast(error: unknown, context?: string): { title: string; description?: string } {
    const detailed = getDetailedError(error, context)

    // Build the description
    let description = detailed.description
    if (detailed.context && detailed.context !== context) {
        description += `\n(${detailed.context})`
    }
    if (detailed.action) {
        description += `\n→ ${detailed.action}`
    }

    return {
        title: detailed.title,
        description: description.length > 500 ? description.slice(0, 500) + "…" : description,
    }
}
