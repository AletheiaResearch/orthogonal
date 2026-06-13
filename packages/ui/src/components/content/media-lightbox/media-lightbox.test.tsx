import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MediaLightbox } from "./index";

beforeAll(() => {
  // Radix Dialog relies on these browser APIs that jsdom does not implement.
  if (!("ResizeObserver" in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

describe("MediaLightbox", () => {
  it("renders an image with the resolved src and alt text for image media", () => {
    render(
      <MediaLightbox
        src="https://example.com/shot.png"
        type="image"
        title="Landing page"
        open
        onOpenChange={() => {}}
      />
    );

    const img = screen.getByRole("img", { name: "Landing page" });
    expect(img).toHaveAttribute("src", "https://example.com/shot.png");
  });

  it("defaults to image rendering when no type is provided", () => {
    render(<MediaLightbox src="https://example.com/shot.png" open onOpenChange={() => {}} />);

    // Title and description fall back to the image-derived labels.
    expect(screen.getByText("Screenshot")).toBeInTheDocument();
    expect(screen.getByText("Session screenshot")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Screenshot" })).toBeInTheDocument();
  });

  it("renders a video element with type-derived labels for video media", () => {
    render(
      <MediaLightbox src="https://example.com/rec.mp4" type="video" open onOpenChange={() => {}} />
    );

    // Radix Dialog portals its content to document.body, so query via screen
    // rather than the render container. The video's accessible name is derived
    // from the type-based caption ("Video recording" + " video").
    const video = screen.getByLabelText("Video recording video");
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "https://example.com/rec.mp4");
    expect(screen.getByText("Video recording")).toBeInTheDocument();
    expect(screen.getByText("Session video recording")).toBeInTheDocument();
  });

  it("prefers explicit title and description over the type-derived fallbacks", () => {
    render(
      <MediaLightbox
        src="https://example.com/shot.png"
        type="image"
        title="Custom title"
        description="Custom description"
        open
        onOpenChange={() => {}}
      />
    );

    expect(screen.getByText("Custom title")).toBeInTheDocument();
    expect(screen.getByText("Custom description")).toBeInTheDocument();
    expect(screen.queryByText("Screenshot")).not.toBeInTheDocument();
  });

  it("shows the empty state when src is null", () => {
    render(<MediaLightbox src={null} open onOpenChange={() => {}} />);

    expect(screen.getByText("No media selected")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("clears the loading placeholder once the image loads", () => {
    render(
      <MediaLightbox src="https://example.com/shot.png" type="image" open onOpenChange={() => {}} />
    );

    expect(screen.getByText("Loading screenshot...")).toBeInTheDocument();

    fireEvent.load(screen.getByRole("img", { name: "Screenshot" }));

    expect(screen.queryByText("Loading screenshot...")).not.toBeInTheDocument();
  });

  it("shows the error placeholder when the image fails to load", () => {
    render(
      <MediaLightbox
        src="https://example.com/broken.png"
        type="image"
        open
        onOpenChange={() => {}}
      />
    );

    fireEvent.error(screen.getByRole("img", { name: "Screenshot" }));

    expect(screen.getByText("Preview unavailable")).toBeInTheDocument();
  });

  it("fires onOpenChange(false) when the dialog is dismissed via Escape", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    const onOpenChange = vi.fn();
    render(
      <MediaLightbox
        src="https://example.com/shot.png"
        type="image"
        open
        onOpenChange={onOpenChange}
      />
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
