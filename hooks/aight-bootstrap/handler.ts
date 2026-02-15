/**
 * Aight bootstrap hook — injects AIGHT.md into agent bootstrap context
 */

import { getBootstrapContent } from "../../src/bootstrap.js";

interface HookEvent {
  type: string;
  action: string;
  sessionKey: string;
  timestamp: Date;
  messages: string[];
  context: {
    bootstrapFiles?: Array<{ basename: string; content: string }>;
    [key: string]: unknown;
  };
}

const handler = async (event: HookEvent) => {
  if (event.type !== "agent" || event.action !== "bootstrap") {
    return;
  }

  if (!event.context.bootstrapFiles) {
    event.context.bootstrapFiles = [];
  }

  event.context.bootstrapFiles.push({
    basename: "AIGHT.md",
    content: getBootstrapContent(),
  });
};

export default handler;
