import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

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
} from "./alert-dialog";

const meta = {
  title: "UI/alert-dialog",
  component: AlertDialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A modal dialog that interrupts the user with important content and expects a deliberate response. Use it for destructive or irreversible actions (deleting, discarding, signing out) where a plain dialog could be dismissed too casually — unlike a regular dialog, it traps focus and requires an explicit Confirm or Cancel.",
      },
    },
  },
  argTypes: {
    open: {
      description:
        "Controlled open state. When provided, the dialog's visibility is driven by the parent and must be paired with onOpenChange.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Initial open state when the dialog is left uncontrolled.",
      control: "boolean",
    },
    onOpenChange: {
      description: "Called with the next open state whenever the dialog requests to open or close.",
      action: "openChange",
    },
  },
  args: {},
} satisfies Meta<typeof AlertDialog>;

export default meta;
type Story = StoryObj<typeof AlertDialog>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "The canonical destructive-confirmation flow: a trigger opens the dialog, and the footer offers a Cancel (outline) and a Confirm (primary) action.",
      },
    },
  },
  render: () => (
    <AlertDialog>
      <AlertDialogTrigger>Delete project</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the project and all of its data. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const Open: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Rendered already open via defaultOpen so the content, overlay, and footer layout are visible in docs without interaction.",
      },
    },
  },
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger>Open dialog</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Discard changes?</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved edits. Leaving now will discard them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction>Discard</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Fully controlled usage: a parent owns the open state via the open and onOpenChange props, letting you gate opening behind your own logic and react to confirmation.",
      },
    },
  },
  render: () => {
    const [open, setOpen] = React.useState(false);
    const [status, setStatus] = React.useState("idle");

    return (
      <div className="flex flex-col items-start gap-3">
        <button
          type="button"
          className="border-border border px-3 py-1.5 text-sm"
          onClick={() => setOpen(true)}
        >
          Sign out
        </button>
        <p className="text-muted-foreground text-sm">Status: {status}</p>
        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of all devices?</AlertDialogTitle>
              <AlertDialogDescription>
                You will need to sign in again on every device.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setStatus("cancelled")}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => setStatus("signed out")}>
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  },
};

export const WithoutCancel: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "An acknowledgement-only variant with a single action button — useful for terminal notices the user must read and dismiss.",
      },
    },
  },
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogTrigger>Show notice</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session expired</AlertDialogTitle>
          <AlertDialogDescription>
            Your session has ended. Please sign in again to continue.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction>Got it</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
};
