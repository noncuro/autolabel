import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { Dispatch, SetStateAction } from "react";
import { z } from "zod";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const EmailCategorySchema = z.object({
  explanation: z.string(),
  is_cold_inbound: z.boolean(),
  is_recruiting: z.boolean(),
  is_internal: z.boolean(),
  is_updates: z.boolean(),
  is_promotional: z.boolean(),
});

// Type can be inferred from the schema
type EmailCategory = z.infer<typeof EmailCategorySchema>;

const systemPrompt = `
You are a helpful assistant that categorizes emails.
`;

const userPrompt = `
Please categorize with a JSON response whether the email is:
- cold inbound: the email is from someone we don't know, for example someone looking for a job or selling their services.
- recruiting: the email is related to recruiting, either from a recruiter or a candidate.
- internal: the email is from someone you know and is not a recruiter
- updates: the email is from a vendor or service provider providing an automated update or notification
- promotional: the email is from a vendor or service provider promoting a product or service

You will be given an email and you will need to determine which category it belongs to. Note that an email can belong to multiple categories.

<current_user_email>
{user_email}
</current_user_email>

<email>
{email}
</email>
`.trim();

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
      { role: "user", content: userPrompt.replace("{email}", email).replace("{user_email}", userEmail) },
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
