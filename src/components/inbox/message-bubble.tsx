"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageReaction } from "@/types";
import {
  Clock,
  Check,
  CheckCheck,
  XCircle,
  FileText,
  MapPin,
  LayoutTemplate,
  ImageOff,
  CornerDownLeft,
  Megaphone,
  ExternalLink,
  Download,
  ListFilter,
} from "lucide-react";
import { format } from "date-fns";
import { ReplyQuote } from "./reply-quote";
import { MessageReactions } from "./message-reactions";
import {
  resolveInteractiveOptions,
  type InteractivePromptMetadata,
} from "@/lib/whatsapp/interactive-prompts";

interface MessageBubbleProps {
  message: Message;
  /** Pre-computed quote info for messages that reply to another. */
  reply?: { authorLabel: string; preview: string } | null;
  reactions?: MessageReaction[];
  currentUserId?: string;
  onToggleReaction?: (emoji: string) => void;
}

function StatusIcon({ status }: { status: Message["status"] }) {
  switch (status) {
    case "sending":
      return <Clock className="h-3 w-3 text-muted-foreground" />;
    case "sent":
      return <Check className="h-3 w-3 text-muted-foreground" />;
    case "delivered":
      return <CheckCheck className="h-3 w-3 text-muted-foreground" />;
    case "read":
      return <CheckCheck className="h-3 w-3 text-blue-400" />;
    case "failed":
      return <XCircle className="h-3 w-3 text-red-400" />;
    default:
      return null;
  }
}

function MediaUnavailable({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <ImageOff className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{label} unavailable</span>
    </div>
  );
}

function resolveMediaUrl(url: string): { fetchUrl: string; isProxy: boolean } {
  if (!url) return { fetchUrl: "", isProxy: false };
  const trimmed = url.trim();
  if (trimmed.startsWith("/api/whatsapp/media/")) {
    return { fetchUrl: trimmed, isProxy: true };
  }
  if (trimmed.includes("/api/whatsapp/media/")) {
    const after = trimmed.split("/api/whatsapp/media/")[1];
    return { fetchUrl: `/api/whatsapp/media/${after}`, isProxy: true };
  }
  // Pure digits = Meta media ID directly stored
  if (/^\d+$/.test(trimmed)) {
    return { fetchUrl: `/api/whatsapp/media/${trimmed}`, isProxy: true };
  }
  // Lookaside URL with mid query parameter
  const midMatch = trimmed.match(/[?&]mid=(\d+)/);
  if (midMatch) {
    return { fetchUrl: `/api/whatsapp/media/${midMatch[1]}`, isProxy: true };
  }
  return { fetchUrl: trimmed, isProxy: false };
}

