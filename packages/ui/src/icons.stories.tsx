import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactElement } from "react";

import {
  AppearanceIcon,
  ArchiveIcon,
  AutomationsIcon,
  BackIcon,
  BoltIcon,
  BoxIcon,
  BranchIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ClockIcon,
  CopyIcon,
  DataControlsIcon,
  EmptyCircleIcon,
  ErrorIcon,
  FileIcon,
  FolderIcon,
  GitHubIcon,
  GitPrIcon,
  GlobeIcon,
  InspectIcon,
  IntegrationsIcon,
  KeyIcon,
  KeyboardIcon,
  LinkIcon,
  ModelIcon,
  MonitorIcon,
  MoonIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  RepoIcon,
  SearchIcon,
  SendIcon,
  SettingsIcon,
  SidebarIcon,
  SlackIcon,
  SparkleIcon,
  StopIcon,
  SunIcon,
  TerminalIcon,
} from "./icons";

type IconComponent = (props: { className?: string }) => ReactElement;

const ALL_ICONS: Record<string, [string, IconComponent][]> = {
  "Navigation & Layout": [
    ["SidebarIcon", SidebarIcon],
    ["BackIcon", BackIcon],
    ["ChevronDownIcon", ChevronDownIcon],
    ["ChevronUpIcon", ChevronUpIcon],
    ["ChevronRightIcon", ChevronRightIcon],
    ["SettingsIcon", SettingsIcon],
  ],
  Actions: [
    ["PlusIcon", PlusIcon],
    ["CheckIcon", CheckIcon],
    ["CopyIcon", CopyIcon],
    ["SendIcon", SendIcon],
    ["StopIcon", StopIcon],
    ["SearchIcon", SearchIcon],
    ["LinkIcon", LinkIcon],
    ["SlackIcon", SlackIcon],
    ["ArchiveIcon", ArchiveIcon],
    ["MoreIcon", MoreIcon],
  ],
  "Status & Info": [
    ["ClockIcon", ClockIcon],
    ["CheckCircleIcon", CheckCircleIcon],
    ["EmptyCircleIcon", EmptyCircleIcon],
    ["ErrorIcon", ErrorIcon],
    ["SparkleIcon", SparkleIcon],
  ],
  "Git & GitHub": [
    ["GitHubIcon", GitHubIcon],
    ["GitPrIcon", GitPrIcon],
  ],
  "Content & Files": [
    ["InspectIcon", InspectIcon],
    ["RepoIcon", RepoIcon],
    ["ModelIcon", ModelIcon],
    ["BranchIcon", BranchIcon],
    ["FileIcon", FileIcon],
    ["PencilIcon", PencilIcon],
    ["TerminalIcon", TerminalIcon],
    ["BoltIcon", BoltIcon],
    ["GlobeIcon", GlobeIcon],
    ["FolderIcon", FolderIcon],
    ["BoxIcon", BoxIcon],
    ["RefreshIcon", RefreshIcon],
  ],
  Appearance: [
    ["SunIcon", SunIcon],
    ["MoonIcon", MoonIcon],
    ["MonitorIcon", MonitorIcon],
    ["AppearanceIcon", AppearanceIcon],
  ],
  "Settings Nav": [
    ["KeyIcon", KeyIcon],
    ["KeyboardIcon", KeyboardIcon],
    ["DataControlsIcon", DataControlsIcon],
    ["AutomationsIcon", AutomationsIcon],
    ["IntegrationsIcon", IntegrationsIcon],
  ],
};

function IconCell({
  name,
  Icon,
  className,
}: {
  name: string;
  Icon: IconComponent;
  className: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: 12,
        borderRadius: 8,
        border: "1px solid rgba(127,127,127,0.2)",
        minWidth: 96,
      }}
    >
      <Icon className={className} />
      <code style={{ fontSize: 11, opacity: 0.7 }}>{name}</code>
    </div>
  );
}

function IconGrid({
  entries,
  className,
}: {
  entries: [string, IconComponent][];
  className: string;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, color: "currentColor" }}>
      {entries.map(([name, Icon]) => (
        <IconCell key={name} name={name} Icon={Icon} className={className} />
      ))}
    </div>
  );
}

/**
 * Gallery wrapper used purely so Storybook has a single component to attach
 * argTypes/controls to. The real exports are the individual `*Icon` functions.
 */
function IconGallery({ size = 24, color = "currentColor" }: { size?: number; color?: string }) {
  const className = "oi-icon-preview";
  const sizePx = `${size}px`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, color }}>
      <style>{`.oi-icon-preview { width: ${sizePx}; height: ${sizePx}; }`}</style>
      {Object.entries(ALL_ICONS).map(([group, entries]) => (
        <section key={group} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, margin: 0, opacity: 0.6 }}>{group}</h3>
          <IconGrid entries={entries} className={className} />
        </section>
      ))}
    </div>
  );
}

const meta = {
  title: "UI/icons",
  component: IconGallery,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A set of stroke- and fill-based SVG icon components. Each icon takes a `className` (sizing/coloring via Tailwind utilities) and inherits color through `currentColor`, so it matches surrounding text. Use these anywhere a small inline glyph is needed; a few (ClockIcon, BoltIcon, FolderIcon) also spread extra SVG props such as `aria-hidden`.",
      },
    },
  },
  argTypes: {
    size: {
      description:
        "Rendered width/height of each icon in pixels (applied via the preview className).",
      control: { type: "range", min: 12, max: 64, step: 2 },
    },
    color: {
      description:
        "CSS color applied to the surrounding container; icons inherit it through `currentColor`.",
      control: { type: "color" },
    },
  },
  args: {
    size: 24,
    color: "currentColor",
  },
} satisfies Meta<typeof IconGallery>;

export default meta;
type Story = StoryObj<typeof IconGallery>;

/** The full icon set, grouped by category, at the default 24px size. */
export const AllIcons: Story = {
  parameters: {
    docs: { description: { story: "Every exported icon, organized by category." } },
  },
};

/** Larger rendering to inspect stroke detail and alignment. */
export const Large: Story = {
  args: { size: 48 },
  parameters: {
    docs: { description: { story: "Icons scaled up to 48px to review stroke weight and detail." } },
  },
};

/** Icons inherit color from the container via currentColor. */
export const Colored: Story = {
  args: { size: 32, color: "#6366f1" },
  parameters: {
    docs: {
      description: {
        story: "Setting a color on the parent recolors every icon, since they use `currentColor`.",
      },
    },
  },
};

/** A single representative icon, to demonstrate the simple per-icon API. */
export const SingleIcon: Story = {
  render: () => (
    <div style={{ color: "currentColor" }}>
      <GitHubIcon className="oi-single-icon" />
      <style>{`.oi-single-icon { width: 40px; height: 40px; }`}</style>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Each icon is an independent export; here `GitHubIcon` is rendered with just a className.",
      },
    },
  },
};
