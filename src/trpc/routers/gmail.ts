import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { getRedis } from "@/services/redis";
import { categorizeEmail, EmailCategorySchema } from "@/services/openai";
import { gmail_v1 } from "googleapis";
import { GaxiosError } from "gaxios";

const EmailSchema = z.object({
  id: z.string(),
  subject: z.string(),
  from: z.string(),
  to: z.string(),
  date: z.string(),
  snippet: z.string(),
  bodyText: z.string(),
  labels: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});

// Rate limiting constants
const RATE_LIMIT_WINDOW = 100; // 100 seconds
const MAX_REQUESTS_PER_WINDOW = 250; // Gmail API quota is typically 250 requests per 100 seconds per user

async function checkRateLimit(userId: string): Promise<boolean> {
  const redis = getRedis();
  const key = `gmail-rate-limit:${userId}`;
  const current = await redis.incr(key);
  if (current === 1) {
    await redis.expire(key, RATE_LIMIT_WINDOW);
  }
  return current <= MAX_REQUESTS_PER_WINDOW;
}

async function handleGmailError(error: unknown): never {
  console.error("Gmail API error:", error);
  
  if (error instanceof GaxiosError) {
    const status = error.response?.status;
    const message = error.response?.data?.error?.message || error.message;
    
    if (status === 429 || message?.includes("Resource has been exhausted")) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Gmail API quota exceeded. Please try again later.",
      });
    }
    
    if (status === 403) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Access denied. Please check your Gmail permissions.",
      });
    }
  }
  
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An error occurred while accessing Gmail. Please try again later.",
  });
}

async function getGmailLabels(
  gmail: gmail_v1.Gmail,
): Promise<Map<string, string>> {
  const redis = getRedis();
  const cachedLabels = await redis.get("gmail-labels");

  if (cachedLabels) {
    return new Map(JSON.parse(cachedLabels));
  }

  const labelsResponse = await gmail.users.labels.list({
    userId: "me",
  });

  if (!labelsResponse.data.labels) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Error fetching labels",
    });
  }

  const labelMap = new Map(
    labelsResponse.data.labels.map((label) => [label.id!, label.name!]) || [],
  );

  // Cache the labels for 1 hour
  await redis.set(
    "gmail-labels",
    JSON.stringify(Array.from(labelMap.entries())),
    "EX",
    3600,
  );

  return labelMap;
}

