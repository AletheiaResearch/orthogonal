import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./index";

const meta = {
  title: "UI/sheet",
  component: Sheet,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A slide-out panel built on Radix UI Dialog that enters from any edge of the screen. Use it for secondary tasks or supplementary content — navigation, filters, settings, or detail editing — that should overlay the page without fully replacing it like a centered modal.",
      },
    },
  },
  argTypes: {
    open: {
      description:
        "Controlled open state. When provided, the sheet becomes controlled and you must update it via onOpenChange.",
      control: "boolean",
    },
    defaultOpen: {
      description: "Initial open state when the sheet is uncontrolled.",
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
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof Sheet>;

export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "An uncontrolled sheet opened by its trigger, sliding in from the default right edge with a header, body, and footer.",
      },
    },
  },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Open sheet
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>
            Make changes to your profile here. Click save when you are done.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose className="border-border rounded-md border px-4 py-2 text-sm">
            Cancel
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const FromLeft: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A sheet that slides in from the left edge via the side='left' prop on SheetContent — common for navigation drawers.",
      },
    },
  },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Open navigation
      </SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>Navigation</SheetTitle>
          <SheetDescription>Jump to a section of the app.</SheetDescription>
        </SheetHeader>
        <nav className="mt-4 grid gap-2 text-sm">
          <a href="#" className="hover:bg-muted rounded-md px-2 py-1">
            Dashboard
          </a>
          <a href="#" className="hover:bg-muted rounded-md px-2 py-1">
            Sessions
          </a>
          <a href="#" className="hover:bg-muted rounded-md px-2 py-1">
            Settings
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  ),
};

export const FromTop: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A sheet that slides down from the top edge via side='top' — useful for banners, command bars, or announcements.",
      },
    },
  },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Open from top
      </SheetTrigger>
      <SheetContent side="top">
        <SheetHeader>
          <SheetTitle>Announcement</SheetTitle>
          <SheetDescription>A new version is available. Refresh to update.</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};

export const FromBottom: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A sheet that slides up from the bottom edge via side='bottom' — a common pattern for mobile-style action sheets.",
      },
    },
  },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Open from bottom
      </SheetTrigger>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Quick actions</SheetTitle>
          <SheetDescription>Choose what you want to do next.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose className="border-border rounded-md border px-4 py-2 text-sm">
            Dismiss
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const OpenByDefault: Story = {
  parameters: {
    docs: {
      description: {
        story: "An uncontrolled sheet that renders open on mount via the defaultOpen prop.",
      },
    },
  },
  args: {
    defaultOpen: true,
  },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Reopen sheet
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Welcome back</SheetTitle>
          <SheetDescription>This sheet opened automatically when rendered.</SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose className="border-border rounded-md border px-4 py-2 text-sm">
            Got it
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const WithForm: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A sheet wrapping a small form, showing how labelled inputs and a primary action sit in the body and footer.",
      },
    },
  },
  render: (args) => (
    <Sheet {...args}>
      <SheetTrigger className="border-border rounded-md border px-4 py-2 text-sm">
        Edit profile
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Edit profile</SheetTitle>
          <SheetDescription>Update your display name, then save your changes.</SheetDescription>
        </SheetHeader>
        <form className="grid gap-4 py-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Name</span>
            <input
              defaultValue="Ada Lovelace"
              className="border-border bg-background rounded-md border px-3 py-2"
            />
          </label>
        </form>
        <SheetFooter>
          <SheetClose className="border-border rounded-md border px-4 py-2 text-sm">
            Cancel
          </SheetClose>
          <button
            type="submit"
            className="bg-foreground text-background rounded-md px-4 py-2 text-sm"
          >
            Save changes
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  ),
};

export const Controlled: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "A fully controlled sheet whose open state is owned by the parent via open and onOpenChange. Useful when opening must be driven by external logic.",
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
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Controlled sheet</SheetTitle>
                <SheetDescription>
                  The parent component owns this sheet&apos;s open state.
                </SheetDescription>
              </SheetHeader>
              <SheetFooter>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="border-border rounded-md border px-4 py-2 text-sm"
                >
                  Close
                </button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      );
    };
    return <ControlledExample />;
  },
};
