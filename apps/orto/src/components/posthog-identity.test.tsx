// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PostHogIdentity } from "./posthog-identity";

const { mockIdentify, mockUseSession } = vi.hoisted(() => ({
  mockIdentify: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: { identify: mockIdentify } }));
vi.mock("next-auth/react", () => ({ useSession: mockUseSession }));
vi.mock("@/lib/posthog", () => ({ posthogEnabled: true }));

describe("PostHogIdentity", () => {
  beforeEach(() => {
    mockIdentify.mockClear();
    mockUseSession.mockReset();
  });

  it("identifies the signed-in user by GitHub id with profile properties", () => {
    mockUseSession.mockReturnValue({
      status: "authenticated",
      data: {
        user: {
          id: "12345",
          login: "quantumly",
          name: "Nejc Drobnic",
          email: "nejc@nejc.dev",
          image: "https://avatars.githubusercontent.com/u/12345",
        },
      },
    });

    render(<PostHogIdentity />);

    expect(mockIdentify).toHaveBeenCalledTimes(1);
    expect(mockIdentify).toHaveBeenCalledWith("12345", {
      email: "nejc@nejc.dev",
      name: "Nejc Drobnic",
      github_login: "quantumly",
      avatar_url: "https://avatars.githubusercontent.com/u/12345",
    });
  });

  it("does not identify while unauthenticated", () => {
    mockUseSession.mockReturnValue({ status: "unauthenticated", data: null });
    render(<PostHogIdentity />);
    expect(mockIdentify).not.toHaveBeenCalled();
  });

  it("identifies once per user across re-renders", () => {
    // Fresh objects per call so the effect re-runs and the ref guard is exercised
    mockUseSession.mockImplementation(() => ({
      status: "authenticated",
      data: { user: { id: "12345", login: "quantumly" } },
    }));

    const { rerender } = render(<PostHogIdentity />);
    rerender(<PostHogIdentity />);

    expect(mockIdentify).toHaveBeenCalledTimes(1);
  });
});
