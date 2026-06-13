import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./sheet";

beforeAll(() => {
  // Radix Dialog (the primitive behind Sheet) relies on these browser APIs
  // that jsdom does not implement.
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

function Example({
  side,
  onOpenChange,
}: {
  side?: "top" | "bottom" | "left" | "right";
  onOpenChange?: (open: boolean) => void;
} = {}) {
  return (
    <Sheet onOpenChange={onOpenChange}>
      <SheetTrigger>Open sheet</SheetTrigger>
      <SheetContent side={side}>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Make changes to your profile here.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose>Cancel</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

describe("Sheet", () => {
  it("renders the trigger and keeps content closed by default", () => {
    render(<Example />);

    expect(screen.getByRole("button", { name: "Open sheet" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Edit profile")).not.toBeInTheDocument();
  });

  it("opens the sheet and shows title and description when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));

    const sheet = await screen.findByRole("dialog");
    expect(sheet).toBeInTheDocument();
    expect(screen.getByText("Edit profile")).toBeInTheDocument();
    expect(screen.getByText("Make changes to your profile here.")).toBeInTheDocument();
  });

  it("fires onOpenChange when opening and closing", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<Example onOpenChange={onOpenChange} />);

    await user.click(screen.getByRole("button", { name: "Open sheet" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);

    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("renders as open when controlled via the open prop", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Controlled</SheetTitle>
          <SheetDescription>Always visible.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Controlled")).toBeInTheDocument();
  });

  it("applies the default right side variant classes", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Default side</SheetTitle>
          <SheetDescription>Slides in from the right.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveClass("right-0");
    expect(sheet).toHaveClass("inset-y-0");
  });

  it("applies the requested side variant classes", () => {
    render(
      <Sheet open>
        <SheetContent side="left">
          <SheetTitle>Left side</SheetTitle>
          <SheetDescription>Slides in from the left.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    const sheet = screen.getByRole("dialog");
    expect(sheet).toHaveClass("left-0");
    expect(sheet).not.toHaveClass("right-0");
  });

  it("merges a custom className onto the content", () => {
    render(
      <Sheet open>
        <SheetContent className="custom-sheet-class">
          <SheetTitle>Styled</SheetTitle>
          <SheetDescription>Has extra class.</SheetDescription>
        </SheetContent>
      </Sheet>
    );

    expect(screen.getByRole("dialog")).toHaveClass("custom-sheet-class");
  });
});
