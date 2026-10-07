import "server-only";

// Import this (not ./client) from route handlers and server components, so a
// stray client-side import fails the build instead of shipping the SDK.
export * from "./client";
export * from "./prompts";
