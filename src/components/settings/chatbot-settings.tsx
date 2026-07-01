"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bot, Loader2, Key } from "lucide-react";

import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { SettingsPanelHead } from "./settings-panel-head";

interface ChatbotConfig {
  is_enabled: boolean;
  provider: "gemini" | "openai";
  api_key?: string;
  system_prompt: string;
  handoff_keywords: string;
  has_key?: boolean;
}

export function ChatbotSettings() {
  const { canEditSettings } = useAuth();

  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadConfig() {
      try {
        const response = await fetch("/api/chatbot/config");
        if (!response.ok) {
          throw new Error("Failed to load configuration");
        }
        const data = await response.json();
        setConfig(data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to load chatbot configuration");
      } finally {
        setLoading(false);
      }
    }

    loadConfig();
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);

    try {
      const response = await fetch("/api/chatbot/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...config,
          api_key: apiKey || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save configuration");
      }

      toast.success("Chatbot configuration updated successfully");
      setApiKey("");
      
      // Reload config to get updated has_key indicator
      const updated = await fetch("/api/chatbot/config").then((r) => r.json());
      setConfig(updated);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save chatbot configuration");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) return null;

  return (
    <section className="max-w-2xl animate-in fade-in-50 duration-200">
      <SettingsPanelHead
        title="AI Chatbot Settings"
        description="Configure automated AI replies for incoming messages and handle agent handoff."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Bot className="size-5 text-primary" />
            Auto-Reply Configuration
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            When enabled, the chatbot will answer queries using the selected LLM provider. Once a chat is assigned to a human agent, the bot will stop replying.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle Enable */}
          <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
            <div className="space-y-0.5">
              <Label className="text-foreground font-medium">Enable AI Chatbot</Label>
              <p className="text-sm text-muted-foreground">
                Activate the bot to automatically respond to new, unassigned WhatsApp messages.
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.is_enabled}
              onChange={(e) => setConfig({ ...config, is_enabled: e.target.checked })}
              disabled={!canEditSettings || saving}
              className="size-5 accent-primary cursor-pointer rounded border-border"
            />
          </div>

          {/* AI Provider selection */}
          <div className="grid gap-2">
            <Label className="text-foreground font-medium">AI Model Provider</Label>
            <select
              value={config.provider}
              onChange={(e) =>
                setConfig({
                  ...config,
                  provider: e.target.value as "gemini" | "openai",
                })
              }
              disabled={!canEditSettings || saving}
              className="h-9 w-full rounded-lg border border-border bg-muted px-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="gemini">Gemini (gemini-2.5-flash)</option>
              <option value="openai">OpenAI (gpt-4o-mini)</option>
            </select>
          </div>

          {/* API Key */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-foreground font-medium">API Access Key</Label>
              {config.has_key && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <Key className="size-3" /> Key already configured
                </span>
              )}
            </div>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.has_key ? "••••••••••••••••••••••••" : "Enter your API Key..."}
              disabled={!canEditSettings || saving}
              className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Provide your API key for the selected AI Provider. It is securely encrypted before saving.
            </p>
          </div>

          {/* System prompt */}
          <div className="grid gap-2">
            <Label className="text-foreground font-medium">Business Profile & Instructions (System Prompt)</Label>
            <textarea
              value={config.system_prompt}
              onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
              rows={5}
              placeholder="Describe your business, products, services, FAQs and rules for the AI."
              disabled={!canEditSettings || saving}
              className="w-full rounded-lg border border-border bg-muted p-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary disabled:cursor-not-allowed"
            />
            <p className="text-xs text-muted-foreground">
              This prompt guides the AI response style, details about your products/services, and standard answers.
            </p>
          </div>

          {/* Handoff keywords */}
          <div className="grid gap-2">
            <Label className="text-foreground font-medium">Human Handoff Trigger Keywords</Label>
            <input
              type="text"
              value={config.handoff_keywords}
              onChange={(e) => setConfig({ ...config, handoff_keywords: e.target.value })}
              placeholder="human, agent, representative, help, support, talk to a person"
              disabled={!canEditSettings || saving}
              className="h-9 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of keywords that will trigger an automatic transfer of the chat to a human agent.
            </p>
          </div>

          {/* Actions */}
          {canEditSettings && (
            <div className="flex justify-end pt-4 border-t border-border">
              <Button
                onClick={handleSave}
                disabled={saving}
                className="gap-2"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
