import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";

import { Source, Sources, SourcesContent, SourcesTrigger } from "./sources";

describe("Sources", () => {
  it("renders the default trigger label derived from count", () => {
    render(
      <Sources count={3}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://example.com" title="Example" />
        </SourcesContent>
      </Sources>
    );

    expect(screen.getByRole("button", { name: /used 3 sources/i })).toBeInTheDocument();
  });

  it("singularizes the label when count is 1", () => {
    render(
      <Sources count={1}>
        <SourcesTrigger />
      </Sources>
    );

    expect(screen.getByRole("button", { name: /used 1 source$/i })).toBeInTheDocument();
  });

  it("falls back to a generic label when count is omitted", () => {
    render(
      <Sources>
        <SourcesTrigger />
      </Sources>
    );

    expect(screen.getByRole("button", { name: /^sources$/i })).toBeInTheDocument();
  });

  it("is collapsed by default — content is not rendered", () => {
    render(
      <Sources count={2}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    expect(screen.queryByText("Source A")).not.toBeInTheDocument();
  });

  it("renders content when defaultOpen is true", () => {
    render(
      <Sources count={2} defaultOpen>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    expect(screen.getByText("Source A")).toBeInTheDocument();
  });

  it("expands and collapses when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Sources count={1}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    const trigger = screen.getByRole("button", { name: /used 1 source/i });
    expect(screen.queryByText("Source A")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(screen.getByText("Source A")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText("Source A")).not.toBeInTheDocument();
  });

  it("reflects open state via aria-expanded on the trigger", async () => {
    const user = userEvent.setup();
    render(
      <Sources count={1}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    const trigger = screen.getByRole("button");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("wires aria-controls/labelledby between trigger and content region", () => {
    render(
      <Sources count={1} defaultOpen>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    const trigger = screen.getByRole("button");
    const region = screen.getByRole("region");

    expect(trigger).toHaveAttribute("aria-controls", region.id);
    expect(region).toHaveAttribute("aria-labelledby", trigger.id);
  });

  it("supports controlled open state via the open prop", () => {
    const { rerender } = render(
      <Sources count={1} open={false} onOpenChange={() => {}}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    expect(screen.queryByText("Source A")).not.toBeInTheDocument();

    rerender(
      <Sources count={1} open={true} onOpenChange={() => {}}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    expect(screen.getByText("Source A")).toBeInTheDocument();
  });

  it("calls onOpenChange when the trigger is clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <Sources count={1} open={false} onOpenChange={onOpenChange}>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://a.test" title="Source A" />
        </SourcesContent>
      </Sources>
    );

    await user.click(screen.getByRole("button"));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("allows overriding the trigger label", () => {
    render(
      <Sources count={5}>
        <SourcesTrigger label="References" />
      </Sources>
    );

    expect(screen.getByRole("button", { name: /references/i })).toBeInTheDocument();
    expect(screen.queryByText(/used 5 sources/i)).not.toBeInTheDocument();
  });

  it("renders Source as a safe external link", () => {
    render(
      <Sources count={1} defaultOpen>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://example.com/article" title="The Article" />
        </SourcesContent>
      </Sources>
    );

    const link = screen.getByRole("link", { name: /the article/i });
    expect(link).toHaveAttribute("href", "https://example.com/article");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("falls back to the href when a Source has no title", () => {
    render(
      <Sources count={1} defaultOpen>
        <SourcesTrigger />
        <SourcesContent>
          <Source href="https://no-title.example" />
        </SourcesContent>
      </Sources>
    );

    expect(screen.getByRole("link", { name: /https:\/\/no-title\.example/i })).toBeInTheDocument();
  });

  it("throws when sub-components are used outside <Sources>", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<SourcesTrigger />)).toThrow(/within <Sources>/);
    spy.mockRestore();
  });
});
