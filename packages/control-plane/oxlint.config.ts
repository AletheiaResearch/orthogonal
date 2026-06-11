import worker from "@orthogonal/tooling-configs/oxlint/worker";
import { defineConfig } from "oxlint";

export default defineConfig({
  extends: [worker],
  globals: {
    WebSocketPair: "readonly",
    DurableObjectState: "readonly",
    DurableObjectStorage: "readonly",
    DurableObjectId: "readonly",
    DurableObjectNamespace: "readonly",
    ExecutionContext: "readonly",
    ScheduledEvent: "readonly",
  },
});
