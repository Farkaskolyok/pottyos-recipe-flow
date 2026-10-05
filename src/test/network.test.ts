import { afterEach, describe, expect, it, vi } from "vitest";
import { isLoopbackUrl } from "@/lib/network";
import { providerFetch } from "@/lib/network.server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("local network boundaries", () => {
  it("accepts loopback hosts and rejects misleading addresses", () => {
    for (const url of ["http://127.0.0.1:8765", "http://localhost:1234/v1", "http://[::1]/v1"])
      expect(isLoopbackUrl(url)).toBe(true);
    for (const url of [
      "http://localhost.example.com",
      "http://127.0.0.1.example.com",
      "http://localhost@remote.example",
      "https://remote.example/v1",
      "file:///tmp/model",
      "invalid",
    ])
      expect(isLoopbackUrl(url)).toBe(false);
  });

  it("blocks external AI calls before transmitting any snippets", async () => {
    vi.stubEnv("LOCAL_ONLY", "1");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      providerFetch("https://remote.example/v1", { body: "private text" }),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("prevents a local AI server from redirecting data externally", async () => {
    vi.stubEnv("LOCAL_ONLY", "1");
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await providerFetch("http://localhost:1234/v1", { method: "POST", body: "private text" });
    expect(fetch).toHaveBeenCalledWith("http://localhost:1234/v1", {
      method: "POST",
      body: "private text",
      redirect: "error",
    });
  });
});
