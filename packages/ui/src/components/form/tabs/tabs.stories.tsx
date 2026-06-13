import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./index";

/**
 * `Tabs` organizes content into multiple panels where only one is visible at a
 * time, built on Radix UI's tabs primitive. Use it to group related views
 * behind a single, space-efficient surface — settings sections, detail panes,
 * or alternating data representations.
 *
 * It is a compound component: compose `Tabs` (the root) with `TabsList`
 * wrapping one `TabsTrigger` per tab, and a matching `TabsContent` (keyed by
 * `value`) for each panel.
 */
const meta = {
  title: "UI/tabs",
  component: Tabs,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "Switch between mutually exclusive content panels behind a single surface, built on Radix UI. Compose `Tabs` with `TabsList`/`TabsTrigger` and a `TabsContent` per panel, matched by `value`.",
      },
    },
  },
  argTypes: {
    defaultValue: {
      description:
        "The `value` of the tab selected on first mount when the component is uncontrolled.",
      control: "text",
    },
    value: {
      description:
        "Controlled selected tab `value`. When provided, the component becomes controlled and you must update it via `onValueChange`.",
      control: "text",
    },
    orientation: {
      description: "Layout and keyboard-navigation orientation of the tab list.",
      control: "radio",
      options: ["horizontal", "vertical"],
    },
    onValueChange: {
      description: "Callback fired whenever the selected tab changes.",
      action: "valueChange",
    },
  },
  args: {
    defaultValue: "account",
  },
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof Tabs>;

/**
 * The default, uncontrolled tabs with two panels. The first tab is selected via
 * `defaultValue`; clicking another trigger swaps the visible panel.
 */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "Baseline uncontrolled tabs with the initial panel chosen by `defaultValue`.",
      },
    },
  },
  render: (args) => (
    <Tabs {...args} className="w-80">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <p className="text-muted-foreground text-sm">Make changes to your account here.</p>
      </TabsContent>
      <TabsContent value="password">
        <p className="text-muted-foreground text-sm">Change your password here.</p>
      </TabsContent>
    </Tabs>
  ),
};

/**
 * Demonstrates three tabs, useful for documenting how the underline indicator
 * tracks the active trigger across a longer list.
 */
export const ThreeTabs: Story = {
  args: { defaultValue: "overview" },
  parameters: {
    docs: {
      description: {
        story: "A wider tab set with three triggers and panels.",
      },
    },
  },
  render: (args) => (
    <Tabs {...args} className="w-96">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="settings">Settings</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <p className="text-muted-foreground text-sm">A summary of the project.</p>
      </TabsContent>
      <TabsContent value="activity">
        <p className="text-muted-foreground text-sm">Recent events and updates.</p>
      </TabsContent>
      <TabsContent value="settings">
        <p className="text-muted-foreground text-sm">Project configuration.</p>
      </TabsContent>
    </Tabs>
  ),
};

/**
 * A tab can be disabled via the `disabled` prop on its `TabsTrigger`; it is
 * skipped by keyboard navigation and cannot be selected.
 */
export const WithDisabledTab: Story = {
  args: { defaultValue: "general" },
  parameters: {
    docs: {
      description: {
        story: "The middle trigger is disabled, showing the dimmed, non-interactive state.",
      },
    },
  },
  render: (args) => (
    <Tabs {...args} className="w-96">
      <TabsList>
        <TabsTrigger value="general">General</TabsTrigger>
        <TabsTrigger value="billing" disabled>
          Billing
        </TabsTrigger>
        <TabsTrigger value="team">Team</TabsTrigger>
      </TabsList>
      <TabsContent value="general">
        <p className="text-muted-foreground text-sm">General preferences.</p>
      </TabsContent>
      <TabsContent value="billing">
        <p className="text-muted-foreground text-sm">Billing details.</p>
      </TabsContent>
      <TabsContent value="team">
        <p className="text-muted-foreground text-sm">Team members.</p>
      </TabsContent>
    </Tabs>
  ),
};

/**
 * A fully controlled `Tabs` whose selected value lives in parent React state and
 * is reflected by an external label. Use this pattern when the active tab must
 * coordinate with other UI or be driven programmatically.
 */
export const Controlled: Story = {
  args: { defaultValue: undefined },
  parameters: {
    docs: {
      description: {
        story:
          "Controlled selection managed by parent React state with `value` and `onValueChange`.",
      },
    },
  },
  render: function ControlledStory(args) {
    const [value, setValue] = React.useState("one");
    return (
      <div className="grid w-80 gap-3">
        <p className="text-muted-foreground text-sm">
          Active tab: <span className="font-medium">{value}</span>
        </p>
        <Tabs {...args} value={value} onValueChange={setValue}>
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">
            <p className="text-muted-foreground text-sm">First panel content.</p>
          </TabsContent>
          <TabsContent value="two">
            <p className="text-muted-foreground text-sm">Second panel content.</p>
          </TabsContent>
        </Tabs>
      </div>
    );
  },
};
