import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  BoltIcon,
  ChevronDownIcon,
  ClockIcon,
  FolderIcon,
  GitHubIcon,
  PlusIcon,
  SlackIcon,
} from "./index";

describe("icons", () => {
  it("renders an svg element", () => {
    const { container } = render(<PlusIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.tagName.toLowerCase()).toBe("svg");
  });

  it("forwards className onto the svg", () => {
    const { container } = render(<ChevronDownIcon className="size-4 text-red-500" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveClass("size-4");
    expect(svg).toHaveClass("text-red-500");
  });

  it("renders the icon's vector paths", () => {
    const { container } = render(<PlusIcon />);
    // PlusIcon draws a single plus stroke path
    const path = container.querySelector("path");
    expect(path).toHaveAttribute("d", "M12 4v16m8-8H4");
  });

  it("uses currentColor so it inherits text color", () => {
    const { container } = render(<ChevronDownIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("stroke", "currentColor");
  });

  it("renders filled icons with a fill of currentColor", () => {
    const { container } = render(<GitHubIcon />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("fill", "currentColor");
  });

  it("exposes a stable data-testid on SlackIcon", () => {
    const { getByTestId } = render(<SlackIcon />);
    expect(getByTestId("slack-icon")).toBeInTheDocument();
  });

  it("spreads extra props (e.g. aria-hidden) onto icons that accept them", () => {
    const { container } = render(<ClockIcon aria-hidden="true" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
  });

  it("spreads extra props onto BoltIcon and FolderIcon", () => {
    const bolt = render(<BoltIcon aria-hidden="true" />);
    expect(bolt.container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const folder = render(<FolderIcon aria-hidden="true" />);
    expect(folder.container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("renders multiple primitives inside a composite icon", () => {
    const { container } = render(<ClockIcon />);
    // ClockIcon is a circle outline plus the hands path
    expect(container.querySelector("circle")).toBeInTheDocument();
    expect(container.querySelector("path")).toBeInTheDocument();
  });
});
