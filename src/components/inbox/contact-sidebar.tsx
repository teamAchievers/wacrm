"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { Contact, Deal, ContactNote, Tag, Conversation, ReferralData } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  User,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Calendar,
  Clock,
  Megaphone,
  ExternalLink,
  Pencil,
  X,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";
import { toast } from "sonner";

interface ContactSidebarProps {
  contact: Contact | null;
  conversation?: Conversation | null;
}

export function ContactSidebar({ contact, conversation }: ContactSidebarProps) {
  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  // Referral / Ad Attribution states
  const [localReferral, setLocalReferral] = useState<ReferralData | null>(
    conversation?.referral_data ?? null
  );
  const [isEditingAd, setIsEditingAd] = useState(false);
  const [savingAd, setSavingAd] = useState(false);
  const [fetchingAd, setFetchingAd] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Form states for manual attribution edit/add
  const [formCampaignName, setFormCampaignName] = useState("");
  const [formCampaignId, setFormCampaignId] = useState("");
  const [formAdsetName, setFormAdsetName] = useState("");
  const [formAdsetId, setFormAdsetId] = useState("");
  const [formAdName, setFormAdName] = useState("");
  const [formAdId, setFormAdId] = useState("");

  const handleFetchAdDetails = useCallback(
    async (customAdId?: string) => {
      if (!conversation) return;
      setFetchingAd(true);
      try {
        const res = await fetch("/api/whatsapp/conversations/fetch-ad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversation.id,
            adId:
              customAdId?.trim() ||
              formAdId.trim() ||
              localReferral?.ad_id ||
              localReferral?.source_id,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          toast.error(data.error || "Failed to fetch ad details from Meta");
          return;
        }
        if (data.success && data.referral_data) {
          setLocalReferral(data.referral_data);
          setFormCampaignName(data.referral_data.campaign_name ?? "");
          setFormCampaignId(data.referral_data.campaign_id ?? "");
          setFormAdsetName(data.referral_data.adset_name ?? "");
          setFormAdsetId(data.referral_data.adset_id ?? "");
          setFormAdName(data.referral_data.ad_name ?? "");
          setFormAdId(
            data.referral_data.ad_id ?? data.referral_data.source_id ?? ""
          );
          toast.success(data.message || "Ad details fetched from Meta");
        } else {
          toast.info(data.message || "No ad details found for this conversation");
        }
      } catch (e) {
        console.error("fetch ad details error:", e);
        toast.error("Failed to connect to Meta API");
      } finally {
        setFetchingAd(false);
      }
    },
    [conversation, formAdId, localReferral]
  );

  useEffect(() => {
    setLocalReferral(conversation?.referral_data ?? null);
    setIsEditingAd(false);

    // Auto-backfill if conversation doesn't have referral_data or lacks campaign_name
    if (
      conversation?.id &&
      (!conversation.referral_data || !conversation.referral_data.campaign_name)
    ) {
      fetch("/api/whatsapp/conversations/fetch-ad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data?.success && data?.referral_data) {
            setLocalReferral(data.referral_data);
          }
        })
        .catch(() => {});
    }
  }, [conversation?.id, conversation?.referral_data]);

  const startEditingAd = () => {
    setFormCampaignName(localReferral?.campaign_name ?? "");
    setFormCampaignId(localReferral?.campaign_id ?? "");
    setFormAdsetName(localReferral?.adset_name ?? "");
    setFormAdsetId(localReferral?.adset_id ?? "");
    setFormAdName(localReferral?.ad_name ?? "");
    setFormAdId(localReferral?.ad_id ?? localReferral?.source_id ?? "");
    setIsEditingAd(true);
  };

  const handleSaveAd = async () => {
    if (!conversation) return;
    setSavingAd(true);
    try {
      const updated: ReferralData = {
        ...(localReferral || {}),
        source_type: localReferral?.source_type || "ad",
        campaign_name: formCampaignName.trim() || undefined,
        campaign_id: formCampaignId.trim() || undefined,
        adset_name: formAdsetName.trim() || undefined,
        adset_id: formAdsetId.trim() || undefined,
        ad_name: formAdName.trim() || undefined,
        ad_id: formAdId.trim() || undefined,
        source_id: formAdId.trim() || localReferral?.source_id || undefined,
      };

      const supabase = createClient();
      const { error } = await supabase
        .from("conversations")
        .update({ referral_data: updated })
        .eq("id", conversation.id);

      if (error) {
        console.error("Failed to update ad referral:", error);
        toast.error("Failed to update ad attribution");
        return;
      }

      setLocalReferral(updated);
      setIsEditingAd(false);
      toast.success("Ad attribution updated");
    } catch (e) {
      console.error("Save ad error:", e);
      toast.error("Failed to save ad details");
    } finally {
      setSavingAd(false);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const fetchContactData = useCallback(async () => {
    if (!contact) return;

    const supabase = createClient();

    // Fetch deals, notes, and tags in parallel
    const [dealsRes, notesRes, tagsRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
  }, [contact]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">Select a conversation</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      <ScrollArea className="flex-1">
        <div className="p-4">
          {/* Contact Info */}
          <div className="flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
              {contact.avatar_url ? (
                <img
                  src={contact.avatar_url}
                  alt={displayName}
                  className="h-16 w-16 rounded-full object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <h3 className="mt-3 text-sm font-semibold text-foreground">
              {displayName}
            </h3>
            {contact.company && (
              <p className="text-xs text-muted-foreground">{contact.company}</p>
            )}
          </div>

          {/* Phone */}
          <div className="mt-4 space-y-2">
            <button
              onClick={handleCopyPhone}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted"
            >
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{contact.phone}</span>
              {copied ? (
                <Check className="h-3 w-3 text-primary" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>

            {contact.email && (
              <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{contact.email}</span>
              </div>
            )}

            {conversation && (
              <div className="mt-2 border-t border-border/40 pt-2 space-y-1.5 px-3">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span>Started:</span>
                  <span className="font-medium text-foreground">
                    {format(new Date(conversation.created_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <span>Last Update:</span>
                  <span className="font-medium text-foreground">
                    {format(new Date(conversation.updated_at), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Ad & Campaign Attribution */}
          {conversation && (
            <div>
              <div className="flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-3.5 w-3.5 text-primary" />
                  <span>Ad Attribution</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFetchAdDetails()}
                    disabled={fetchingAd}
                    title="Fetch Ad & Campaign details from Meta"
                    className="flex items-center gap-1 text-[11px] font-normal capitalize tracking-normal text-muted-foreground hover:text-foreground"
                  >
                    <RefreshCw className={cn("h-3 w-3", fetchingAd && "animate-spin text-primary")} />
                    <span>{fetchingAd ? "Fetching..." : "Fetch"}</span>
                  </button>
                  {!isEditingAd && (
                    <button
                      onClick={startEditingAd}
                      className="flex items-center gap-1 text-[11px] font-normal capitalize tracking-normal text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>{localReferral ? "Edit" : "Add"}</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-2">
                {isEditingAd ? (
                  <div className="space-y-2.5 rounded-lg border border-border bg-muted/40 p-2.5 text-xs">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                          Ad ID (Meta source_id)
                        </label>
                        <button
                          type="button"
                          onClick={() => handleFetchAdDetails(formAdId)}
                          disabled={!formAdId.trim() || fetchingAd}
                          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline disabled:opacity-50"
                        >
                          <RefreshCw className={cn("h-2.5 w-2.5", fetchingAd && "animate-spin")} />
                          <span>Fetch from Meta</span>
                        </button>
                      </div>
                      <Input
                        value={formAdId}
                        onChange={(e) => setFormAdId(e.target.value)}
                        placeholder="e.g. 1202058392021"
                        className="mt-1 h-7 font-mono text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Campaign Name
                      </label>
                      <Input
                        value={formCampaignName}
                        onChange={(e) => setFormCampaignName(e.target.value)}
                        placeholder="e.g. Summer Promo 2026"
                        className="mt-1 h-7 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Campaign ID
                      </label>
                      <Input
                        value={formCampaignId}
                        onChange={(e) => setFormCampaignId(e.target.value)}
                        placeholder="e.g. 1202058392019"
                        className="mt-1 h-7 font-mono text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Ad Set Name
                      </label>
                      <Input
                        value={formAdsetName}
                        onChange={(e) => setFormAdsetName(e.target.value)}
                        placeholder="e.g. Lookalike 1% - India"
                        className="mt-1 h-7 text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Ad Set ID
                      </label>
                      <Input
                        value={formAdsetId}
                        onChange={(e) => setFormAdsetId(e.target.value)}
                        placeholder="e.g. 1202058392020"
                        className="mt-1 h-7 font-mono text-xs bg-background"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                        Ad Name
                      </label>
                      <Input
                        value={formAdName}
                        onChange={(e) => setFormAdName(e.target.value)}
                        placeholder="e.g. Video Ad - Feature Demo"
                        className="mt-1 h-7 text-xs bg-background"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-1 border-t border-border/50">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setIsEditingAd(false)}
                        disabled={savingAd}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-7 text-xs bg-primary hover:bg-primary/90"
                        onClick={handleSaveAd}
                        disabled={savingAd}
                      >
                        {savingAd ? "Saving..." : "Save Details"}
                      </Button>
                    </div>
                  </div>
                ) : localReferral ? (
                  <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs">
                    {(localReferral.image_url || localReferral.thumbnail_url) && (
                      <div className="overflow-hidden rounded-md border border-border/40">
                        <img
                          src={localReferral.image_url || localReferral.thumbnail_url}
                          alt={localReferral.headline || "Ad creative"}
                          className="max-h-28 w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}

                    {localReferral.headline && (
                      <div className="rounded bg-background/50 p-2 border border-border/30">
                        <p className="font-semibold text-foreground text-xs leading-tight">
                          {localReferral.headline}
                        </p>
                        {localReferral.body && (
                          <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                            {localReferral.body}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {/* Campaign */}
                      <div className="rounded bg-background/60 p-2 border border-border/30">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Campaign
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-foreground truncate" title={localReferral.campaign_name}>
                          {localReferral.campaign_name || "—"}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span className="truncate">ID: {localReferral.campaign_id || "—"}</span>
                          {localReferral.campaign_id && (
                            <button
                              onClick={() => copyToClipboard(localReferral.campaign_id!, "camp_id")}
                              className="ml-1 p-0.5 hover:text-foreground shrink-0"
                              title="Copy Campaign ID"
                            >
                              {copiedField === "camp_id" ? (
                                <Check className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ad Set */}
                      <div className="rounded bg-background/60 p-2 border border-border/30">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Ad Set
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-foreground truncate" title={localReferral.adset_name}>
                          {localReferral.adset_name || "—"}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span className="truncate">ID: {localReferral.adset_id || "—"}</span>
                          {localReferral.adset_id && (
                            <button
                              onClick={() => copyToClipboard(localReferral.adset_id!, "adset_id")}
                              className="ml-1 p-0.5 hover:text-foreground shrink-0"
                              title="Copy Ad Set ID"
                            >
                              {copiedField === "adset_id" ? (
                                <Check className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ad */}
                      <div className="rounded bg-background/60 p-2 border border-border/30">
                        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          Ad
                        </div>
                        <div className="mt-0.5 text-xs font-semibold text-foreground truncate" title={localReferral.ad_name}>
                          {localReferral.ad_name || "—"}
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-muted-foreground">
                          <span className="truncate">ID: {localReferral.ad_id || localReferral.source_id || "—"}</span>
                          {(localReferral.ad_id || localReferral.source_id) && (
                            <button
                              onClick={() =>
                                copyToClipboard(
                                  (localReferral.ad_id || localReferral.source_id)!,
                                  "ad_id"
                                )
                              }
                              className="ml-1 p-0.5 hover:text-foreground shrink-0"
                              title="Copy Ad ID"
                            >
                              {copiedField === "ad_id" ? (
                                <Check className="h-3 w-3 text-primary" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* CTWA Click ID */}
                      {localReferral.ctwa_clid && (
                        <div className="flex items-center justify-between px-1 text-[10px] font-mono text-muted-foreground">
                          <span className="truncate" title={localReferral.ctwa_clid}>
                            Click ID: {localReferral.ctwa_clid.slice(0, 16)}...
                          </span>
                          <button
                            onClick={() => copyToClipboard(localReferral.ctwa_clid!, "ctwa_clid")}
                            className="ml-1 p-0.5 hover:text-foreground shrink-0"
                            title="Copy Click ID"
                          >
                            {copiedField === "ctwa_clid" ? (
                              <Check className="h-3 w-3 text-primary" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </button>
                        </div>
                      )}

                      {/* Source URL Link */}
                      {localReferral.source_url && (
                        <div className="pt-0.5">
                          <a
                            href={localReferral.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-1.5 rounded-md border border-border/60 bg-background/50 py-1.5 text-[11px] font-medium text-primary transition-colors hover:bg-background"
                          >
                            <span>View Ad on Meta</span>
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-border/70 p-3 text-center">
                    <p className="text-[11px] text-muted-foreground">
                      No ad attribution for this conversation
                    </p>
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleFetchAdDetails()}
                        disabled={fetchingAd}
                        className="h-6 text-[10px] px-2"
                      >
                        <RefreshCw className={cn("mr-1 h-3 w-3", fetchingAd && "animate-spin text-primary")} />
                        {fetchingAd ? "Fetching..." : "Fetch from Meta"}
                      </Button>
                      <button
                        type="button"
                        onClick={startEditingAd}
                        className="text-[11px] font-medium text-primary hover:underline"
                      >
                        + Add Manually
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Tags */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <TagIcon className="h-3 w-3" />
              Tags
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {tags.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No tags</p>
              ) : (
                tags.map((tag) => (
                  <span
                    key={tag.contact_tag_id}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${tag.color}20`,
                      color: tag.color,
                    }}
                  >
                    {tag.name}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Active Deals */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <DollarSign className="h-3 w-3" />
              Active Deals
            </div>
            <div className="mt-2 space-y-2">
              {deals.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">No deals</p>
              ) : (
                deals.map((deal) => (
                  <div
                    key={deal.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {deal.title}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {deal.currency ?? "$"}
                        {deal.value.toLocaleString()}
                      </span>
                      {deal.stage && (
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px]"
                          style={{
                            backgroundColor: `${deal.stage.color}20`,
                            color: deal.stage.color,
                          }}
                        >
                          {deal.stage.name}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="my-4 border-t border-border" />

          {/* Notes */}
          <div>
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              Notes
            </div>
            <div className="mt-2">
              <div className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
                />
                <Button
                  size="sm"
                  className="h-auto bg-primary px-2 hover:bg-primary/90"
                  onClick={handleAddNote}
                  disabled={!newNote.trim() || addingNote}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="mt-2 space-y-2">
                {notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg bg-muted px-3 py-2"
                  >
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}
