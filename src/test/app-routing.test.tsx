import { QueryClient } from "@tanstack/react-query";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";
import { Route } from "@/routes/index";

vi.mock("@/features/router/map", () => ({ default: () => null }));

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / instead of falling back to not found", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient() } });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
  });

  it("keeps a space in the home page title when the line break is hidden", async () => {
    const Page = Route.options.component;
    if (!Page) throw new Error("missing route page");
    render(<Page />);
    await waitFor(() => expect(screen.queryByText("지도를 불러오는 중…")).toBeNull());

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("서울 도심의 비 피할 곳.");
  });

  it("applies the detour time when the user searches again", async () => {
    const Page = Route.options.component;
    if (!Page) throw new Error("missing route page");
    render(<Page />);
    await waitFor(() => expect(screen.queryByText("지도를 불러오는 중…")).toBeNull());
    const input = screen.getByLabelText("최대 우회 시간");
    const search = screen.getByRole("button", { name: "덜 젖는 길 찾기" });

    fireEvent.change(input, { target: { value: "-1" } });
    expect(input).toBeInvalid();
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(search);
    expect(screen.getByText("빠른 길과 같음")).toBeVisible();
    expect(screen.getByText(/빠른 길보다 최대 0분/)).toBeVisible();

    fireEvent.change(input, { target: { value: "20" } });
    expect(screen.getByText(/빠른 길보다 최대 0분/)).toBeVisible();
    fireEvent.click(search);
    expect(screen.queryByText("빠른 길과 같음")).toBeNull();
    expect(screen.getByText(/빠른 길보다 최대 20분/)).toBeVisible();

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(search);
    expect(screen.getByText(/빠른 길보다 최대 40%/)).toBeVisible();
  });
});
