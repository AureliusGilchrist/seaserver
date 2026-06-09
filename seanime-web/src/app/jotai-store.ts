import { createStore } from "jotai"

/**
 * The single Jotai store instance used by the whole app.
 *
 * It is created here (rather than in client-providers.tsx) so that non-React modules
 * such as the axios layer in `@/api/client/requests` can import the *exact same* store
 * the React tree uses via `<JotaiProvider store={store}>`. Reading from `getDefaultStore()`
 * instead would return Jotai's separate global singleton and miss every value the app set.
 */
export const store = createStore()
