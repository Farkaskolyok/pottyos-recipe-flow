import { isLoopbackUrl } from "./network";

export const localOnly = () => process.env["LOCAL_ONLY"] === "1";

/** Refuse external destinations and redirects when operating locally. */
export const providerFetch: typeof fetch = async (input, init) => {
  if (!localOnly()) return fetch(input, init);
  const url = input instanceof Request ? input.url : String(input);
  if (!isLoopbackUrl(url)) throw new Error("Local mode requires a loopback AI endpoint.");
  return fetch(input, { ...init, redirect: "error" });
};
