import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta = {
  title: "UI/dialog",
  component: Dialog,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A modal dialog built on Radix UI that overlays the page and traps focus. Use it for focused tasks or confirmations that should interrupt the main flow, such as forms, destructive-action prompts, or detail views.",
      },
    },
  },
  argTypes: {
    open: {
      description:
        "Controlled open state. When provided, the dialog becomes controlled and you must update it via onOpenChange.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Initial open state when the dialog is uncontrolled.",
      control: "boolean",
    },
    modal: {
      description:
        "When true (default), interaction with outside elements is blocked and the rest of the page is hidden from assistive tech.",
      control: "boolean",
    },
    onOpenChange: {
      description: "Event handler called when the open state changes (opening or closing).",
      action: "openChange",
    },
  },
  args: {
    modal: true,
  },
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof Dialog>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "An uncontrolled dialog opened by its trigger, with a header, body, and footer.",
      },
    },
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Open dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Make changes to your profile here. Click save when you are done.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="border-border rounded-md border px-4 py-2 text-sm">
            Cancel
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const OpenByDefault: Story = {
  parameters: {
    docs: {
      description: {
        story: "An uncontrolled dialog that renders open on mount via the defaultOpen prop.",
      },
    },
  },
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Reopen dialog
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome back</DialogTitle>
          <DialogDescription>This dialog opened automatically when rendered.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="border-border rounded-md border px-4 py-2 text-sm">
            Got it
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const WithForm: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A dialog wrapping a small form, showing how labelled inputs and a primary action sit in the body and footer.",
      },
    },
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Edit profile
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>Update your display name, then save your changes.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 py-2">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              defaultValue="Ada Lovelace"
              className="border-border bg-background rounded-md border px-3 py-2"
            />
          </label>
        </form>
        <DialogFooter>
          <DialogClose className="border-border rounded-md border px-4 py-2 text-sm">
            Cancel
          </DialogClose>
          <button
            type="submit"
            className="bg-foreground text-background rounded-md px-4 py-2 text-sm"
          >
            Save changes
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const DestructiveConfirmation: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A confirmation prompt for an irreversible action, pairing a cancel close button with a destructive primary action.",
      },
    },
  },
  render: (args) => (
    <Dialog {...args}>
      <DialogTrigger className="border-destructive text-destructive rounded-md border px-4 py-2 text-sm">
        Delete account
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
          <DialogDescription>
            This action cannot be undone. This will permanently delete your account and remove your
            data from our servers.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose className="border-border rounded-md border px-4 py-2 text-sm">
            Cancel
          </DialogClose>
          <button
            type="button"
            className="bg-destructive text-destructive-foreground rounded-md px-4 py-2 text-sm"
          >
            Delete
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A fully controlled dialog whose open state is owned by the parent via open and onOpenChange. Useful when opening must be driven by external logic.",
      },
    },
  },
  render: () => {
    const ControlledExample = () => {
      const [open, setOpen] = useState(false);
      return (
        <div className="flex flex-col items-start gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="border-border rounded-md border px-4 py-2 text-sm"
          >
            Open from parent state
          </button>
          <span className="text-muted-foreground text-xs">State: {open ? "open" : "closed"}</span>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Controlled dialog</DialogTitle>
                <DialogDescription>
                  The parent component owns this dialog&apos;s open state.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="border-border rounded-md border px-4 py-2 text-sm"
                >
                  Close
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      );
    };
    return <ControlledExample />;
  },
};
