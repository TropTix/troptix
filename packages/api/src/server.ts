// @troptix/api/server — SERVER ENTRY.
//
// Owns the tRPC router value, `createContext`/`createCaller`, and the service
// layer — all of which transitively import @troptix/db (server-only). The
// `server-only` import keeps this out of any client/RN bundle; the Expo app is
// lint-banned from importing this entry (guardrail lands with Stage 2).
//
// Stage 0 is wiring only; the services + router land in Stage 2.
import 'server-only';

export {};
