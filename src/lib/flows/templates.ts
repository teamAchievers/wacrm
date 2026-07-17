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

// ============================================================
// 5. Unbox Qualifier — Meta Ad → WhatsApp consultation flow
// ============================================================
const UNBOX_QUALIFIER: FlowTemplate = {
  slug: "unbox_qualifier",
  name: "Unbox Qualifier",
  description:
    "For Meta Ad leads who've already submitted their details via Instant Form. Skips data collection — focuses on qualifying goals, service needs, and readiness for a personalised consultation.",
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
    // Node 1 — Welcome
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "👋 Hi! Thanks for reaching out to Unbox Studio!\n\nWe've received your business details and appreciate your interest. 🙏\n\nTo recommend the right growth strategy for your business, we'd love to understand your goals better.\n\nIt'll take less than a minute — and based on your answers, our team will prepare *personalised recommendations* just for you.\n\n🚀 Let's get started!",
        next_node_key: "ask_goal",
      } as SendMessageNodeConfig,
    },
    // Node 2 — Primary Goal
    {
      node_key: "ask_goal",
      node_type: "send_list",
      config: {
        text: "🎯 What's your *primary business goal* right now?",
        button_label: "Select your goal",
        sections: [
          {
            title: "Business Goals",
            rows: [
              { reply_id: "goal_leads", title: "Generate More Leads", next_node_key: "ask_service" },
              { reply_id: "goal_sales", title: "Increase Sales", next_node_key: "ask_service" },
              { reply_id: "goal_brand", title: "Build Brand Awareness", next_node_key: "ask_service" },
              { reply_id: "goal_social", title: "Grow Social Media", next_node_key: "ask_service" },
              { reply_id: "goal_launch", title: "Launch a New Business", next_node_key: "ask_service" },
              { reply_id: "goal_unsure", title: "Not Sure (Need Guidance)", next_node_key: "ask_service" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 3 — Service Interest
    {
      node_key: "ask_service",
      node_type: "send_list",
      config: {
        text: "🛠️ Which service are you looking for?",
        button_label: "Select a service",
        sections: [
          {
            title: "Our Services",
            rows: [
              { reply_id: "svc_perf", title: "🚀 Performance Mktg", next_node_key: "ask_industry" },
              { reply_id: "svc_social", title: "📱 Social Media Mgmt", next_node_key: "ask_industry" },
              { reply_id: "svc_web", title: "🌐 Website Dev", next_node_key: "ask_industry" },
              { reply_id: "svc_brand", title: "🎨 Branding & Creative", next_node_key: "ask_industry" },
              { reply_id: "svc_seo", title: "📈 SEO", next_node_key: "ask_industry" },
              { reply_id: "svc_full", title: "🤝 Full Mktg Solution", next_node_key: "ask_industry" },
              { reply_id: "svc_recommend", title: "🤔 Expert Recommendation", next_node_key: "ask_industry" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 4 — Industry
    {
      node_key: "ask_industry",
      node_type: "send_list",
      config: {
        text: "🏢 Which industry best describes your business?",
        button_label: "Select industry",
        sections: [
          {
            title: "Industries",
            rows: [
              { reply_id: "ind_travel", title: "Travel", next_node_key: "ask_marketing" },
              { reply_id: "ind_realestate", title: "Real Estate", next_node_key: "ask_marketing" },
              { reply_id: "ind_education", title: "Education", next_node_key: "ask_marketing" },
              { reply_id: "ind_healthcare", title: "Healthcare", next_node_key: "ask_marketing" },
              { reply_id: "ind_construction", title: "Construction", next_node_key: "ask_marketing" },
              { reply_id: "ind_ecommerce", title: "E-commerce", next_node_key: "ask_marketing" },
              { reply_id: "ind_finance", title: "Finance", next_node_key: "ask_marketing" },
              { reply_id: "ind_mfg", title: "Manufacturing", next_node_key: "ask_marketing" },
              { reply_id: "ind_personal", title: "Personal Brand", next_node_key: "ask_marketing" },
              { reply_id: "ind_other", title: "Other", next_node_key: "ask_marketing" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 5 — Current Marketing
    {
      node_key: "ask_marketing",
      node_type: "send_list",
      config: {
        text: "📊 How are you currently generating customers?",
        button_label: "Select one",
        sections: [
          {
            title: "Current Marketing",
            rows: [
              { reply_id: "mkt_referrals", title: "Mostly Referrals", next_node_key: "ask_challenge" },
              { reply_id: "mkt_social", title: "Social Media", next_node_key: "ask_challenge" },
              { reply_id: "mkt_meta", title: "Meta Ads", next_node_key: "ask_challenge" },
              { reply_id: "mkt_google", title: "Google Ads", next_node_key: "ask_challenge" },
              { reply_id: "mkt_seo", title: "SEO", next_node_key: "ask_challenge" },
              { reply_id: "mkt_cold", title: "Cold Calling", next_node_key: "ask_challenge" },
              { reply_id: "mkt_none", title: "Not Doing Marketing Yet", next_node_key: "ask_challenge" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 6 — Biggest Challenge
    {
      node_key: "ask_challenge",
      node_type: "send_list",
      config: {
        text: "⚠️ What's stopping your business from growing faster?",
        button_label: "Select a challenge",
        sections: [
          {
            title: "Biggest Challenge",
            rows: [
              { reply_id: "ch_leads", title: "Not Enough Leads", next_node_key: "ask_timeline" },
              { reply_id: "ch_convert", title: "Leads Don't Convert", next_node_key: "ask_timeline" },
              { reply_id: "ch_visibility", title: "Low Brand Visibility", next_node_key: "ask_timeline" },
              { reply_id: "ch_marketing", title: "Marketing Isn't Working", next_node_key: "ask_timeline" },
              { reply_id: "ch_website", title: "Need Better Website", next_node_key: "ask_timeline" },
              { reply_id: "ch_strategy", title: "Need Complete Strategy", next_node_key: "ask_timeline" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 7 — Timeline
    {
      node_key: "ask_timeline",
      node_type: "send_list",
      config: {
        text: "⏰ When are you planning to start?",
        button_label: "Select timeline",
        sections: [
          {
            title: "Start Timeline",
            rows: [
              { reply_id: "tl_now", title: "Immediately", next_node_key: "cta" },
              { reply_id: "tl_2weeks", title: "Within 2 Weeks", next_node_key: "cta" },
              { reply_id: "tl_1month", title: "Within 1 Month", next_node_key: "cta" },
              { reply_id: "tl_exploring", title: "Just Exploring", next_node_key: "cta" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 8 — CTA: Free Strategy Call
    {
      node_key: "cta",
      node_type: "send_buttons",
      config: {
        text: "Thanks! 🎉\n\nBased on your responses, we'd love to discuss a *tailored growth plan* for your business.\n\nWould you like to schedule a *FREE 30-minute strategy consultation* with one of our experts?",
        footer_text: "Our team will prepare personalised recommendations for you.",
        buttons: [
          { reply_id: "book_call", title: "📅 Book My Call", next_node_key: "handoff_book" },
          { reply_id: "talk_expert", title: "💬 Talk to an Expert", next_node_key: "handoff_talk" },
          { reply_id: "view_portfolio", title: "📂 View Portfolio", next_node_key: "portfolio" },
        ],
      } as SendButtonsNodeConfig,
    },
    // Portfolio — send agency deck (copied from Unbox Lead Qualifier)
    {
      node_key: "portfolio",
      node_type: "send_media",
      config: {
        media_type: "document",
        media_url: "https://example.com/agency-deck.pdf",
        caption: "Here's our portfolio 🎨\n\n✔ 100+ Brands Served\n✔ Performance Marketing\n✔ Social Media\n✔ Branding\n✔ Websites\n\nFeel free to browse and reach out when you're ready to discuss your project!",
        filename: "Unbox-Studio-Portfolio.pdf",
        next_node_key: "handoff_talk",
      } as SendMediaNodeConfig,
    },
    // Handoff — Book a Call
    {
      node_key: "handoff_book",
      node_type: "handoff",
      config: {
        note: "🔥 HOT LEAD — Book Strategy Call\nGoal: {{vars.goal_leads}}{{vars.goal_sales}}{{vars.goal_brand}}{{vars.goal_social}}{{vars.goal_launch}}{{vars.goal_unsure}} | Service: {{vars.svc_perf}}{{vars.svc_social}}{{vars.svc_web}}{{vars.svc_brand}}{{vars.svc_seo}}{{vars.svc_full}}{{vars.svc_recommend}}\nTimeline: {{vars.tl_now}}{{vars.tl_2weeks}}{{vars.tl_1month}}{{vars.tl_exploring}}\n\nAction: Schedule FREE 30-min consultation ASAP.",
      } as HandoffNodeConfig,
    },
    // Handoff — Talk to Expert
    {
      node_key: "handoff_talk",
      node_type: "handoff",
      config: {
        note: "✅ QUALIFIED LEAD — Talk to Expert\nGoal: {{vars.goal_leads}}{{vars.goal_sales}}{{vars.goal_brand}}{{vars.goal_social}}{{vars.goal_launch}}{{vars.goal_unsure}} | Service: {{vars.svc_perf}}{{vars.svc_social}}{{vars.svc_web}}{{vars.svc_brand}}{{vars.svc_seo}}{{vars.svc_full}}{{vars.svc_recommend}}\nTimeline: {{vars.tl_now}}{{vars.tl_2weeks}}{{vars.tl_1month}}{{vars.tl_exploring}}",
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 6. Unbox Organic Qualifier — Organic WhatsApp Lead Qualification
//    For direct WhatsApp messages where lead details aren't known yet.
// ============================================================
const UNBOX_ORGANIC_QUALIFIER: FlowTemplate = {
  slug: "unbox_organic_qualifier",
  name: "Unbox Organic Qualifier",
  description:
    "For direct WhatsApp messages. Asks for business details, goals, service needs, budget, challenge, and contacts details. Great for organic inquiries.",
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
    // Node 1 – Welcome Message
    {
      node_key: "welcome",
      node_type: "send_message",
      config: {
        text: "👋 Hi! Welcome to Unbox Studio.\n\nThanks for reaching out! 😊\n\nWe help businesses generate quality leads, build strong brands, and scale through data-driven digital marketing.\n\nBefore we recommend anything, we'd like to understand your business and goals. This helps us suggest solutions that actually fit your needs—not just sell services.\n\nIt takes about a minute.\n\nLet's get started! 🚀",
        next_node_key: "ask_service",
      } as SendMessageNodeConfig,
    },
    // Node 2 – Service Requirement (Send List)
    {
      node_key: "ask_service",
      node_type: "send_list",
      config: {
        text: "What would you like help with today?",
        button_label: "Select requirement",
        sections: [
          {
            title: "Services",
            rows: [
              { reply_id: "svc_leads", title: "🚀 Generate More Leads", next_node_key: "ask_company" },
              { reply_id: "svc_social", title: "📱 Social Media Mgmt", next_node_key: "ask_company" },
              { reply_id: "svc_perf", title: "🎯 Performance Marketing", next_node_key: "ask_company" },
              { reply_id: "svc_web", title: "🌐 Website Development", next_node_key: "ask_company" },
              { reply_id: "svc_branding", title: "🎨 Branding & Creative", next_node_key: "ask_company" },
              { reply_id: "svc_seo", title: "📈 SEO", next_node_key: "ask_company" },
              { reply_id: "svc_guidance", title: "🤔 Need Expert Guidance", next_node_key: "ask_company" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 3 – Business Name (Collect Input)
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: "Great! 😊\n\nWhat's your business/company name?",
        var_key: "company_name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    // Node 4 – Business Email (Collect Input)
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: "What's your business email address?\n\nWe'll use it to share proposals, recommendations, or any resources you request.",
        var_key: "email",
        next_node_key: "ask_industry",
      } as CollectInputNodeConfig,
    },
    // Node 5 – Industry (Send List)
    {
      node_key: "ask_industry",
      node_type: "send_list",
      config: {
        text: "Which industry best describes your business?",
        button_label: "Select industry",
        sections: [
          {
            title: "Industries",
            rows: [
              { reply_id: "ind_travel", title: "Travel", next_node_key: "ask_goal" },
              { reply_id: "ind_realestate", title: "Real Estate", next_node_key: "ask_goal" },
              { reply_id: "ind_education", title: "Education", next_node_key: "ask_goal" },
              { reply_id: "ind_healthcare", title: "Healthcare", next_node_key: "ask_goal" },
              { reply_id: "ind_construction", title: "Construction", next_node_key: "ask_goal" },
              { reply_id: "ind_interior", title: "Architecture & Interior", next_node_key: "ask_goal" },
              { reply_id: "ind_ecommerce", title: "E-commerce", next_node_key: "ask_goal" },
              { reply_id: "ind_finance", title: "Finance", next_node_key: "ask_goal" },
              { reply_id: "ind_mfg", title: "Manufacturing", next_node_key: "ask_goal" },
              { reply_id: "ind_personal", title: "Personal Brand", next_node_key: "ask_goal" },
              { reply_id: "ind_other", title: "Other", next_node_key: "ask_goal" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 6 – Business Goal (Send List)
    {
      node_key: "ask_goal",
      node_type: "send_list",
      config: {
        text: "🎯 What's your biggest business goal over the next 3–6 months?",
        button_label: "Select goal",
        sections: [
          {
            title: "Business Goals",
            rows: [
              { reply_id: "goal_leads", title: "Generate More Leads", next_node_key: "progress_msg_1" },
              { reply_id: "goal_sales", title: "Increase Sales", next_node_key: "progress_msg_1" },
              { reply_id: "goal_brand", title: "Build Brand Awareness", next_node_key: "progress_msg_1" },
              { reply_id: "goal_social", title: "Grow Social Media", next_node_key: "progress_msg_1" },
              { reply_id: "goal_launch", title: "Launch a New Product", next_node_key: "progress_msg_1" },
              { reply_id: "goal_presence", title: "Improve Online Presence", next_node_key: "progress_msg_1" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Progress Message 1
    {
      node_key: "progress_msg_1",
      node_type: "send_message",
      config: {
        text: "Awesome! We're getting a clear understanding of your business.\n\nJust a few more questions. 😊",
        next_node_key: "ask_channels",
      } as SendMessageNodeConfig,
    },
    // Node 7 – Current Marketing Channels (Send List representing multi-select options in Whatsapp v1 flow)
    {
      node_key: "ask_channels",
      node_type: "send_list",
      config: {
        text: "📣 Which marketing channel are you primarily using right now?",
        button_label: "Select primary channel",
        sections: [
          {
            title: "Marketing Channels",
            rows: [
              { reply_id: "ch_referrals", title: "🤝 Referrals", next_node_key: "ask_challenge" },
              { reply_id: "ch_social", title: "📱 Social Media (Organic)", next_node_key: "ask_challenge" },
              { reply_id: "ch_meta", title: "📢 Meta Ads (FB & IG)", next_node_key: "ask_challenge" },
              { reply_id: "ch_google", title: "🔍 Google Ads", next_node_key: "ask_challenge" },
              { reply_id: "ch_seo", title: "🌐 SEO", next_node_key: "ask_challenge" },
              { reply_id: "ch_linkedin", title: "💼 LinkedIn", next_node_key: "ask_challenge" },
              { reply_id: "ch_email", title: "📧 Email Marketing", next_node_key: "ask_challenge" },
              { reply_id: "ch_whatsapp", title: "💬 WhatsApp Marketing", next_node_key: "ask_challenge" },
              { reply_id: "ch_influencer", title: "👥 Influencer Marketing", next_node_key: "ask_challenge" },
              { reply_id: "ch_offline", title: "📰 Offline Marketing", next_node_key: "ask_challenge" },
              { reply_id: "ch_none", title: "❌ Not doing any marketing", next_node_key: "ask_challenge" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 8 – Biggest Challenge (Send List)
    {
      node_key: "ask_challenge",
      node_type: "send_list",
      config: {
        text: "What's your biggest marketing challenge right now?",
        button_label: "Select challenge",
        sections: [
          {
            title: "Challenges",
            rows: [
              { reply_id: "chal_leads", title: "Not Getting Enough Leads", next_node_key: "ask_budget" },
              { reply_id: "chal_convert", title: "Leads Don't Convert", next_node_key: "ask_budget" },
              { reply_id: "chal_visibility", title: "Low Brand Visibility", next_node_key: "ask_budget" },
              { reply_id: "chal_cpl", title: "High Cost Per Lead", next_node_key: "ask_budget" },
              { reply_id: "chal_website", title: "Website Isn't Performing", next_node_key: "ask_budget" },
              { reply_id: "chal_strategy", title: "Need Complete Marketing Strategy", next_node_key: "ask_budget" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 9 – Monthly Marketing Budget (Send List)
    {
      node_key: "ask_budget",
      node_type: "send_list",
      config: {
        text: "What's your approximate monthly marketing budget?",
        button_label: "Select budget range",
        sections: [
          {
            title: "Budgets",
            rows: [
              { reply_id: "bud_under_30k", title: "Under ₹30,000", next_node_key: "ask_website" },
              { reply_id: "bud_30_50k", title: "₹30,000–₹50,000", next_node_key: "ask_website" },
              { reply_id: "bud_50_100k", title: "₹50,000–₹1,00,000", next_node_key: "ask_website" },
              { reply_id: "bud_100_300k", title: "₹1,00,000–₹3,00,000", next_node_key: "ask_website" },
              { reply_id: "bud_300k_plus", title: "₹3,00,000+", next_node_key: "ask_website" },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    // Node 10 – Website / Instagram (Collect Input)
    {
      node_key: "ask_website",
      node_type: "collect_input",
      config: {
        prompt_text: "Please share your website or Instagram page.\n\nThis helps our team review your current online presence before we connect.",
        var_key: "website",
        next_node_key: "ask_name",
      } as CollectInputNodeConfig,
    },
    // Node 11 – Full Name (Collect Input)
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: "Almost done! 😊\n\nWhat should we call you?",
        var_key: "name",
        next_node_key: "progress_msg_2",
      } as CollectInputNodeConfig,
    },
    // Progress Message 2
    {
      node_key: "progress_msg_2",
      node_type: "send_message",
      config: {
        text: "🎉 Perfect! Thanks for sharing the details.",
        next_node_key: "cta",
      } as SendMessageNodeConfig,
    },
    // Node 12 – Final CTA (Send Buttons)
    {
      node_key: "cta",
      node_type: "send_buttons",
      config: {
        text: "Thanks, {{vars.name}}! 🎉\n\nOur team will review your business and prepare personalized recommendations based on your goals.\n\nHow would you like to proceed?",
        footer_text: "Choose one option below to continue.",
        buttons: [
          { reply_id: "book_call", title: "📅 Book Free Call", next_node_key: "handoff_book" },
          { reply_id: "view_portfolio", title: "📂 View Portfolio", next_node_key: "portfolio" },
          { reply_id: "talk_expert", title: "💬 Talk to an Expert", next_node_key: "handoff_talk" },
        ],
      } as SendButtonsNodeConfig,
    },
    // Portfolio slide
    {
      node_key: "portfolio",
      node_type: "send_media",
      config: {
        media_type: "document",
        media_url: "https://example.com/agency-deck.pdf",
        caption: "Here's our portfolio 🎨\n\n✔ 100+ Brands Served\n✔ Performance Marketing\n✔ Social Media\n✔ Branding\n✔ Websites\n\nFeel free to browse and reach out when you're ready to discuss your project!",
        filename: "Unbox-Studio-Portfolio.pdf",
        next_node_key: "handoff_talk",
      } as SendMediaNodeConfig,
    },
    // Handoff Book
    {
      node_key: "handoff_book",
      node_type: "handoff",
      config: {
        note: "🔥 ORGANIC HOT LEAD — Wants to Book Strategy Call\nName: {{vars.name}}\nCompany: {{vars.company_name}}\nEmail: {{vars.email}}\nWebsite/IG: {{vars.website}}\nBudget: {{vars.marketing_budget}}",
      } as HandoffNodeConfig,
    },
    // Handoff Talk
    {
      node_key: "handoff_talk",
      node_type: "handoff",
      config: {
        note: "✅ ORGANIC LEAD — Wants to Talk to Expert\nName: {{vars.name}}\nCompany: {{vars.company_name}}\nEmail: {{vars.email}}\nWebsite/IG: {{vars.website}}\nBudget: {{vars.marketing_budget}}",
      } as HandoffNodeConfig,
    },
  ],
};

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
  unbox_lead_qualifier: UNBOX_LEAD_QUALIFIER,
  unbox_qualifier: UNBOX_QUALIFIER,
  unbox_organic_qualifier: UNBOX_ORGANIC_QUALIFIER,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
