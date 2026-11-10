import { getRequest } from "@tanstack/react-start/server";

type RuntimeRequest = Request & {
  runtime?: { cloudflare?: { env?: Record<string, unknown> } };
};

/** Resolve secrets inside the current request; never cache a tenant's bindings. */
export function readServerSecret(name: string): string | undefined {
  let bindings: Record<string, unknown> | undefined;
  try {
    bindings = (getRequest() as RuntimeRequest).runtime?.cloudflare?.env;
  } catch {
    // Node tools/jobs can use process.env without a TanStack request context.
  }
  if (bindings && Object.hasOwn(bindings, name)) {
    const value = bindings[name];
    // An explicitly empty binding must not revive a stale process-level key.
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }
  const value = process.env[name];
  return value?.trim() || undefined;
}
