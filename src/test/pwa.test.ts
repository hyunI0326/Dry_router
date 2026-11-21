import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const publicDir = join(process.cwd(), "public");

describe("ROUTER PWA", () => {
  it("ships its install icons at the dimensions declared in the manifest", () => {
    const manifest = JSON.parse(readFileSync(join(publicDir, "manifest.webmanifest"), "utf8"));
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    for (const icon of manifest.icons) {
      const png = readFileSync(join(publicDir, icon.src));
      expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(icon.sizes);
    }
  });

  it("serves its cached offline page when an app navigation cannot reach the network", async () => {
    const offline = new Response("offline");
    const add = vi.fn();
    const match = vi.fn().mockResolvedValue(offline);
    const listeners = new Map<string, (event: object) => void>();
    runInNewContext(readFileSync(join(publicDir, "sw.js"), "utf8"), {
      self: {
        addEventListener: (name: string, listener: (event: object) => void) =>
          listeners.set(name, listener),
        location: { origin: "https://example.com" },
        skipWaiting: vi.fn(),
      },
      caches: { open: vi.fn().mockResolvedValue({ add }), match },
      fetch: vi.fn().mockRejectedValue(new TypeError("offline")),
      URL,
      Request,
      Response,
    });

    const waitUntil = vi.fn();
    listeners.get("install")!({ waitUntil });
    await waitUntil.mock.calls[0]?.[0];
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://example.com/offline.html" }),
    );

    const respondWith = vi.fn();
    listeners.get("fetch")!({
      request: { url: "https://example.com/", mode: "navigate", method: "GET" },
      respondWith,
    });
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe(offline);
  });
});
