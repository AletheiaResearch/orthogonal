import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("scratch", () => {
  it("discriminator", () => {
    // A: img onError via React
    const imgErr = vi.fn();
    const { container: ic } = render(<img alt="" onError={imgErr} />);
    fireEvent.error(ic.querySelector("img")!);

    // iframe under test
    const onError = vi.fn();
    const { container } = render(<iframe title="t" src="https://x.test" onError={onError} />);
    const iframe = container.querySelector("iframe")!;

    // B: manual listener on iframe
    const manual = vi.fn();
    iframe.addEventListener("error", manual);
    fireEvent.error(iframe);

    // C: ErrorEvent variant via React onError on iframe
    iframe.dispatchEvent(new ErrorEvent("error"));

    // eslint-disable-next-line no-console
    console.log(
      "img-react:",
      imgErr.mock.calls.length,
      "iframe-manual:",
      manual.mock.calls.length,
      "iframe-react(fireEvent):",
      onError.mock.calls.length
    );
    expect(true).toBe(true);
  });

  it("iframe react onError via ErrorEvent only", () => {
    const onError = vi.fn();
    const { container } = render(<iframe title="t2" src="https://x.test" onError={onError} />);
    const iframe = container.querySelector("iframe")!;
    iframe.dispatchEvent(new ErrorEvent("error"));
    // eslint-disable-next-line no-console
    console.log("iframe-react(ErrorEvent):", onError.mock.calls.length);
    expect(true).toBe(true);
  });
});
