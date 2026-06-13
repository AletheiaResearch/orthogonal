import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";

import { Combobox, type ComboboxGroup, type ComboboxOption } from "./index";

/**
 * `Combobox` is a headless, fully controlled select-with-search built from a
 * plain button trigger and a custom listbox. Unlike a native `<select>`, it
 * accepts arbitrary trigger content via `children`, supports optional inline
 * search, flat or grouped option lists, keyboard navigation (arrows, Home/End,
 * Enter, Escape), and a `maxDisplayed` cap that collapses long lists behind a
 * "type to search" hint.
 *
 * Because it is controlled, you must own the `value` in state and update it from
 * `onChange`. All stories below wrap it in a small stateful component to model
 * real usage.
 */
const FRUITS: ComboboxOption[] = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
  { value: "dragonfruit", label: "Dragonfruit" },
  { value: "elderberry", label: "Elderberry" },
];

const MODELS: ComboboxOption[] = [
  { value: "opus", label: "Claude Opus", description: "Most capable, highest latency" },
  { value: "sonnet", label: "Claude Sonnet", description: "Balanced speed and quality" },
  { value: "haiku", label: "Claude Haiku", description: "Fastest, most economical" },
];

const PRODUCE: ComboboxGroup[] = [
  {
    category: "Fruit",
    options: [
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
      { value: "cherry", label: "Cherry" },
    ],
  },
  {
    category: "Vegetable",
    options: [
      { value: "carrot", label: "Carrot" },
      { value: "daikon", label: "Daikon" },
      { value: "eggplant", label: "Eggplant" },
    ],
  },
];

const MANY: ComboboxOption[] = Array.from({ length: 40 }, (_, i) => ({
  value: `item-${i}`,
  label: `Item ${i + 1}`,
}));

const triggerClass =
  "flex w-56 items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm";

/** A controlled wrapper that owns the selected value and renders a labelled trigger. */
function ControlledCombobox({
  items,
  initialValue = "",
  placeholder = "Select an option",
  ...rest
}: {
  items: ComboboxOption[] | ComboboxGroup[];
  initialValue?: string;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  direction?: "up" | "down";
  disabled?: boolean;
  maxDisplayed?: number;
}) {
  const [value, setValue] = React.useState<string>(initialValue);
  const flat = (items as Array<ComboboxOption | ComboboxGroup>).flatMap((it) =>
    "category" in it ? it.options : [it]
  );
  const selectedLabel = flat.find((o) => o.value === value)?.label ?? placeholder;

  return (
    <Combobox
      value={value}
      onChange={(next) => setValue(String(next))}
      items={items}
      triggerClassName={triggerClass}
      {...rest}
    >
      <span className={value ? "text-foreground" : "text-muted-foreground"}>{selectedLabel}</span>
      <span aria-hidden className="text-muted-foreground ml-2">
        ▾
      </span>
    </Combobox>
  );
}

const meta = {
  title: "UI/combobox",
  component: Combobox,
  tags: ["autodocs"],
  parameters: {
    docs: {
      description: {
        component:
          "A controlled, headless select-with-search. Supports custom trigger content, optional inline filtering, flat or grouped options, full keyboard navigation, and a display cap for long lists.",
      },
    },
  },
  argTypes: {
    value: {
      description:
        "The currently selected value (controlled). Compared against each option's `value`.",
      control: false,
    },
    onChange: {
      description: "Called with the selected value when the user picks an option.",
      control: false,
    },
    items: {
      description:
        "Either a flat `ComboboxOption[]` or a `ComboboxGroup[]` (each group has a `category` label and its own `options`).",
      control: false,
    },
    children: {
      description:
        "Trigger content rendered inside the button — any node, e.g. the selected label plus a chevron.",
      control: false,
    },
    searchable: {
      description: "When true, shows a search input that filters options as you type.",
      control: "boolean",
    },
    searchPlaceholder: {
      description: "Placeholder text for the search input (only relevant when `searchable`).",
      control: "text",
    },
    filterFn: {
      description:
        "Custom predicate `(option, query) => boolean` to override the default label/description substring match.",
      control: false,
    },
    direction: {
      description: "Whether the dropdown opens below (`down`) or above (`up`) the trigger.",
      control: "inline-radio",
      options: ["down", "up"],
    },
    dropdownWidth: {
      description: "Tailwind width class applied to the dropdown panel.",
      control: "text",
    },
    prependContent: {
      description:
        "Render-prop for content shown at the top of the list, given a `select` helper to commit a value.",
      control: false,
    },
    disabled: {
      description: "Disables the trigger and prevents opening.",
      control: "boolean",
    },
    triggerClassName: {
      description: "Class names applied to the trigger button.",
      control: "text",
    },
    maxDisplayed: {
      description:
        "Caps how many options render at once; the overflow collapses into a 'Type to search N more…' hint.",
      control: "number",
    },
  },
  args: {
    searchable: false,
    searchPlaceholder: "Search...",
    direction: "down",
    disabled: false,
  },
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof Combobox>;

/** The baseline: a flat list of options with a custom labelled trigger. */
export const Default: Story = {
  parameters: {
    docs: {
      description: {
        story: "A flat option list. The trigger shows the selected label and updates as you pick.",
      },
    },
  },
  render: () => <ControlledCombobox items={FRUITS} placeholder="Pick a fruit" />,
};

/** With `searchable`, an input filters the options by label or description. */
export const Searchable: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Enables the inline search input. Typing filters options live; pressing Enter selects the active result.",
      },
    },
  },
  render: () => (
    <ControlledCombobox
      items={FRUITS}
      placeholder="Search fruit"
      searchable
      searchPlaceholder="Filter fruit..."
    />
  ),
};

