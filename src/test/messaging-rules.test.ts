import { describe, expect, it } from "vitest";
import {
  formatAttachmentSize,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  validateMessageAttachment,
} from "@/lib/messaging-rules";

describe("dashboard messaging attachment rules", () => {
  it("allows attachments up to exactly 1 MB", () => {
    expect(
      validateMessageAttachment({ name: "brief.pdf", size: MAX_MESSAGE_ATTACHMENT_BYTES }),
    ).toBeNull();
  });

  it("rejects empty, oversized, and overly long filenames", () => {
    expect(validateMessageAttachment({ name: "empty.txt", size: 0 })).toContain("non-empty");
    expect(
      validateMessageAttachment({ name: "large.zip", size: MAX_MESSAGE_ATTACHMENT_BYTES + 1 }),
    ).toContain("1 MB");
    expect(validateMessageAttachment({ name: "x".repeat(181), size: 1 })).toContain("180");
  });

  it("formats attachment sizes for the UI", () => {
    expect(formatAttachmentSize(1024)).toBe("1.0 KB");
    expect(formatAttachmentSize(1024 * 1024)).toBe("1.0 MB");
  });
  it("rejects active HTML and SVG content before upload", () => {
    expect(
      validateMessageAttachment({ name: "message.html", size: 200, type: "text/html" }),
    ).toContain("Choose a PDF");
    expect(
      validateMessageAttachment({ name: "picture.svg", size: 200, type: "image/svg+xml" }),
    ).toContain("Choose a PDF");
    expect(
      validateMessageAttachment({ name: "brief.pdf", size: 200, type: "application/pdf" }),
    ).toBeNull();
  });
});
