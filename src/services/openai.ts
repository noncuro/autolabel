import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { Dispatch, SetStateAction } from "react";
import { z } from "zod";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const EmailCategorySchema = z.object({
  isColdInbound: z.boolean(),
  isUpdate: z.boolean(),
  isPromotional: z.boolean(),
  isAddressedToUser: z.boolean(),
  explanation: z.string(),
  action: z.enum(["to read", "to reply", "to archive"]),
});

// Type can be inferred from the schema
type EmailCategory = z.infer<typeof EmailCategorySchema>;

const systemPrompt = `
You are a helpful assistant that categorizes emails.
`;

const userPrompt = JSON.stringify({
  task: "Categorize an email into one of three actions: 'to read', 'to reply', or 'to archive'.",
  categories: {
    "to read":
      "The email should be read but likely does not require a reply. Examples: newsletters, product updates, blog posts, or emails sent to a teammate.",
    "to reply":
      "The email requires a response. Examples: direct emails from a friend, customer, client, investor, or coworker.",
    "to archive":
      "The email can be archived without reading or responding. Examples: promotional emails, notifications, advertisements, cold inbound emails.",
  },
  examples: [
    { email: "Cold inbound emails", action: "to archive" },
    { email: "Login codes", action: "to archive" },
    { email: "Your order is on its way!", action: "to archive" },
    { email: "Build failed", action: "to read" },
    {
      email: "We're making some changes to your terms of service",
      action: "to archive",
    },
    { email: "Spot email scams with these tips", action: "to archive" },
    { email: "Are we meeting up next week?", action: "to reply" },
    {
      email: "It was great meeting you! Should we catch up again soon?",
      action: "to reply",
    },
    {
      email: "I'm running late, but I'll be there in 10 minutes",
      action: "to reply",
    },
    { email: "Hi all — remember to sign out", action: "to read" },
    {
      email: "Important email sent to a teammate CC’ing you",
      action: "to read",
    },
    {
      email: "Important email sent by a teammate to someone else",
      action: "to read",
    },
    { email: "Your team is low on credits", action: "to archive" },
    { email: "App version 1.0.1 is now available", action: "to archive" },
    {
      email: "You're invited: How company valuations work",
      action: "to archive",
    },
    {
      email: "Remember to sign the lease by the 15th...",
      action: "to reply",
    },
    { email: "FYI - check this out", action: "to read" },
    { email: "Here’s your booking summary", action: "to read" },
    { email: "John has joined your meeting", action: "to archive" },
    { email: "Sam has accepted your invitation", action: "to archive" },
  ],
  input: {
    current_user_email: "{user_email}",
    email_content: "{email}",
  },
  output_format: {
    explanation:
      "Short reasoning, including comma separated tags such as 'cold inbound', 'newsletter', 'advertisement', 'notification', 'calendar', 'meeting', 'invoice', etc.",
    action: "<to read | to reply | to archive>",
  },
});

const PRICE_4_MINI_INPUT = 0.15 / 1_000_000;
const PRICE_4_MINI_OUTPUT = 0.6 / 1_000_000;

export async function categorizeEmail(
  email: string,
  userEmail: string,
  setCost?: Dispatch<SetStateAction<number>>,
): Promise<EmailCategory | null> {
  const response = await openai.beta.chat.completions.parse({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: userPrompt
          .replace("{email}", email)
          .replace("{user_email}", userEmail),
      },
    ],
    response_format: zodResponseFormat(EmailCategorySchema, "email_category"),
  });

  // Calculate costs
  const inputTokens = response.usage?.prompt_tokens ?? 0;
  const outputTokens = response.usage?.completion_tokens ?? 0;
  const cost =
    PRICE_4_MINI_INPUT * inputTokens + PRICE_4_MINI_OUTPUT * outputTokens;
  setCost?.((c) => c + cost);

  return response.choices[0].message.parsed ?? null;
}
