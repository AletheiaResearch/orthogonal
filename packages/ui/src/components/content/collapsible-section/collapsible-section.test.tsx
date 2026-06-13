import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "./index";

describe("CollapsibleSection", () => {
  it("renders the title in a trigger button", () => {
    render(
      <CollapsibleSection title="Filters">
        <p>panel content</p>
      </CollapsibleSection>
    );

    expect(screen.getByRole("button", { name: /filters/i })).toBeInTheDocument();
  });

  it("shows its children by default (defaultOpen defaults to true)", () => {
    render(
      <CollapsibleSection title="Filters">
        <p>panel content</p>
      </CollapsibleSection>
    );

    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("starts collapsed when defaultOpen is false", () => {
    render(
      <CollapsibleSection title="Filters" defaultOpen={false}>
        <p>panel content</p>
      </CollapsibleSection>
    );

    expect(screen.queryByText("panel content")).not.toBeInTheDocument();
  });

  it("collapses the content when the trigger is clicked while open", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Filters">
        <p>panel content</p>
      </CollapsibleSection>
    );

    expect(screen.getByText("panel content")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /filters/i }));

    expect(screen.queryByText("panel content")).not.toBeInTheDocument();
  });

  it("expands the content when the trigger is clicked while closed", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Filters" defaultOpen={false}>
        <p>panel content</p>
      </CollapsibleSection>
    );

    expect(screen.queryByText("panel content")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /filters/i }));

    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("toggles back and forth across repeated clicks", async () => {
    const user = userEvent.setup();
    render(
      <CollapsibleSection title="Filters">
        <p>panel content</p>
      </CollapsibleSection>
    );

    const trigger = screen.getByRole("button", { name: /filters/i });

    await user.click(trigger); // close
    expect(screen.queryByText("panel content")).not.toBeInTheDocument();

    await user.click(trigger); // open again
    expect(screen.getByText("panel content")).toBeInTheDocument();
  });

  it("renders complex react node children", () => {
    render(
      <CollapsibleSection title="Advanced">
        <button type="button">Nested action</button>
      </CollapsibleSection>
    );

    expect(screen.getByRole("button", { name: "Nested action" })).toBeInTheDocument();
  });
});
