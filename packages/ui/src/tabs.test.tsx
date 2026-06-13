import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";
import { beforeAll, describe, expect, it } from "vitest";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

beforeAll(() => {
  // Radix tabs roving focus relies on browser APIs jsdom does not implement.
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
});

function renderTabs(defaultValue = "account") {
  return render(
    <Tabs defaultValue={defaultValue}>
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">Account panel</TabsContent>
      <TabsContent value="password">Password panel</TabsContent>
    </Tabs>
  );
}

describe("Tabs", () => {
  it("renders triggers and shows only the default tab's content", () => {
    renderTabs();

    expect(screen.getByRole("tab", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Password" })).toBeInTheDocument();
    expect(screen.getByText("Account panel")).toBeInTheDocument();
    expect(screen.queryByText("Password panel")).not.toBeInTheDocument();
  });

  it("marks the active trigger via aria-selected and data-state", () => {
    renderTabs();

    const account = screen.getByRole("tab", { name: "Account" });
    const password = screen.getByRole("tab", { name: "Password" });

    expect(account).toHaveAttribute("aria-selected", "true");
    expect(account).toHaveAttribute("data-state", "active");
    expect(password).toHaveAttribute("aria-selected", "false");
    expect(password).toHaveAttribute("data-state", "inactive");
  });

  it("switches the visible panel when another trigger is clicked", async () => {
    const user = userEvent.setup();
    renderTabs();

    await user.click(screen.getByRole("tab", { name: "Password" }));

    expect(await screen.findByText("Password panel")).toBeInTheDocument();
    expect(screen.queryByText("Account panel")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Password" })).toHaveAttribute("data-state", "active");
  });

  it("does not activate a disabled trigger", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="one">
        <TabsList>
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two" disabled>
            Two
          </TabsTrigger>
        </TabsList>
        <TabsContent value="one">First panel</TabsContent>
        <TabsContent value="two">Second panel</TabsContent>
      </Tabs>
    );

    const disabled = screen.getByRole("tab", { name: "Two" });
    expect(disabled).toBeDisabled();

    await user.click(disabled);

    expect(screen.getByText("First panel")).toBeInTheDocument();
    expect(screen.queryByText("Second panel")).not.toBeInTheDocument();
  });

  it("supports controlled value via onValueChange", async () => {
    const user = userEvent.setup();

    function Controlled() {
      const [value, setValue] = React.useState("a");
      return (
        <Tabs value={value} onValueChange={setValue}>
          <TabsList>
            <TabsTrigger value="a">A</TabsTrigger>
            <TabsTrigger value="b">B</TabsTrigger>
          </TabsList>
          <TabsContent value="a">Panel A</TabsContent>
          <TabsContent value="b">Panel B</TabsContent>
        </Tabs>
      );
    }

    render(<Controlled />);

    expect(screen.getByText("Panel A")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "B" }));
    expect(await screen.findByText("Panel B")).toBeInTheDocument();
    expect(screen.queryByText("Panel A")).not.toBeInTheDocument();
  });

  it("merges custom className onto the list while keeping base styles", () => {
    render(
      <Tabs defaultValue="one">
        <TabsList className="custom-list">
          <TabsTrigger value="one">One</TabsTrigger>
        </TabsList>
        <TabsContent value="one">Body</TabsContent>
      </Tabs>
    );

    const list = screen.getByRole("tablist");
    expect(list).toHaveClass("custom-list");
    // Base styling from the component is preserved alongside the override.
    expect(list).toHaveClass("inline-flex");
  });
});