export const gmailRouter = router({
  getRecentEmails: publicProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(10),
      }),
    )
    .output(
      z.object({
        items: z.array(EmailSchema),
        nextCursor: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!ctx.gmail || !ctx.session?.user?.email) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const canProceed = await checkRateLimit(ctx.session.user.email);
      if (!canProceed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded. Please try again later.",
        });
      }

      try {
        const labelMap = await getGmailLabels(ctx.gmail);

        const threadResponse = await ctx.gmail.users.threads.list({
          userId: "me",
          maxResults: input.limit,
          q: "in:inbox",
          pageToken: input.cursor,
        });

        if (!threadResponse.data.threads?.length) {
          return {
            items: [],
            nextCursor: undefined,
          };
        }

        const threadsWithMessages = await Promise.all(
          threadResponse.data.threads.map(async (thread) => {
            const threadDetails = await ctx.gmail.users.threads.get({
              userId: "me",
              id: thread.id!,
            });
            const firstMessage = threadDetails.data.messages?.[0];
            if (!firstMessage) return null;

            const headers = firstMessage.payload?.headers;
            const labels =
              firstMessage.labelIds?.map((labelId) => ({
                id: labelId,
                name: labelMap.get(labelId) || labelId,
              })) || [];

            const payload = firstMessage.payload;
            const body = payload?.parts?.find(
              (part) => part.mimeType === "text/plain",
            );
            // Replace invalid base64url characters and add padding if needed
            const base64Data = (body?.body?.data || "")
              .replace(/-/g, "+")
              .replace(/_/g, "/")
              .padEnd(
                (body?.body?.data || "").length +
                  ((4 - ((body?.body?.data || "").length % 4)) % 4),
                "=",
              );
            // Use TextDecoder for proper UTF-8 decoding
            const bodyText = new TextDecoder().decode(
              Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)),
            );

            // Remove any URLs
            const bodyTextWithoutUrls = bodyText.replace(
              /(https?:\/\/[^\s]+)/g,
              "URL OMITTED",
            );

            const bodyToSend =
              bodyTextWithoutUrls.length > 10000
                ? firstMessage.snippet + "..."
                : bodyTextWithoutUrls;

            if (!firstMessage.id) {
              return null;
            }

            return {
              id: firstMessage.id,
              subject:
                headers?.find((h) => h.name === "Subject")?.value ||
                "No Subject",
              from: headers?.find((h) => h.name === "From")?.value || "",
              to: headers?.find((h) => h.name === "To")?.value || "",
              date: headers?.find((h) => h.name === "Date")?.value || "",
              snippet: firstMessage.snippet || "",
              bodyText: bodyToSend,
              labels,
            };
          }),
        );

        const items = threadsWithMessages.filter(
          (thread): thread is NonNullable<typeof thread> => thread !== null,
        );

        return {
          items,
          nextCursor: threadResponse.data.nextPageToken || undefined,
        };
      } catch (error) {
        await handleGmailError(error);
      }
    }),
  categorizeEmail: publicProcedure
    .input(
      z.object({
        email: EmailSchema,
      }),
    )
    .query(async ({ input, ctx }) => {
      const currentUserEmailAddress = ctx.userEmail;
      if (!currentUserEmailAddress) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User email address not found",
        });
      }
      const redis = getRedis();
      const formattedEmail = `From: ${input.email.from}\nTo: ${input.email.to}\nSubject: ${input.email.subject}\nBody: ${input.email.bodyText.substring(0, 5000)}`;
      const cached = await redis.get(`email-categorization:${input.email.id}`);
      if (cached) {
        // Try to parse with EmailCategorySchema
        const parsed = EmailCategorySchema.safeParse(JSON.parse(cached));
        if (parsed.success) {
          return parsed.data;
        }
        // Else, rerun
      }
      const result = await categorizeEmail(
        formattedEmail,
        currentUserEmailAddress,
      );
      if (!result) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error categorizing email",
        });
      }
      await redis.set(
        `email-categorization:${input.email.id}`,
        JSON.stringify(result),
      );
      return result;
    }),
  addLabel: publicProcedure
    .input(
      z.object({
        emailId: z.string(),
        labelName: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const labelName = "ai:" + input.labelName.toLowerCase();
      if (!ctx.gmail) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const labelMap = await getGmailLabels(ctx.gmail);

        // Check if label exists in cache
        const existingLabel = Array.from(labelMap.entries()).find(
          ([, name]) => name === labelName,
        );

        if (existingLabel) {
          return { success: true, labelId: existingLabel[0] };
        }

        // If label doesn't exist, create it and update cache
        const createResponse = await ctx.gmail.users.labels.create({
          userId: "me",
          requestBody: {
            name: labelName,
            labelListVisibility: "labelShow",
            messageListVisibility: "show",
          },
        });

        // Invalidate cache to force refresh on next request
        await getRedis().del("gmail-labels");

        // Add the label to the email
        await ctx.gmail.users.messages.modify({
          userId: "me",
          id: input.emailId,
          requestBody: {
            addLabelIds: [createResponse.data.id!],
          },
        });

        return { success: true };
      } catch (error) {
        console.error("Error adding label:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error adding label to email",
        });
      }
    }),
  bulkCategorizeAndLabel: publicProcedure
    .input(
      z.object({
        emails: z.array(EmailSchema),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.gmail || !ctx.session?.user?.email) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const canProceed = await checkRateLimit(ctx.session.user.email);
      if (!canProceed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Rate limit exceeded. Please try again later.",
        });
      }

      // Process in smaller batches to avoid hitting rate limits
      const BATCH_SIZE = 10;
      const batches = [];
      for (let i = 0; i < input.emails.length; i += BATCH_SIZE) {
        batches.push(input.emails.slice(i, i + BATCH_SIZE));
      }

      const results = [];
      let skippedCount = 0;

      for (const batch of batches) {
        try {
          // Process the batch
          const batchResults = await Promise.all(
            batch.map(async (email) => {
              const currentUserEmailAddress = ctx.userEmail;
              if (!currentUserEmailAddress) {
                throw new TRPCError({
                  code: "UNAUTHORIZED",
                  message: "User email address not found",
                });
              }
              const redis = getRedis();
              const formattedEmail = `From: ${email.from}\nTo: ${email.to}\nSubject: ${email.subject}\nBody: ${email.bodyText.substring(0, 5000)}`;
              const cached = await redis.get(`email-categorization:${email.id}`);
              if (cached) {
                // Try to parse with EmailCategorySchema
                const parsed = EmailCategorySchema.safeParse(JSON.parse(cached));
                if (parsed.success) {
                  return parsed.data;
                }
                // Else, rerun
              }
              const result = await categorizeEmail(
                formattedEmail,
                currentUserEmailAddress,
              );
              if (!result) {
                throw new TRPCError({
                  code: "INTERNAL_SERVER_ERROR",
                  message: "Error categorizing email",
                });
              }
              await redis.set(
                `email-categorization:${email.id}`,
                JSON.stringify(result),
              );
              return result;
            })
          );
          
          results.push(...batchResults.filter(r => r !== null));
          
          // Add a small delay between batches
          if (batches.length > 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          await handleGmailError(error);
        }
      }

      return {
        success: true,
        results: results.filter((r): r is NonNullable<typeof r> => r !== null),
        skippedCount,
      };
    }),
});
