import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  Check,
  FileText,
  Inbox,
  Loader2,
  MessageSquare,
  Paperclip,
  Send,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  MESSAGE_ATTACHMENT_TYPES,
  formatAttachmentSize,
  validateMessageAttachment,
} from "@/lib/messaging-rules";
import { formatDateTime } from "@/lib/format";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

type DashboardMessage = Tables<"dashboard_messages">;
type Outlet = Pick<Tables<"outlets">, "id" | "name" | "code" | "status">;

const messageQueryKey = ["dashboard-messages"] as const;

export function DashboardMessages({
  mode,
  outletId,
}: {
  mode: "hq" | "outlet";
  outletId?: string;
}) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState("all");
  const [attachment, setAttachment] = useState<File | null>(null);

  const userQuery = useQuery({
    queryKey: ["dashboard-messages", "current-user"],
    queryFn: async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) throw new Error(error?.message ?? "You are not signed in");
      return data.user.id;
    },
  });
  const userId = userQuery.data;

  const messagesQuery = useQuery({
    queryKey: [...messageQueryKey, mode, outletId ?? ""],
    enabled: Boolean(userId),
    refetchInterval: 20_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const readsQuery = useQuery({
    queryKey: [...messageQueryKey, "reads", userId ?? ""],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_message_reads")
        .select("message_id, read_at")
        .eq("user_id", userId!);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const outletsQuery = useQuery({
    queryKey: ["dashboard-messages", "outlets"],
    enabled: mode === "hq",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outlets")
        .select("id, name, code, status")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as Outlet[];
    },
  });

  const outletsById = useMemo(
    () => new Map((outletsQuery.data ?? []).map((outlet) => [outlet.id, outlet])),
    [outletsQuery.data],
  );
  const readIds = useMemo(
    () => new Set((readsQuery.data ?? []).map((read) => read.message_id)),
    [readsQuery.data],
  );
  const messages = messagesQuery.data ?? [];
  const unreadMessages = messages.filter(
    (message) => message.sender_id !== userId && !readIds.has(message.id),
  );

  const markRead = useMutation({
    mutationFn: async (messageIds: string[]) => {
      if (!userId || messageIds.length === 0) return;
      const rows: TablesInsert<"dashboard_message_reads">[] = messageIds.map((messageId) => ({
        message_id: messageId,
        user_id: userId,
      }));
      const { error } = await supabase
        .from("dashboard_message_reads")
        .upsert(rows, { onConflict: "message_id,user_id" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: [...messageQueryKey, "reads", userId ?? ""] }),
    onError: (error) => toast.error(error.message),
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("You are not signed in");
      const trimmedSubject = subject.trim();
      const trimmedBody = body.trim();
      if (!trimmedSubject) throw new Error("Add a subject before sending.");
      if (!trimmedBody) throw new Error("Write a message before sending.");
      const attachmentError = validateMessageAttachment(attachment);
      if (attachmentError) throw new Error(attachmentError);

      let attachmentPath: string | null = null;
      if (attachment) {
        const safeName =
          attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120) || "attachment";
        attachmentPath = `${userId}/${crypto.randomUUID()}-${safeName}`;
        const { error } = await supabase.storage
          .from("dashboard-attachments")
          .upload(attachmentPath, attachment, {
            contentType: attachment.type || "application/octet-stream",
            upsert: false,
          });
        if (error) throw new Error(error.message);
      }

      const payload: TablesInsert<"dashboard_messages"> = {
        sender_id: userId,
        sender_outlet_id: mode === "outlet" ? (outletId ?? null) : null,
        recipient_scope:
          mode === "hq" ? (recipient === "all" ? "all_outlets" : "outlet") : "headquarters",
        target_outlet_id: mode === "hq" && recipient !== "all" ? recipient : null,
        subject: trimmedSubject,
        body: trimmedBody,
        attachment_path: attachmentPath,
        attachment_name: attachment?.name ?? null,
        attachment_size: attachment?.size ?? null,
        attachment_content_type:
          attachment?.type || (attachment ? "application/octet-stream" : null),
      };

      const { error } = await supabase.from("dashboard_messages").insert(payload);
      if (error) {
        if (attachmentPath)
          await supabase.storage.from("dashboard-attachments").remove([attachmentPath]);
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      setSubject("");
      setBody("");
      setAttachment(null);
      setRecipient("all");
      if (fileInputRef.current) fileInputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: messageQueryKey });
      toast.success("Message sent");
    },
    onError: (error) => toast.error(error.message),
  });

  const downloadAttachment = async (message: DashboardMessage) => {
    if (!message.attachment_path) return;
    const { data, error } = await supabase.storage
      .from("dashboard-attachments")
      .createSignedUrl(message.attachment_path, 300);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const title = mode === "hq" ? "HQ ↔ Outlet Messages" : "Headquarters Messages";
  const subtitle =
    mode === "hq"
      ? "Send announcements to every outlet or keep a conversation with one outlet."
      : "Keep headquarters updated and receive operational announcements for your outlet.";

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-brand p-5 text-primary-foreground shadow-glow sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm opacity-90">
              <MessageSquare className="h-4 w-4" /> {title}
            </div>
            <h2 className="mt-2 font-display text-2xl font-extrabold sm:text-3xl">
              One place to keep every outlet aligned.
            </h2>
            <p className="mt-2 max-w-2xl text-sm opacity-85">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-primary-foreground/15 px-4 py-3 backdrop-blur">
            <Inbox className="h-5 w-5" />
            <span className="text-sm font-semibold">{unreadMessages.length} unread</span>
          </div>
        </div>
      </section>

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="min-w-0 rounded-3xl">
          <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
            <div>
              <CardTitle className="font-display text-lg">Inbox</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Messages stay available to the dashboards they belong to.
              </p>
            </div>
            {unreadMessages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-xl"
                onClick={() => markRead.mutate(unreadMessages.map((message) => message.id))}
                disabled={markRead.isPending}
              >
                <Check className="h-4 w-4" /> Mark all read
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {messagesQuery.isLoading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading messages…
              </div>
            ) : messagesQuery.isError ? (
              <p className="rounded-2xl bg-destructive/10 p-4 text-sm text-destructive">
                {messagesQuery.error.message}
              </p>
            ) : messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-4 py-12 text-center">
                <Archive className="mx-auto h-8 w-8 text-muted-foreground/60" />
                <p className="mt-3 font-semibold">No messages yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your dashboard conversations will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((message) => {
                  const incoming = message.sender_id !== userId;
                  const unread = incoming && !readIds.has(message.id);
                  const outlet = message.sender_outlet_id
                    ? outletsById.get(message.sender_outlet_id)
                    : undefined;
                  const recipientLabel =
                    message.recipient_scope === "all_outlets"
                      ? "All outlets"
                      : message.recipient_scope === "outlet"
                        ? (outletsById.get(message.target_outlet_id ?? "")?.name ??
                          "Selected outlet")
                        : "Headquarters";

                  return (
                    <article
                      key={message.id}
                      className={`rounded-2xl border p-4 transition-colors ${unread ? "border-primary/40 bg-primary/5" : "border-border/60 bg-canvas"}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {unread && (
                              <Badge className="bg-primary text-primary-foreground">New</Badge>
                            )}
                            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              {incoming ? (outlet?.name ?? "Headquarters") : `To ${recipientLabel}`}
                            </span>
                          </div>
                          <h3 className="mt-1 break-words font-display font-bold">
                            {message.subject}
                          </h3>
                        </div>
                        <time
                          className="shrink-0 text-xs text-muted-foreground"
                          dateTime={message.created_at}
                        >
                          {formatDateTime(message.created_at)}
                        </time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                        {message.body}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {message.attachment_path && message.attachment_name && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => void downloadAttachment(message)}
                          >
                            <Paperclip className="h-4 w-4" />
                            <span className="max-w-48 truncate">{message.attachment_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatAttachmentSize(message.attachment_size ?? 0)}
                            </span>
                          </Button>
                        )}
                        {unread && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-xl"
                            onClick={() => markRead.mutate([message.id])}
                            disabled={markRead.isPending}
                          >
                            <Check className="h-4 w-4" /> Mark read
                          </Button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 rounded-3xl">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-lg">New message</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Attachments are private and limited to 1 MB.
            </p>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                sendMessage.mutate();
              }}
            >
              {mode === "hq" ? (
                <div className="space-y-2">
                  <Label htmlFor="message-recipient">Send to</Label>
                  <Select value={recipient} onValueChange={setRecipient}>
                    <SelectTrigger id="message-recipient" className="rounded-xl">
                      <SelectValue placeholder="Choose a recipient" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4" /> All active outlets
                        </span>
                      </SelectItem>
                      {(outletsQuery.data ?? [])
                        .filter((outlet) => outlet.status === "active")
                        .map((outlet) => (
                          <SelectItem key={outlet.id} value={outlet.id}>
                            {outlet.name} · {outlet.code}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl bg-secondary/60 px-3 py-2.5 text-sm text-secondary-foreground">
                  <ShieldCheck className="h-4 w-4 shrink-0" /> Replying to headquarters
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="message-subject">Subject</Label>
                <Input
                  id="message-subject"
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  maxLength={160}
                  placeholder="e.g. Stock update for Friday"
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="message-body">Message</Label>
                <Textarea
                  id="message-body"
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={5000}
                  placeholder="Write your update…"
                  className="min-h-32 rounded-xl"
                />
                <p className="text-right text-xs text-muted-foreground">{body.length}/5000</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="message-attachment">
                  Attachment <span className="font-normal text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  ref={fileInputRef}
                  id="message-attachment"
                  type="file"
                  accept={MESSAGE_ATTACHMENT_TYPES.join(",")}
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    const error = validateMessageAttachment(next);
                    if (error) {
                      setAttachment(null);
                      event.target.value = "";
                      toast.error(error);
                      return;
                    }
                    setAttachment(next);
                  }}
                  className="h-auto cursor-pointer rounded-xl py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:font-medium"
                />
                {attachment && (
                  <div className="flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-xs">
                    <span className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">{attachment.name}</span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatAttachmentSize(attachment.size)}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0 rounded-lg"
                      onClick={() => {
                        setAttachment(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                      aria-label="Remove attachment"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <Button
                type="submit"
                className="w-full rounded-xl"
                disabled={sendMessage.isPending || !userId}
              >
                {sendMessage.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send
                message
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
