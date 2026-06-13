// @vitest-environment jsdom
/// <reference types="@testing-library/jest-dom" />

import * as matchers from "@testing-library/jest-dom/matchers";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MediaSection } from "./sidebar/media-section";

expect.extend(matchers);

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("MediaSection", () => {
  it("renders nothing when there are no media artifacts", () => {
    const onOpenMedia = vi.fn();
    const { container } = render(
      <MediaSection sessionId="session-1" mediaArtifacts={[]} onOpenMedia={onOpenMedia} />
    );

    expect(container.firstChild).toBeNull();
    expect(onOpenMedia).not.toHaveBeenCalled();
  });

  it("renders one card per media artifact and hides source URLs in compact mode", () => {
    const onOpenMedia = vi.fn();

    render(
      <MediaSection
        sessionId="session-1"
        mediaArtifacts={[
          {
            id: "artifact-1",
            type: "screenshot",
            url: "sessions/session-1/media/artifact-1.png",
            metadata: {
              caption: "Sidebar shot",
              sourceUrl: "https://app.example.com/sidebar",
            },
            createdAt: 1234,
          },
          {
            id: "artifact-video-1",
            type: "video",
            url: "sessions/session-1/media/artifact-video-1.mp4",
            metadata: {
              caption: "Sidebar recording",
              sourceUrl: "https://app.example.com/sidebar",
              durationMs: 1450,
              dimensions: { width: 1280, height: 720 },
            },
            createdAt: 1235,
          },
        ]}
        onOpenMedia={onOpenMedia}
      />
    );

    fireEvent.load(screen.getByAltText("Sidebar shot"));
    fireEvent.click(screen.getByRole("button", { name: "Sidebar shot" }));
    expect(onOpenMedia).toHaveBeenCalledWith("artifact-1");
    expect(screen.getByLabelText("Sidebar recording video preview")).toBeInTheDocument();
    expect(screen.queryByText("https://app.example.com/sidebar")).not.toBeInTheDocument();
  });
});
