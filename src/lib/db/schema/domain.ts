import { sqliteTable, text, integer, uniqueIndex, index, primaryKey } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";

export const organizationSettings = sqliteTable("organization_settings", {
  orgId: text("org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),
  metaPhoneId: text("meta_phone_id"),
  metaWabaId: text("meta_waba_id"),
  metaAppId: text("meta_app_id"),
  metaAccessTokenEnc: text("meta_access_token_enc"),
  metaAppSecretEnc: text("meta_app_secret_enc"),
  metaVerifyToken: text("meta_verify_token"),
  forwardUrl: text("forward_url"),
  optoutKeywords: text("optout_keywords").notNull().default('["STOP","BAJA","UNSUBSCRIBE","CANCELAR"]'),
  rateLimitMps: integer("rate_limit_mps").notNull().default(20),
  defaultCountry: text("default_country").notNull().default("CO"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    email: text("email"),
    customFields: text("custom_fields").notNull().default("{}"),
    optOutAt: integer("opt_out_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    orgPhoneUnique: uniqueIndex("contacts_org_phone_unique").on(t.orgId, t.phone),
    orgIdx: index("contacts_org_idx").on(t.orgId),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#888888"),
  },
  (t) => ({
    orgNameUnique: uniqueIndex("tags_org_name_unique").on(t.orgId, t.name),
  }),
);

export const contactTags = sqliteTable(
  "contact_tags",
  {
    contactId: text("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
    tagId: text("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contactId, t.tagId] }),
    tagIdx: index("contact_tags_tag_idx").on(t.tagId),
  }),
);

export const segments = sqliteTable("segments", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ruleJson: text("rule_json").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const campaigns = sqliteTable(
  "campaigns",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateName: text("template_name").notNull(),
    templateLanguage: text("template_language").notNull(),
    headerType: text("header_type").notNull().default("NONE"),
    headerHandle: text("header_handle"),
    templateType: text("template_type").notNull().default("standard"),
    componentPlanJson: text("component_plan_json"),
    source: text("source").notNull(),
    segmentId: text("segment_id").references(() => segments.id, { onDelete: "set null" }),
    scheduledAt: integer("scheduled_at", { mode: "timestamp" }),
    status: text("status").notNull().default("draft"),
    total: integer("total").notNull().default(0),
    sent: integer("sent").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    read: integer("read_count").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    replied: integer("replied").notNull().default(0),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    orgIdx: index("campaigns_org_idx").on(t.orgId, t.createdAt),
  }),
);

export const campaignRecipients = sqliteTable(
  "campaign_recipients",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    campaignId: text("campaign_id").notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    phone: text("phone").notNull(),
    name: text("name"),
    params: text("params").notNull().default("{}"),
    status: text("status").notNull().default("pending"),
    wamid: text("wamid"),
    error: text("error"),
    sentAt: integer("sent_at", { mode: "timestamp" }),
  },
  (t) => ({
    campaignIdx: index("recipients_campaign_idx").on(t.campaignId),
    wamidIdx: index("recipients_wamid_idx").on(t.wamid),
  }),
);

export const messageEvents = sqliteTable(
  "message_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    wamid: text("wamid").notNull(),
    event: text("event").notNull(),
    timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
    payload: text("payload").notNull().default("{}"),
  },
  (t) => ({
    wamidIdx: index("events_wamid_idx").on(t.wamid),
  }),
);

export const templateFavorites = sqliteTable(
  "template_favorites",
  {
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    templateName: text("template_name").notNull(),
    templateLanguage: text("template_language").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.userId, t.templateName, t.templateLanguage] }),
  }),
);

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "image" | "video"
    mime: text("mime").notNull(),
    path: text("path").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("media_assets_org_idx").on(t.orgId) }),
);

export const templateCardMedia = sqliteTable(
  "template_card_media",
  {
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    templateName: text("template_name").notNull(),
    templateLanguage: text("template_language").notNull(),
    cardIndex: integer("card_index").notNull(),
    assetId: text("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.orgId, t.templateName, t.templateLanguage, t.cardIndex] }),
  }),
);

export const subscriptions = sqliteTable("subscriptions", {
  orgId: text("org_id").primaryKey().references(() => organization.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["none", "active", "suspended"] }).notNull().default("none"),
  paidUntil: integer("paid_until", { mode: "timestamp" }),
  efipaySubscriptionId: text("efipay_subscription_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const subscriptionCharges = sqliteTable("subscription_charges", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  amountCop: integer("amount_cop"),
  source: text("source", { enum: ["efipay", "manual"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const billingCheckouts = sqliteTable("billing_checkouts", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const appConfig = sqliteTable("app_config", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    contactId: text("contact_id").references(() => contacts.id, { onDelete: "set null" }),
    lastMessageAt: integer("last_message_at", { mode: "timestamp" }).notNull(),
    lastIncomingAt: integer("last_incoming_at", { mode: "timestamp" }),
    unreadCount: integer("unread_count").notNull().default(0),
    status: text("status", { enum: ["open", "resolved"] }).notNull().default("open"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    orgPhoneUnique: uniqueIndex("conversations_org_phone").on(t.orgId, t.phone),
  }),
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    wamid: text("wamid"),
    type: text("type").notNull(),
    body: text("body"),
    mediaId: text("media_id"),
    status: text("status", { enum: ["pending", "sent", "delivered", "read", "failed"] }),
    errorMessage: text("error_message"),
    payloadJson: text("payload_json"),
    replyToWamid: text("reply_to_wamid"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    convCreatedIdx: index("messages_conv_created").on(t.conversationId, t.createdAt),
    orgWamidIdx: index("messages_org_wamid").on(t.orgId, t.wamid),
  }),
);

export const inboxMediaCache = sqliteTable("inbox_media_cache", {
  metaMediaId: text("meta_media_id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
  assetId: text("asset_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const quickReplies = sqliteTable(
  "quick_replies",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    shortcut: text("shortcut").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("quick_replies_org").on(t.orgId)],
);

export const messageReactions = sqliteTable(
  "message_reactions",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    targetWamid: text("target_wamid").notNull(),
    direction: text("direction", { enum: ["in", "out"] }).notNull(),
    emoji: text("emoji").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    uniqueTarget: uniqueIndex("message_reactions_target").on(t.orgId, t.targetWamid, t.direction),
    convIdx: index("message_reactions_conv").on(t.conversationId),
  }),
);

export const stickers = sqliteTable(
  "stickers",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    assetId: text("asset_id").notNull().references(() => mediaAssets.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ orgIdx: index("stickers_org").on(t.orgId) }),
);

export const conversationNotes = sqliteTable(
  "conversation_notes",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => organization.id, { onDelete: "cascade" }),
    conversationId: text("conversation_id").notNull().references(() => conversations.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    authorName: text("author_name").notNull(),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({ convIdx: index("conversation_notes_conv").on(t.conversationId, t.createdAt) }),
);
