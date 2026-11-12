export const MAX_MESSAGE_ATTACHMENT_BYTES = 1024 * 1024;
export const MESSAGE_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
];

export function validateMessageAttachment(
  file: (Pick<File, "name" | "size"> & Partial<Pick<File, "type">>) | null,
): string | null {
  if (!file) return null;
  if (file.size === 0) return "Choose a non-empty file.";
  if (file.size > MAX_MESSAGE_ATTACHMENT_BYTES) return "Attachments must be 1 MB or smaller.";
  if (file.name.length > 180) return "Attachment names must be 180 characters or fewer.";
  if (file.type !== undefined && !MESSAGE_ATTACHMENT_TYPES.includes(file.type))
    return "Choose a PDF, text file, JPG, PNG, WebP or GIF attachment.";
  return null;
}

export function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(bytes < 1024 * 100 ? 1 : 0)} KB`;
}
