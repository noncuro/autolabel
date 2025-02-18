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

const userPrompt = `
Please categorize with a JSON response which inbox action the email should be: "to read", "to reply", or "to archive".

To read: the email should be read by the user, but probably doesn't need a reply. For example, a newsletter, a product update, a blog post, or an email sent to a teammate.
To reply: the email should be replied to by the user. For example, an important email send by a friend directly to the user, an email from a customer, client, investor, or coworker.
To archive: the email will probably not be read by the user, and will likely be archived. For example, a promotional email, a notification from a service provider, an advertisement, a cold inbound email. 

Cold inbound emails should almost always be put in "To archive".
Login codes should be put in "To archive".
An important email sent to a teammate CC'ing the user should usually be put in "To read".
Notifications from services should almost always be put in "To archive".


You will be given an email and you will need to determine which category it belongs to.

In the explanation field, mention if the email is a cold inbound email, a product update, a newsletter, a blog post, an advertisement, a notification from a service provider, or similar categories. Mention all relevant tags this email could recieve.

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
