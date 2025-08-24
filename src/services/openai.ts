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
      "The email can be archived without reading or responding. Examples: promotional emails, notifications, advertisements, cold inbound emails, automated invoice emails or receipts, and bills.",
  },
  examples: [
    { email: "Cold inbound emails", action: "to archive" },
    { email: "Login codes", action: "to archive" },
    { email: "Your order is on its way!", action: "to archive" },
    { email: "Build failed", action: "to read" },
    { email: "You have a new message from your friend", action: "to archive" },
    { email: "Action required: You have 10 expenses that need more info", action: "to archive" },
    { email: "Brex: Your purchase requires a receipt", action: "to archive" },
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
      email: "Hey Daniel, quick reminder to sign the lease by the 15th!",
      action: "to reply",
    },
    { email: "FYI - check this out", action: "to read" },
    { email: "Here’s your booking summary", action: "to archive" },
    { email: "Accepted: Standup @ Monday 9am", action: "to archive" },
    {
      email: "Calendar Invitation: Pizza Night @ Friday 6pm",
      action: "to archive",
    },
    { email: "Receipt: Docker Invoice Paid", action: "to archive" },
    { email: "John has joined your meeting", action: "to archive" },
    { email: "Sam has accepted your invitation", action: "to archive" },
    {
      email:
        'App Store Connect: The status of your app, Ash - AI Therapy, is now "Waiting for Review"',
      action: "to archive",
    },
    {
      email: "Neil Parikh marked an action item as done in the following document",
      action: "to archive",
    },
    {
      email: `Zeina Yasser Hashem resolved a comment in the following document`,
      action: "to archive",
    },
    {
      email: "Tomorrow's lunch, please confirm by 2pm today. For Monday, August 25.",
      action: "to archive",
    },
    {
      email: `From: Omar Awad <omar@revoultxmail.com>
To:   danielc@slingshot.xyz

Subject: Daniel, your thoughts on speeding up the hiring process...

Hi Daniel,
congrats on launching the AI Therapy app, crafting an empathetic digital companion that values user autonomy is truly making mental health support more accessible.
Saw your opening for a Senior Product Engineer at Slingshot AI, live since Jul 21. We can deliver a few vetted candidate profiles within 72 hours to help close the staffing gap and keep your team moving.
You only pay if you hire - zero upfront risk - all placements come with a 90-day candidate coverage.
Our team brings over 20 years of combined technical recruiting experience, specializing in placing highly skilled talents at fast-growing teams like Ambience AI, BlockFi, and NeuralChain Labs
Worth a quick 15-minute chat?
Best regards,
Omar`,
      action: "to archive",
    },
    {
      email: `From: Adam Pollack <adam@drivecapital.com>
To:   daniel@slingshot.xyz

Subject: Drive Capital/ Founder, Thiel Fellow

Hi Daniel!
I am a Partner at Drive Capital, a $3B fund focused on backing founders outside of Silicon Valley with check sizes ranging from 500K to $200M as a lead investor. Prior to Drive, I was a founder and turned to the dark side (VC) after my company was acquired.
I heard about Slingshot through the Thiel ecosystem and am very interested in what you're building. LMK if you got 30 minutes this week or next to explore ways we might be able to work together now or down the line.
My best,`,
      action: "to archive",
    },
    {
      email: "[Ashby] Your Daily Interview Briefing",
      action: "to archive",
    },
  ] satisfies {
    email: string;
    action: "to read" | "to reply" | "to archive";
  }[],
  input: {
    current_user_email: "{user_email}",
    email_content: "{email}",
  },
  output_format: {
    action: "<to read | to reply | to archive>",
  },
});

const PRICE_5_MINI_INPUT = 0.25 / 1_000_000;
const PRICE_5_MINI_OUTPUT = 2 / 1_000_000;

export async function categorizeEmail(
  email: string,
  userEmail: string,
  setCost?: Dispatch<SetStateAction<number>>,
): Promise<EmailCategory | null> {
  const response = await openai.chat.completions.parse({
    model: "gpt-5-mini",
    reasoning_effort: "low",
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
    PRICE_5_MINI_INPUT * inputTokens + PRICE_5_MINI_OUTPUT * outputTokens;
  setCost?.((c) => c + cost);

  return response.choices[0].message.parsed ?? null;
}
