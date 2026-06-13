import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Task, TaskContent, TaskItem, TaskItemFile, TaskTrigger } from "./index";

describe("Task", () => {
  it("renders a trigger header and its open content by default", () => {
    render(
      <Task>
        <TaskTrigger title="Refactor auth module" />
        <TaskContent>
          <TaskItem status="completed">Read the existing handler</TaskItem>
        </TaskContent>
      </Task>
    );

    expect(screen.getByRole("button", { name: /refactor auth module/i })).toBeInTheDocument();
    expect(screen.getByText("Read the existing handler")).toBeInTheDocument();
  });

  it("renders a header from the root `title` prop when no TaskTrigger is given", () => {
    render(
      <Task title="Plan the migration">
        <TaskContent>
          <TaskItem status="pending">Inventory the schema</TaskItem>
        </TaskContent>
      </Task>
    );

    expect(screen.getByRole("button", { name: /plan the migration/i })).toBeInTheDocument();
  });

  it("hides content when defaultOpen is false", () => {
    render(
      <Task defaultOpen={false}>
        <TaskTrigger title="Closed plan" />
        <TaskContent>
          <TaskItem status="pending">Hidden step</TaskItem>
        </TaskContent>
      </Task>
    );

    expect(screen.queryByText("Hidden step")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /closed plan/i })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("toggles content open and closed when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <Task>
        <TaskTrigger title="Build feature" />
        <TaskContent>
          <TaskItem status="in-progress">Wiring it up</TaskItem>
        </TaskContent>
      </Task>
    );

    const trigger = screen.getByRole("button", { name: /build feature/i });
    expect(screen.getByText("Wiring it up")).toBeInTheDocument();

    await user.click(trigger);
    expect(screen.queryByText("Wiring it up")).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(screen.getByText("Wiring it up")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("supports a controlled open state via open + onOpenChange", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();

    const { rerender } = render(
      <Task open={false} onOpenChange={onOpenChange}>
        <TaskTrigger title="Controlled plan" />
        <TaskContent>
          <TaskItem status="pending">Controlled step</TaskItem>
        </TaskContent>
      </Task>
    );

    // Controlled-closed: content stays hidden even though defaultOpen is true.
    expect(screen.queryByText("Controlled step")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /controlled plan/i }));

    // Parent owns state: the callback fires asking to open, but the DOM does
    // not change until the parent updates the `open` prop.
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByText("Controlled step")).not.toBeInTheDocument();

    rerender(
      <Task open={true} onOpenChange={onOpenChange}>
        <TaskTrigger title="Controlled plan" />
        <TaskContent>
          <TaskItem status="pending">Controlled step</TaskItem>
        </TaskContent>
      </Task>
    );

    expect(screen.getByText("Controlled step")).toBeInTheDocument();
  });

  it("reflects each TaskItem status via a data attribute", () => {
    render(
      <Task>
        <TaskTrigger title="Statuses" />
        <TaskContent>
          <TaskItem status="completed">Done step</TaskItem>
          <TaskItem status="in-progress">Active step</TaskItem>
          <TaskItem status="pending">Future step</TaskItem>
        </TaskContent>
      </Task>
    );

    expect(screen.getByText("Done step").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "completed"
    );
    expect(screen.getByText("Active step").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "in-progress"
    );
    expect(screen.getByText("Future step").closest("[data-status]")).toHaveAttribute(
      "data-status",
      "pending"
    );
  });

  it("shows a spinning icon for an in-progress trigger status", () => {
    const { container } = render(
      <Task>
        <TaskTrigger title="Running" status="in-progress" />
      </Task>
    );

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders a referenced-file chip inside an item", () => {
    render(
      <Task>
        <TaskTrigger title="With files" />
        <TaskContent>
          <TaskItem status="completed">
            Edited <TaskItemFile>src/index.ts</TaskItemFile>
          </TaskItem>
        </TaskContent>
      </Task>
    );

    expect(screen.getByText("src/index.ts")).toBeInTheDocument();
  });

  it("does not toggle when the trigger onClick prevents default", async () => {
    const user = userEvent.setup();
    render(
      <Task>
        <TaskTrigger title="Guarded" onClick={(event) => event.preventDefault()} />
        <TaskContent>
          <TaskItem status="pending">Still visible</TaskItem>
        </TaskContent>
      </Task>
    );

    await user.click(screen.getByRole("button", { name: /guarded/i }));
    expect(screen.getByText("Still visible")).toBeInTheDocument();
  });

  it("throws if a sub-component renders outside of a Task", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TaskTrigger title="orphan" />)).toThrow(
      /must be rendered inside a <Task>/
    );
    spy.mockRestore();
  });
});
