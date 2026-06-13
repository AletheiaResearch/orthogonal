import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_WEB_PREVIEW_SANDBOX,
  WebPreview,
  WebPreviewBody,
  WebPreviewNavigation,
} from "./index";

const SRC = "https://example.test/preview";

describe("WebPreview", () => {
  it("renders the iframe pointed at the resolved src", () => {
    const { container } = render(<WebPreview src={SRC} />);

    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe).toHaveAttribute("src", SRC);
  });

  it("falls back to the src as the toolbar label when no title is given", () => {
    render(<WebPreview src={SRC} />);

    // The label text appears in the toolbar.
    expect(screen.getByText(SRC)).toBeInTheDocument();
  });

  it("uses the provided title for the toolbar label and iframe title", () => {
    const { container } = render(<WebPreview src={SRC} title="Marketing site" />);

    expect(screen.getByText("Marketing site")).toBeInTheDocument();
    expect(container.querySelector("iframe")).toHaveAttribute("title", "Marketing site");
  });

  it("renders an open-in-new-tab link targeting the src", () => {
    render(<WebPreview src={SRC} />);

    const link = screen.getByRole("link", { name: "Open in new tab" });
    expect(link).toHaveAttribute("href", SRC);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("omits the close button unless onClose is supplied", () => {
    render(<WebPreview src={SRC} />);

    expect(screen.queryByRole("button", { name: "Close preview" })).not.toBeInTheDocument();
  });

  it("renders the close button and fires onClose when clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<WebPreview src={SRC} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close preview" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("applies the default sandbox flags when none are provided", () => {
    const { container } = render(<WebPreview src={SRC} />);

    expect(container.querySelector("iframe")).toHaveAttribute(
      "sandbox",
      DEFAULT_WEB_PREVIEW_SANDBOX
    );
  });

  it("forwards custom sandbox and allow attributes", () => {
    const { container } = render(
      <WebPreview src={SRC} sandbox="allow-scripts" allow="camera; microphone" />
    );

    const iframe = container.querySelector("iframe");
    expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
    expect(iframe).toHaveAttribute("allow", "camera; microphone");
  });

  it("shows the loading overlay until the iframe loads", () => {
    const { container } = render(<WebPreview src={SRC} />);

    expect(screen.getByText("Loading preview...")).toBeInTheDocument();

    const iframe = container.querySelector("iframe")!;
    fireEvent.load(iframe);

    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
  });

  // NOTE: the error overlay (and the iframe `onError` handler that drives it) is intentionally not
  // unit-tested: <iframe> does not fire a standardized `error` event for failed loads, so the path
  // cannot be triggered in jsdom or a real browser via the element. The `errorNode` prop remains
  // available for consumers that surface load failures through other means.

  it("renders a custom loadingNode overlay in place of the default", () => {
    render(<WebPreview src={SRC} loadingNode={<span>Spinning up...</span>} />);

    expect(screen.getByText("Spinning up...")).toBeInTheDocument();
    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();
  });

  it("resets load state when the src changes", () => {
    const { container, rerender } = render(<WebPreview src={SRC} />);

    fireEvent.load(container.querySelector("iframe")!);
    expect(screen.queryByText("Loading preview...")).not.toBeInTheDocument();

    rerender(<WebPreview src="https://example.test/other" />);

    // A new src means the loading overlay should reappear.
    expect(screen.getByText("Loading preview...")).toBeInTheDocument();
  });
});

describe("WebPreviewNavigation", () => {
  it("renders children and actions", () => {
    render(
      <WebPreviewNavigation actions={<button type="button">Act</button>}>
        <span>Label</span>
      </WebPreviewNavigation>
    );

    expect(screen.getByText("Label")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
  });

  it("merges a custom className onto the toolbar", () => {
    const { container } = render(
      <WebPreviewNavigation className="custom-toolbar">
        <span>Label</span>
      </WebPreviewNavigation>
    );

    expect(container.firstChild).toHaveClass("custom-toolbar");
  });
});

describe("WebPreviewBody", () => {
  it("renders a standalone iframe with the resolved src and default sandbox", () => {
    const { container } = render(<WebPreviewBody src={SRC} title="Frame" />);

    const iframe = container.querySelector("iframe");
    expect(iframe).toHaveAttribute("src", SRC);
    expect(iframe).toHaveAttribute("title", "Frame");
    expect(iframe).toHaveAttribute("sandbox", DEFAULT_WEB_PREVIEW_SANDBOX);
  });
});
