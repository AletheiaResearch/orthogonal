import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ScreenshotArtifactCard } from "./screenshot-artifact-card";

describe("ScreenshotArtifactCard", () => {
  it("renders an image with the provided caption and source", () => {
    render(
      <ScreenshotArtifactCard
        artifactId="a1"
        src="https://example.test/shot.png"
        caption="Home page"
        onOpen={() => {}}
      />
    );

    const img = screen.getByAltText("Home page");
    expect(img.tagName).toBe("IMG");
    expect(img).toHaveAttribute("src", "https://example.test/shot.png");
    // The button uses the caption as its accessible label.
    expect(screen.getByRole("button", { name: "Home page" })).toBeInTheDocument();
  });

  it("falls back to a default caption for screenshots", () => {
    render(<ScreenshotArtifactCard artifactId="a1" src="/shot.png" onOpen={() => {}} />);

    expect(screen.getByRole("button", { name: "Screenshot" })).toBeInTheDocument();
    expect(screen.getByAltText("Screenshot")).toBeInTheDocument();
  });

  it("fires onOpen with the artifactId when activated", async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <ScreenshotArtifactCard
        artifactId="artifact-42"
        src="/shot.png"
        caption="Click me"
        onOpen={onOpen}
      />
    );

    await user.click(screen.getByRole("button", { name: "Click me" }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("artifact-42");
  });

  it("renders a video element and default video caption when isVideo is set", () => {
    const { container } = render(
      <ScreenshotArtifactCard artifactId="v1" src="/clip.mp4" isVideo onOpen={() => {}} />
    );

    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("src", "/clip.mp4");
    expect(screen.getByRole("button", { name: "Video recording" })).toBeInTheDocument();
    // No <img> should be rendered in the video variant.
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows the source URL by default but hides it in compact mode", () => {
    const { rerender } = render(
      <ScreenshotArtifactCard
        artifactId="a1"
        src="/shot.png"
        caption="Page"
        sourceUrl="https://origin.example/path"
        onOpen={() => {}}
      />
    );

    expect(screen.getByText("https://origin.example/path")).toBeInTheDocument();

    rerender(
      <ScreenshotArtifactCard
        artifactId="a1"
        src="/shot.png"
        caption="Page"
        sourceUrl="https://origin.example/path"
        compact
        onOpen={() => {}}
      />
    );

    expect(screen.queryByText("https://origin.example/path")).not.toBeInTheDocument();
  });

  it("shows the loading placeholder until the media loads", () => {
    render(<ScreenshotArtifactCard artifactId="a1" src="/shot.png" onOpen={() => {}} />);

    expect(screen.getByText("Loading screenshot...")).toBeInTheDocument();

    fireEvent.load(screen.getByAltText("Screenshot"));

    expect(screen.queryByText("Loading screenshot...")).not.toBeInTheDocument();
  });

  it("renders an error fallback when the media fails to load", () => {
    render(
      <ScreenshotArtifactCard
        artifactId="a1"
        src="/broken.png"
        caption="Broken"
        onOpen={() => {}}
      />
    );

    fireEvent.error(screen.getByAltText("Broken"));

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
    // The broken image is no longer rendered.
    expect(screen.queryByAltText("Broken")).not.toBeInTheDocument();
  });
});
