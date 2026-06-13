"use client";

import { ArrowDownIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../../../lib/utils";

/**
 * How close (in pixels) the scroll position must be to the bottom for the
 * conversation to be considered "pinned". A small slack absorbs sub-pixel
 * rounding and the jitter of fast streaming updates.
 */
const STICK_THRESHOLD_PX = 24;

interface ConversationContextValue {
  /** The scrollable viewport element, or null before mount. */
  viewportRef: React.RefObject<HTMLDivElement | null>;
  /** Whether the viewport is currently scrolled to (near) the bottom. */
  isAtBottom: boolean;
  /** Scrolls the viewport to the bottom edge. */
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

const ConversationContext = React.createContext<ConversationContextValue | null>(null);

/**
 * Read the conversation context. Throws if used outside of <Conversation>, so
 * subparts always have a viewport to operate on.
 */
function useConversation(): ConversationContextValue {
  const ctx = React.useContext(ConversationContext);
  if (!ctx) {
    throw new Error("Conversation subcomponents must be used within <Conversation>.");
  }
  return ctx;
}

function computeIsAtBottom(el: HTMLDivElement): boolean {
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distanceFromBottom <= STICK_THRESHOLD_PX;
}

interface ConversationProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * Scroll behavior used when content streams in while pinned to the bottom.
   * Defaults to "smooth"; pass "auto" for instant jumps on chatty streams.
   */
  autoScrollBehavior?: ScrollBehavior;
}

/**
 * Scrollable message container that keeps the latest content in view. While the
 * user is pinned to the bottom, new content (e.g. streaming tokens) auto-scrolls
 * into view. Once the user scrolls up, auto-scroll pauses until they return to
 * the bottom — surface <ConversationScrollButton> to let them jump back.
 *
 * Decoupled by design: it knows nothing about messages or agents. Render
 * <ConversationContent> with whatever children you like.
 */
const Conversation = React.forwardRef<HTMLDivElement, ConversationProps>(
  ({ className, children, autoScrollBehavior = "smooth", ...props }, forwardedRef) => {
    const viewportRef = React.useRef<HTMLDivElement | null>(null);
    const [isAtBottom, setIsAtBottom] = React.useState(true);
    // Tracks intent across renders so streaming content only sticks while pinned.
    const pinnedRef = React.useRef(true);

    // Bridge the forwarded ref to the internal viewport ref.
    const setRefs = React.useCallback(
      (node: HTMLDivElement | null) => {
        viewportRef.current = node;
        if (typeof forwardedRef === "function") {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef]
    );

    const scrollToBottom = React.useCallback((behavior: ScrollBehavior = "smooth") => {
      const el = viewportRef.current;
      if (!el) return;
      pinnedRef.current = true;
      setIsAtBottom(true);
      el.scrollTo({ top: el.scrollHeight, behavior });
    }, []);

    const handleScroll = React.useCallback(() => {
      const el = viewportRef.current;
      if (!el) return;
      const atBottom = computeIsAtBottom(el);
      pinnedRef.current = atBottom;
      setIsAtBottom(atBottom);
    }, []);

    // Re-stick to the bottom whenever content grows, but only if the user
    // hasn't scrolled away. ResizeObserver fires on the inner content's growth.
    React.useEffect(() => {
      const el = viewportRef.current;
      if (!el) return;

      // Establish the initial pinned state on mount.
      setIsAtBottom(computeIsAtBottom(el));

      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(() => {
        if (pinnedRef.current && viewportRef.current) {
          viewportRef.current.scrollTo({
            top: viewportRef.current.scrollHeight,
            behavior: autoScrollBehavior,
          });
        }
      });
      // Observe the viewport itself plus its first child (the content column),
      // so both container resizes and content growth re-trigger the stick.
      observer.observe(el);
      const content = el.firstElementChild;
      if (content) observer.observe(content);
      return () => observer.disconnect();
    }, [autoScrollBehavior]);

    const contextValue = React.useMemo<ConversationContextValue>(
      () => ({ viewportRef, isAtBottom, scrollToBottom }),
      [isAtBottom, scrollToBottom]
    );

    return (
      <ConversationContext.Provider value={contextValue}>
        <div
          ref={setRefs}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          onScroll={handleScroll}
          className={cn("bg-background text-foreground relative flex-1 overflow-y-auto", className)}
          {...props}
        >
          {children}
        </div>
      </ConversationContext.Provider>
    );
  }
);
Conversation.displayName = "Conversation";

type ConversationContentProps = React.HTMLAttributes<HTMLDivElement>;

/**
 * Padded vertical column for conversation children. Renders inside
 * <Conversation> as the first child so the auto-scroll observer can track its
 * height as content streams in.
 */
const ConversationContent = React.forwardRef<HTMLDivElement, ConversationContentProps>(
  ({ className, children, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col gap-4 p-4", className)} {...props}>
      {children}
    </div>
  )
);
ConversationContent.displayName = "ConversationContent";

interface ConversationScrollButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label for the button. Defaults to "Scroll to bottom". */
  label?: string;
}

/**
 * Floating control that appears only when the conversation is scrolled away from
 * the bottom. Clicking it smooth-scrolls back to the latest content and re-arms
 * auto-stick. Renders nothing while the conversation is pinned to the bottom.
 */
const ConversationScrollButton = React.forwardRef<HTMLButtonElement, ConversationScrollButtonProps>(
  ({ className, label = "Scroll to bottom", onClick, ...props }, ref) => {
    const { isAtBottom, scrollToBottom } = useConversation();

    if (isAtBottom) return null;

    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        onClick={(event) => {
          scrollToBottom("smooth");
          onClick?.(event);
        }}
        className={cn(
          "absolute bottom-4 left-1/2 z-10 flex h-9 w-9 -translate-x-1/2 items-center justify-center",
          "border-border bg-background text-muted-foreground rounded-full border shadow-md",
          "hover:bg-accent hover:text-accent-foreground transition-colors",
          "focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          className
        )}
        {...props}
      >
        <ArrowDownIcon className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }
);
ConversationScrollButton.displayName = "ConversationScrollButton";

export { Conversation, ConversationContent, ConversationScrollButton };

export { Conversation as default };