function MediaImage({ url, alt }: { url: string; alt: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [loading, setLoading] = useState(true);

  const { fetchUrl, isProxy } = useMemo(() => resolveMediaUrl(url), [url]);

  const loadImage = useCallback(async () => {
    if (!fetchUrl) return;

    // Proxy URLs need auth fetch to create blob URL
    if (isProxy) {
      try {
        const res = await fetch(fetchUrl);
        if (res.status === 410) {
          setIsExpired(true);
          setError(true);
          return;
        }
        if (!res.ok) throw new Error(`Failed to load media: ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch (e) {
        console.error("[MediaImage] failed to load media image:", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(fetchUrl);
      setLoading(false);
    }
  }, [fetchUrl, isProxy]);

  useEffect(() => {
    loadImage();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadImage]);

  if (error) {
    if (isExpired) {
      return (
        <div className="flex h-32 w-56 flex-col items-center justify-center gap-1.5 rounded-lg bg-muted/60 p-3 text-center border border-border/40">
          <ImageOff className="h-6 w-6 text-muted-foreground/60" />
          <span className="text-xs font-medium text-foreground">Media expired</span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            Attachment expired on Meta servers (WhatsApp retains temporary media for ~30 days)
          </span>
        </div>
      );
    }

    return (
      <div className="flex h-40 w-60 flex-col items-center justify-center gap-1.5 rounded-lg bg-muted p-2 text-center">
        <ImageOff className="h-8 w-8 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Image preview failed</span>
        <div className="flex items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => {
              setError(false);
              setLoading(true);
              loadImage();
            }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
          {fetchUrl && (
            <a
              href={fetchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:underline"
            >
              Open link
            </a>
          )}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="group relative max-h-64 max-w-60 overflow-hidden rounded-lg">
      <img
        src={src ?? ""}
        alt={alt}
        className="max-h-64 max-w-60 rounded-lg object-cover cursor-pointer transition-transform hover:scale-[1.01]"
        onClick={() => {
          if (src) window.open(src, "_blank");
        }}
        onError={() => setError(true)}
      />
      {src && (
        <a
          href={src}
          download="whatsapp-image"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100 shadow-sm"
          title="Download image"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      )}
    </div>
  );
}

function InteractiveOptionsList({
  meta,
  onPrimary,
}: {
  meta: InteractivePromptMetadata;
  onPrimary: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-2.5 flex flex-col gap-1.5 border-t pt-2",
        onPrimary ? "border-primary-foreground/20" : "border-border/40"
      )}
    >
      {meta.button_label && (
        <div
          className={cn(
            "flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase",
            onPrimary ? "text-primary-foreground/90" : "text-muted-foreground"
          )}
        >
          <ListFilter className="h-3.5 w-3.5" />
          <span>{meta.button_label}</span>
          <span className="text-[10px] font-normal opacity-75">
            ({meta.options.length} options)
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        {meta.options.map((opt) => (
          <div
            key={opt.id || opt.title}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-all shadow-sm",
              onPrimary
                ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20"
                : "border-border/60 bg-background/80 text-foreground hover:bg-muted"
            )}
            title={opt.description || opt.title}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                onPrimary ? "bg-primary-foreground/70" : "bg-primary"
              )}
            />
            <span className="truncate max-w-[220px]">{opt.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MediaVideo({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const { fetchUrl, isProxy } = useMemo(() => resolveMediaUrl(url), [url]);

  const loadVideo = useCallback(async () => {
    if (!fetchUrl) return;
    if (isProxy) {
      try {
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Failed to load video: ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch (e) {
        console.error("[MediaVideo] failed to load media video:", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(fetchUrl);
      setLoading(false);
    }
  }, [fetchUrl, isProxy]);

  useEffect(() => {
    loadVideo();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadVideo]);

  if (error) {
    return <MediaUnavailable label="Video" />;
  }

  if (loading) {
    return (
      <div className="flex h-40 w-60 items-center justify-center rounded-lg bg-muted">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <video
      src={src ?? ""}
      controls
      className="max-h-64 max-w-60 rounded-lg"
    />
  );
}

function MediaAudio({ url }: { url: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const { fetchUrl, isProxy } = useMemo(() => resolveMediaUrl(url), [url]);

  const loadAudio = useCallback(async () => {
    if (!fetchUrl) return;
    if (isProxy) {
      try {
        const res = await fetch(fetchUrl);
        if (!res.ok) throw new Error(`Failed to load audio: ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      } catch (e) {
        console.error("[MediaAudio] failed to load media audio:", e);
        setError(true);
      } finally {
        setLoading(false);
      }
    } else {
      setSrc(fetchUrl);
      setLoading(false);
    }
  }, [fetchUrl, isProxy]);

  useEffect(() => {
    loadAudio();
    return () => {
      if (src?.startsWith("blob:")) {
        URL.revokeObjectURL(src);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadAudio]);

  if (error) {
    return <MediaUnavailable label="Audio" />;
  }

  if (loading) {
    return (
      <div className="flex h-12 w-48 items-center justify-center rounded-lg bg-muted">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return <audio src={src ?? ""} controls className="max-w-60" />;
}

function MessageContent({ message }: { message: Message }) {
  const isOutbound = message.sender_type === "agent" || message.sender_type === "bot";
  const interactiveMeta = resolveInteractiveOptions(message);

  switch (message.content_type) {
    case "text": {
      if (
        message.content_text?.includes("[Unsupported message type: button]") ||
        message.content_text === "[Button reply]"
      ) {
        return (
          <div className="flex flex-col gap-0.5">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
                isOutbound ? "opacity-80" : "text-muted-foreground"
              )}
            >
              <CornerDownLeft className="h-3 w-3" />
              Button reply
            </span>
            <p className="whitespace-pre-wrap break-words text-sm font-medium">
              {message.content_text.replace(/\[Unsupported message type: button\]/g, "").trim() ||
                "Quick reply selected"}
            </p>
          </div>
        );
      }

      return (
        <div className="flex flex-col">
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.content_text}
          </p>
          {interactiveMeta && (
            <InteractiveOptionsList
              meta={interactiveMeta}
              onPrimary={isOutbound}
            />
          )}
        </div>
      );
    }

    case "image":
      return (
        <div>
          {message.media_url ? (
            <MediaImage url={message.media_url} alt="Shared image" />
          ) : (
            <MediaUnavailable label="Image" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "video":
      return (
        <div>
          {message.media_url ? (
            <MediaVideo url={message.media_url} />
          ) : (
            <MediaUnavailable label="Video" />
          )}
          {message.content_text && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">
              {message.content_text}
            </p>
          )}
        </div>
      );

    case "audio":
      return (
        <div>
          {message.media_url ? (
            <MediaAudio url={message.media_url} />
          ) : (
            <MediaUnavailable label="Audio" />
          )}
        </div>
      );

    case "document": {
      if (!message.media_url) {
        return <MediaUnavailable label={message.content_text || "Document"} />;
      }
      const { fetchUrl } = resolveMediaUrl(message.media_url);
      const filename = message.content_text || "Document";
      const isPdf = /\.pdf$/i.test(filename) || filename.toLowerCase().includes("pdf");

      return (
        <div className="flex flex-col gap-1.5 min-w-[200px]">
          <a
            href={fetchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "group flex items-center justify-between gap-3 rounded-xl border p-2.5 text-sm transition-all shadow-sm",
              isOutbound
                ? "border-primary-foreground/30 bg-primary-foreground/10 hover:bg-primary-foreground/20 text-primary-foreground"
                : "border-border/60 bg-background/80 hover:bg-muted text-foreground"
            )}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold uppercase",
                  isPdf
                    ? isOutbound
                      ? "bg-red-400/20 text-red-200 border border-red-300/30"
                      : "bg-red-500/10 text-red-600 border border-red-500/20"
                    : isOutbound
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-primary/10 text-primary border border-primary/20"
                )}
              >
                {isPdf ? "PDF" : <FileText className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">
                  {filename}
                </p>
                <span
                  className={cn(
                    "text-[10px] block opacity-75",
                    isOutbound ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  Click to open / download
                </span>
              </div>
            </div>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70 group-hover:opacity-100" />
          </a>
        </div>
      );
    }

    case "template":
      return (
        <div className="flex flex-col">
          <span
            className={cn(
              "mb-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium w-fit",
              isOutbound
                ? "bg-primary-foreground/20 text-primary-foreground"
                : "bg-primary/20 text-primary"
            )}
          >
            <LayoutTemplate className="h-3 w-3" />
            {message.template_name ? `Template: ${message.template_name}` : "Template"}
          </span>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm">
            {message.content_text ||
              (message.template_name
                ? `Automated template (${message.template_name})`
                : "Automated message sent")}
          </p>
          {interactiveMeta && (
            <InteractiveOptionsList
              meta={interactiveMeta}
              onPrimary={isOutbound}
            />
          )}
        </div>
      );

    case "location":
      return (
        <div className="flex items-center gap-2 text-sm">
          <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span>{message.content_text || "Location shared"}</span>
        </div>
      );

    case "interactive": {
      return (
        <div className="flex flex-col gap-0.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide",
              isOutbound ? "opacity-80" : "text-muted-foreground"
            )}
          >
            {isOutbound ? (
              <>
                <LayoutTemplate className="h-3 w-3" />
                Interactive Prompt
              </>
            ) : (
              <>
                <CornerDownLeft className="h-3 w-3" />
                Button reply
              </>
            )}
          </span>
          <p className="whitespace-pre-wrap break-words text-sm">
            {message.content_text || (isOutbound ? "[Interactive prompt]" : "[Button tapped]")}
          </p>
          {isOutbound && interactiveMeta && (
            <InteractiveOptionsList
              meta={interactiveMeta}
              onPrimary={isOutbound}
            />
          )}
        </div>
      );
    }

    default:
      if (
        message.content_text?.includes("[Unsupported message type: button]") ||
        message.content_text === "[Button reply]"
      ) {
        return (
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <CornerDownLeft className="h-3 w-3" />
              Button reply
            </span>
            <p className="text-sm font-medium">
              Quick reply selected
            </p>
          </div>
        );
      }
      return (
        <p className="whitespace-pre-wrap break-words text-sm">
          {message.content_text || "[Unsupported message type]"}
        </p>
      );
  }
}

function AdReferralCard({ referral }: { referral: NonNullable<Message["referral_data"]> }) {
  return (
    <div className="mb-2 max-w-sm overflow-hidden rounded-xl border border-primary/20 bg-background/70 p-2.5 text-xs text-foreground shadow-sm">
      <div className="flex items-center justify-between gap-1 border-b border-border/40 pb-1.5">
        <div className="flex items-center gap-1.5 font-semibold text-primary text-[11px]">
          <Megaphone className="h-3.5 w-3.5" />
          <span>Meta Ad Referral</span>
        </div>
        {referral.source_url && (
          <a
            href={referral.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary hover:underline"
          >
            <span>View Ad</span>
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {(referral.image_url || referral.thumbnail_url) && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border/30">
          <img
            src={referral.image_url || referral.thumbnail_url}
            alt={referral.headline || "Ad media"}
            className="max-h-36 w-full object-cover"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
        </div>
      )}

      {referral.headline && (
        <p className="mt-1.5 font-semibold text-foreground text-xs leading-snug">
          {referral.headline}
        </p>
      )}

      {referral.body && (
        <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
          {referral.body}
        </p>
      )}

      {(referral.campaign_name || referral.ad_name) && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-border/30 pt-1.5 text-[10px] text-muted-foreground">
          {referral.campaign_name && (
            <span
              className="rounded bg-muted px-1.5 py-0.5 font-medium truncate max-w-[200px]"
              title={`Campaign: ${referral.campaign_name}`}
            >
              Camp: {referral.campaign_name}
            </span>
          )}
          {referral.ad_name && (
            <span
              className="rounded bg-muted px-1.5 py-0.5 font-medium truncate max-w-[200px]"
              title={`Ad: ${referral.ad_name}`}
            >
              Ad: {referral.ad_name}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function MessageBubble({
  message,
  reply,
  reactions,
  currentUserId,
  onToggleReaction,
}: MessageBubbleProps) {
  const isAgent = message.sender_type === "agent" || message.sender_type === "bot";
  const time = format(new Date(message.created_at), "HH:mm");

  // Row alignment + width cap are owned by <MessageActions> so its hover
  // group matches the bubble's content area, not the full row.
  return (
    <div
      className={cn(
        "flex flex-col",
        isAgent ? "items-end" : "items-start",
      )}
    >
      <div
        className={cn(
          "relative rounded-2xl px-3 py-2",
          isAgent
            ? "rounded-br-md bg-primary text-primary-foreground"
            : "rounded-bl-md bg-muted text-foreground",
        )}
      >
        {reply && (
          <ReplyQuote
            authorLabel={reply.authorLabel}
            preview={reply.preview}
            onPrimary={isAgent}
          />
        )}
        {message.referral_data && (
          <AdReferralCard referral={message.referral_data} />
        )}
        <MessageContent message={message} />
        <div
          className={cn(
            "mt-1 flex items-center gap-1",
            isAgent ? "justify-end" : "justify-start",
          )}
        >
          <span
            className={cn(
              "text-[10px]",
              // Outbound bubbles sit on the primary fill, so the
              // timestamp must read against that (not the neutral
              // foreground) — otherwise it goes low-contrast in light
              // mode. Inbound bubbles use the muted surface.
              isAgent ? "text-primary-foreground/70" : "text-muted-foreground",
            )}
          >
            {time}
          </span>
          {isAgent && <StatusIcon status={message.status} />}
        </div>
      </div>
      {reactions && reactions.length > 0 && onToggleReaction && (
        <MessageReactions
          reactions={reactions}
          currentUserId={currentUserId}
          onToggle={onToggleReaction}
        />
      )}
    </div>
  );
}
