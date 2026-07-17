/**
 * Starter flow templates.
 *
 * Three pre-canned flows users can clone with one click instead of
 * building from scratch. Each template is a plain JS object describing
 * the same shape `/api/flows` PUT accepts — name, trigger config,
 * entry_node_id, fallback_policy, nodes[] — keyed by a stable
 * `slug`.
 *
 * The clone path (`/api/flows` POST with `template_slug`) creates a
 * NEW flow_row + flow_nodes rows for the user. `node_key`s are kept
 * verbatim (they're stable strings, not UUIDs, so cloning never
 * needs to rewrite edge references).
 *
 * Choosing a single static module over a DB-backed gallery for v1
 * because: (a) the set is small and changes with code releases, not
 * data; (b) keeps templates portable across self-hosted instances
 * without migrations; (c) editing in source is the lowest-friction
 * way to add the next template.
 */

import type {
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  SendMediaNodeConfig,
  StartNodeConfig,
} from "./types";

export type FlowTemplateNodeType =
  | "start"
  | "send_message"
  | "send_buttons"
  | "send_list"
  | "send_media"
  | "collect_input"
  | "condition"
  | "set_tag"
  | "handoff"
  | "end";

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | SendMediaNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Used by the gallery to surface a relevant icon. lucide-react name. */
  icon: "MessageSquare" | "HelpCircle" | "UserPlus";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

