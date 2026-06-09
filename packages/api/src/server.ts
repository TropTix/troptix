// @troptix/api/server — SERVER ENTRY.
//
// Owns the tRPC router value, `createContext`/`createCaller`, and the service
// layer — all of which transitively import @troptix/db. Import only from server
// code; the Expo app is lint-banned from importing this entry (guardrail lands
// with Stage 2).
//
// NB: like @troptix/db, this entry does NOT use the `server-only` package — it
// throws outside a React-Server-Components context and would break Pages-Router
// API routes / Node tooling that consume the services. The client/RN quarantine
// is the type-only `@troptix/api` barrel + the lint ban. See ADR 0009.
//
// Stage 0 is wiring only; the services + router land in Stage 2.
export {};