/** Options can carry a secondary `description` line beneath the label. */
export const WithDescriptions: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Each option renders a `description` under its label — useful for models, plans, or settings.",
      },
    },
  },
  render: () => (
    <ControlledCombobox items={MODELS} initialValue="sonnet" placeholder="Select a model" />
  ),
};

/** Grouped options render category headers; keyboard navigation flows across groups. */
export const Grouped: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Passing a `ComboboxGroup[]` renders category headers. Arrow keys move seamlessly across group boundaries.",
      },
    },
  },
  render: () => <ControlledCombobox items={PRODUCE} placeholder="Pick produce" />,
};

/** A pre-selected value: the matching option is checked and active on open. */
export const Preselected: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "When `value` matches an option, it shows a check and becomes the active item when the list opens.",
      },
    },
  },
  render: () => <ControlledCombobox items={FRUITS} initialValue="cherry" />,
};

/** Opens upward via `direction="up"` — useful when the trigger sits near the bottom of the viewport. */
export const OpensUpward: Story = {
  parameters: {
    docs: {
      description: {
        story: '`direction="up"` floats the dropdown above the trigger.',
      },
    },
  },
  render: () => (
    <div className="flex min-h-[18rem] items-end">
      <ControlledCombobox items={FRUITS} direction="up" placeholder="Opens up" />
    </div>
  ),
};

/** `maxDisplayed` caps the rendered options and collapses the rest behind a search hint. */
export const Capped: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "`maxDisplayed={8}` renders only the first 8 of 40 items; the remainder collapse into a 'Type to search N more…' hint. Combine with `searchable` to reach the rest.",
      },
    },
  },
  render: () => (
    <ControlledCombobox items={MANY} maxDisplayed={8} searchable placeholder="40 items, capped" />
  ),
};

/** `prependContent` injects a custom row at the top of the list with a `select` helper. */
export const WithPrependedAction: Story = {
  parameters: {
    docs: {
      description: {
        story:
          "Uses the `prependContent` render-prop to add a 'Clear selection' action above the options, committing a value via the provided `select` helper.",
      },
    },
  },
  render: function PrependStory() {
    const [value, setValue] = React.useState("banana");
    const selectedLabel = FRUITS.find((o) => o.value === value)?.label ?? "None";
    return (
      <Combobox
        value={value}
        onChange={setValue}
        items={FRUITS}
        triggerClassName={triggerClass}
        prependContent={({ select }) => (
          <button
            type="button"
            onClick={() => select("")}
            className="text-muted-foreground hover:bg-muted w-full px-3 py-2 text-left text-sm"
          >
            Clear selection
          </button>
        )}
      >
        <span className="text-foreground">{selectedLabel}</span>
        <span aria-hidden className="text-muted-foreground ml-2">
          ▾
        </span>
      </Combobox>
    );
  },
};

/** A disabled combobox cannot be opened. */
export const Disabled: Story = {
  parameters: {
    docs: {
      description: {
        story: "`disabled` prevents the trigger from opening the dropdown.",
      },
    },
  },
  render: () => <ControlledCombobox items={FRUITS} disabled initialValue="apple" />,
};