// ============================================================
// 1. Welcome menu — the example from the owner's brief
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: "welcome_menu",
  name: "Welcome menu",
  description:
    "Greet customers who type a keyword and route them to the right agent based on whether they're new or existing.",
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: { keywords: ["support", "help", "hi"], match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: "Hi! 👋 Welcome to support. Are you an existing customer or new here?",
        footer_text: "Tap a button below to continue.",
        buttons: [
          {
            reply_id: "existing",
            title: "Existing customer",
            next_node_key: "existing_handoff",
          },
          {
            reply_id: "new",
            title: "New customer",
            next_node_key: "new_handoff",
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "existing_handoff",
      node_type: "handoff",
      config: {
        note: "Existing customer needs assistance — please check account history before replying.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "new_handoff",
      node_type: "handoff",
      config: {
        note: "New customer — share pricing + onboarding link.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. FAQ bot — list-message answers, fully automated
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: "faq_bot",
  name: "FAQ bot",
  description:
    "Answer common questions automatically. Customer picks a topic from a list; the bot replies with the answer and ends.",
  icon: "HelpCircle",
  trigger_type: "keyword",
  trigger_config: {
    keywords: ["faq", "question", "info"],
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "topics" },
    },
    {
      node_key: "topics",
      node_type: "send_list",
      config: {
        text: "What can I help you with?",
        button_label: "View topics",
        sections: [
          {
            title: "Common questions",
            rows: [
              {
                reply_id: "hours",
                title: "Opening hours",
                next_node_key: "answer_hours",
              },
              {
                reply_id: "pricing",
                title: "Pricing",
                next_node_key: "answer_pricing",
              },
              {
                reply_id: "refunds",
                title: "Refund policy",
                next_node_key: "answer_refunds",
              },
            ],
          },
          {
            title: "Other",
            rows: [
              {
                reply_id: "human",
                title: "Talk to a human",
                next_node_key: "human_handoff",
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "answer_hours",
      node_type: "send_message",
      config: {
        text: "We're open Mon–Fri, 9am–6pm local time. Weekend support is limited to urgent issues.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_pricing",
      node_type: "send_message",
      config: {
        text: "Our pricing starts at $9/mo. Visit https://example.com/pricing for the full breakdown.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_refunds",
      node_type: "send_message",
      config: {
        text: "Refunds are honored within 30 days of purchase. Reply with your order number and we'll process it.",
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "human_handoff",
      node_type: "handoff",
      config: {
        note: "Customer asked to talk to a human from the FAQ bot.",
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Lead capture — collect_input chain, ends in a handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: "lead_capture",
  name: "Lead capture",
  description:
    "Greet first-time inbounds, capture name + email + company, then hand off to sales with the answers in the note.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: "Welcome! 👋 I'll ask a few quick questions so we can get you to the right person.",
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your name?",
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "Thanks {{vars.name}}! What's your work email?",
        var_key: "email",
        next_node_key: "ask_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Almost done — what's your company name?",
        var_key: "company",
        next_node_key: "handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: "New lead — name={{vars.name}}, email={{vars.email}}, company={{vars.company}}.",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 4. Unbox Lead Qualifier — 12-node interactive questionnaire
// ============================================================
const UNBOX_LEAD_QUALIFIER: FlowTemplate = {
  slug: "unbox_lead_qualifier",
  name: "Unbox Lead Qualifier",
  description:
    "Qualify leads interactively for Unbox Studio. Collects service interest, industry, budget, and business details, branching to high-intent or lower-budget actions.",
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "👋 Hi! Welcome to Unbox Studio.\n\nWe help businesses grow through:\n\n• Performance Marketing\n• Social Media Management\n• Branding\n• Website Development\n• SEO\n\nLet's understand your business so our team can recommend the right strategy.\n\nIt'll only take about 2 minutes.",
        next_node_key: "select_service",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "select_service",
      node_type: "send_list",
      config: {
        text: "What service are you interested in?",
        button_label: "View Services",
        sections: [
          {
            title: "Services",
            rows: [
              { reply_id: "smm", title: "📱 Social Media", next_node_key: "ask_industry" },
              { reply_id: "perf", title: "🚀 Performance Mktg", next_node_key: "ask_industry" },
              { reply_id: "web", title: "🌐 Website Development", next_node_key: "ask_industry" },
              { reply_id: "branding", title: "🎨 Branding & Design", next_node_key: "ask_industry" },
              { reply_id: "seo", title: "📈 SEO", next_node_key: "ask_industry" },
              { reply_id: "not_sure", title: "🤔 Not Sure", next_node_key: "ask_industry" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "ask_industry",
      node_type: "send_list",
      config: {
        text: "What industry are you in?",
        button_label: "View Industries",
        sections: [
          {
            title: "Industries",
            rows: [
              { reply_id: "travel", title: "Travel", next_node_key: "business_stage" },
              { reply_id: "real_estate", title: "Real Estate", next_node_key: "business_stage" },
              { reply_id: "healthcare", title: "Healthcare", next_node_key: "business_stage" },
              { reply_id: "education", title: "Education", next_node_key: "business_stage" },
              { reply_id: "ecommerce", title: "Ecommerce", next_node_key: "business_stage" },
              { reply_id: "architecture", title: "Architecture", next_node_key: "business_stage" },
              { reply_id: "construction", title: "Construction", next_node_key: "business_stage" },
              { reply_id: "finance", title: "Finance", next_node_key: "business_stage" },
              { reply_id: "personal_brand", title: "Personal Brand", next_node_key: "business_stage" },
              { reply_id: "other", title: "Other", next_node_key: "business_stage" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "business_stage",
      node_type: "send_buttons",
      config: {
        text: "What stage is your business in?",
        buttons: [
          { reply_id: "startup", title: "Startup", next_node_key: "marketing_budget" },
          { reply_id: "growing", title: "Growing Business", next_node_key: "marketing_budget" },
          { reply_id: "established", title: "Established Business", next_node_key: "marketing_budget" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "marketing_budget",
      node_type: "send_list",
      config: {
        text: "What is your monthly marketing budget?",
        button_label: "View Budgets",
        sections: [
          {
            title: "Budgets",
            rows: [
              { reply_id: "below_30k", title: "Below ₹30,000", next_node_key: "ask_goal" },
              { reply_id: "30k_50k", title: "₹30k–₹50k", next_node_key: "ask_goal" },
              { reply_id: "50k_1l", title: "₹50k–₹1L", next_node_key: "set_high_budget_tag" },
              { reply_id: "1l_3l", title: "₹1L–₹3L", next_node_key: "set_high_budget_tag" },
              { reply_id: "3l_plus", title: "₹3L+", next_node_key: "set_high_budget_tag" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "set_high_budget_tag",
      node_type: "set_tag",
      config: {
        mode: "add",
        tag_id: "", // Configured in builder by user
        next_node_key: "ask_goal",
      },
    },
    {
      node_key: "ask_goal",
      node_type: "send_list",
      config: {
        text: "What is your primary marketing goal?",
        button_label: "View Goals",
        sections: [
          {
            title: "Goals",
            rows: [
              { reply_id: "leads", title: "Generate Leads", next_node_key: "ask_business_name" },
              { reply_id: "sales", title: "Increase Sales", next_node_key: "ask_business_name" },
              { reply_id: "awareness", title: "Brand Awareness", next_node_key: "ask_business_name" },
              { reply_id: "website", title: "Website", next_node_key: "ask_business_name" },
              { reply_id: "social", title: "Social Media Growth", next_node_key: "ask_business_name" },
              { reply_id: "consultation", title: "Need Consultation", next_node_key: "ask_business_name" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "ask_business_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your business name?",
        var_key: "company",
        next_node_key: "ask_website",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_website",
      node_type: "collect_input",
      config: {
        prompt_text: "Share your Website or Instagram profile.",
        var_key: "website",
        next_node_key: "ask_name",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your name?",
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your email?",
        var_key: "email",
        next_node_key: "ask_phone",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_phone",
      node_type: "send_buttons",
      config: {
        text: "Is this WhatsApp number your primary business contact?",
        buttons: [
          { reply_id: "yes", title: "Yes", next_node_key: "qualification_logic" },
          { reply_id: "no", title: "Use Another Number", next_node_key: "collect_new_phone" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "collect_new_phone",
      node_type: "collect_input",
      config: {
        prompt_text: "Please enter your primary business contact number:",
        var_key: "phone",
        next_node_key: "qualification_logic",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "qualification_logic",
      node_type: "condition",
      config: {
        subject: "tag",
        subject_key: "", // Tag to evaluate configured by user
        operator: "present",
        true_next: "high_intent_flow",
        false_next: "lower_budget_flow",
      } as ConditionNodeConfig,
    },
    {
      node_key: "high_intent_flow",
      node_type: "send_buttons",
      config: {
        text: "🔥 Great!\n\nBased on your responses, our strategist can help you create a customized growth plan.\n\nWould you like to schedule a FREE 30-minute strategy session?",
        buttons: [
          { reply_id: "book", title: "Book Call", next_node_key: "handoff_high" },
          { reply_id: "team", title: "Talk to Team", next_node_key: "handoff_high" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "lower_budget_flow",
      node_type: "send_message",
      config: {
        text: "Thanks!\n\nWe've prepared some resources that will help you grow.\n\nMeanwhile our team will also review your business.",
        next_node_key: "portfolio_node",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "portfolio_node",
      node_type: "send_media",
      config: {
        media_type: "document",
        media_url: "https://example.com/agency-deck.pdf",
        caption: "Meanwhile, here's our portfolio.\n\n✔ 100+ Brands Served\n✔ Performance Marketing\n✔ Social Media\n✔ Branding\n✔ Websites\n\nWe'll review your business shortly.",
        filename: "Portfolio.pdf",
        next_node_key: "handoff_normal",
      } as SendMediaNodeConfig,
    },
    {
      node_key: "handoff_high",
      node_type: "handoff",
      config: {
        note: "New Qualified Lead\nName: {{vars.name}}\nCompany: {{vars.company}}\nWebsite: {{vars.website}}\nEmail: {{vars.email}}\nPhone: {{vars.phone}}",
      } as HandoffNodeConfig,
    },
    {
      node_key: "handoff_normal",
      node_type: "handoff",
      config: {
        note: "New Lead (Normal)\nName: {{vars.name}}\nCompany: {{vars.company}}\nWebsite: {{vars.website}}\nEmail: {{vars.email}}\nPhone: {{vars.phone}}",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
  unbox_lead_qualifier: UNBOX_LEAD_QUALIFIER,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
