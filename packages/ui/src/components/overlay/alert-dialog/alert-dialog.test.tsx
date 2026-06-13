import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./index";

function Example({ onAction, onCancel }: { onAction?: () => void; onCancel?: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger>Open</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete project</AlertDialogTitle>
          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onAction}>Confirm</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

describe("AlertDialog", () => {
  it("keeps content closed until the trigger is activated", () => {
    render(<Example />);

    expect(screen.getByText("Open")).toBeInTheDocument();
    expect(screen.queryByText("Delete project")).not.toBeInTheDocument();
  });

  it("opens and shows the title and description on trigger click", async () => {
    const user = userEvent.setup();
    render(<Example />);

    await user.click(screen.getByText("Open"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("Delete project")).toBeInTheDocument();
    expect(screen.getByText("This action cannot be undone.")).toBeInTheDocument();
  });

  it("fires the action callback and closes when the action button is clicked", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Example onAction={onAction} />);

    await user.click(screen.getByText("Open"));
    await user.click(await screen.findByText("Confirm"));

    expect(onAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("fires the cancel callback and closes when the cancel button is clicked", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<Example onCancel={onCancel} />);

    await user.click(screen.getByText("Open"));
    await user.click(await screen.findByText("Cancel"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("respects the controlled open prop", () => {
    render(
      <AlertDialog open>
        <AlertDialogContent>
          <AlertDialogTitle>Controlled</AlertDialogTitle>
          <AlertDialogDescription>Open from the start.</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>
    );

    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(screen.getByText("Controlled")).toBeInTheDocument();
  });

  it("forwards a custom className to the title", async () => {
    const user = userEvent.setup();
    render(
      <AlertDialog>
        <AlertDialogTrigger>Open</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogTitle className="custom-title">Heading</AlertDialogTitle>
          <AlertDialogDescription>Body</AlertDialogDescription>
        </AlertDialogContent>
      </AlertDialog>
    );

    await user.click(screen.getByText("Open"));

    expect(await screen.findByText("Heading")).toHaveClass("custom-title");
  });
});
