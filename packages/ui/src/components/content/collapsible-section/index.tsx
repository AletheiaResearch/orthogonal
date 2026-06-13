"use client";

import { useId, useState } from "react";

import { ChevronDownIcon } from "../../primitives/icons";

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentId = useId();

  return (
    <div className="border-border-muted border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="text-foreground hover:bg-muted flex w-full items-center justify-between px-4 py-4 text-sm font-medium transition-colors"
      >
        <span>{title}</span>
        <ChevronDownIcon
          className={`text-secondary-foreground h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && (
        <div id={contentId} className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  );
}

export { CollapsibleSection as default };
