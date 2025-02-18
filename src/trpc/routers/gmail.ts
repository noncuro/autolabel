import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../trpc";
import { getRedis } from "@/services/redis";
import { categorizeEmail, EmailCategorySchema } from "@/services/openai";
import { gmail_v1 } from "googleapis";

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
    60 * 60, // 1 hour
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
      if (!ctx.gmail) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
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
        console.error("Error fetching email threads:", error);
        if (error instanceof Error) {
          console.error("Error details:", {
            message: error.message,
            name: error.name,
            stack: error.stack?.split("\n").slice(0, 10).join("\n"),
          });

          // Log the full error object for debugging
          if ("config" in error) {
            console.error("Request config:", {
              url: (error as any).config?.url,
              headers: (error as any).config?.headers,
              params: (error as any).config?.params,
            });
          }
          if ("response" in error) {
            console.error("Response data:", (error as any).response?.data);
          }
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error fetching email threads",
        });
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
      if (!ctx.gmail) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      const currentUserEmailAddress = ctx.userEmail;
      if (!currentUserEmailAddress) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "User email address not found",
        });
      }

      const redis = getRedis();

      // First, ensure all possible labels exist and get their IDs
      const possibleLabels = ["To Read", "To Reply", "To Archive"];
      const labelMap = await getGmailLabels(ctx.gmail);
      
      const labelIds = new Map<string, string>();
      
      await Promise.all(
        possibleLabels.map(async (labelName) => {
          const aiLabelName = "ai:" + labelName.toLowerCase();
          
          // Check if label exists in cache
          const existingLabel = Array.from(labelMap.entries()).find(
            ([, name]) => name === aiLabelName,
          );

          if (existingLabel) {
            labelIds.set(labelName, existingLabel[0]);
            return;
          }

          // If label doesn't exist, create it
          const createResponse = await ctx.gmail.users.labels.create({
            userId: "me",
            requestBody: {
              name: aiLabelName,
              labelListVisibility: "labelShow",
              messageListVisibility: "show",
            },
          });

          labelIds.set(labelName, createResponse.data.id!);
        }),
      );

      // Invalidate cache since we might have created new labels
      // await getRedis().del("gmail-labels");

      // Filter out already processed emails
      const emailsToProcess = await Promise.all(
        input.emails.map(async (email) => {
          const processed = await redis.get(`email-processed:${email.id}`);
          return processed ? null : email;
        })
      );

      const filteredEmails = emailsToProcess.filter((email): email is NonNullable<typeof email> => email !== null);

      // Now process all unprocessed emails with the known label IDs
      const results = await Promise.all(
        filteredEmails.map(async (email) => {
          const formattedEmail = `From: ${email.from}\nTo: ${email.to}\nSubject: ${email.subject}\nBody: ${email.bodyText.substring(0, 5000)}`;
          const categories = await categorizeEmail(formattedEmail, currentUserEmailAddress);
          if (!categories) return null;

          // Collect all applicable label IDs
          const labelsToAdd: string[] = [];
          if (categories.is_cold_inbound) {
            const id = labelIds.get("Cold Inbound");
            if (id) labelsToAdd.push(id);
          }
          if (categories.is_recruiting) {
            const id = labelIds.get("Recruiting");
            if (id) labelsToAdd.push(id);
          }
          if (categories.is_internal) {
            const id = labelIds.get("Internal");
            if (id) labelsToAdd.push(id);
          }
          if (categories.is_updates) {
            const id = labelIds.get("Updates");
            if (id) labelsToAdd.push(id);
          }
          if (categories.is_promotional) {
            const id = labelIds.get("Promotional");
            if (id) labelsToAdd.push(id);
          }

          if (labelsToAdd.length > 0) {
            // Add all applicable labels in one API call
            await ctx.gmail.users.messages.modify({
              userId: "me",
              id: email.id,
              requestBody: {
                addLabelIds: labelsToAdd,
              },
            });
          }

          // Mark email as processed in Redis (keep for 30 days)
          await redis.set(`email-processed:${email.id}`, "true", "EX", 60 * 60 * 24 * 30);

          return {
            emailId: email.id,
            categories,
            addedLabels: labelsToAdd,
          };
        }),
      );

      return {
        success: true,
        results: results.filter((r): r is NonNullable<typeof r> => r !== null),
        skippedCount: input.emails.length - filteredEmails.length,
      };
    }),
  markAsArchived: publicProcedure
    .input(
      z.object({
        emailId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.gmail) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      await ctx.gmail.users.messages.modify({
        userId: "me",
        id: input.emailId,
        requestBody: {
          removeLabelIds: ["INBOX"],
        },
      });

      return { success: true };
    }),
  getIndividualEmails: publicProcedure
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
      if (!ctx.gmail) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        const labelMap = await getGmailLabels(ctx.gmail);

        const messagesResponse = await ctx.gmail.users.messages.list({
          userId: "me",
          maxResults: input.limit,
          q: "in:inbox",
          pageToken: input.cursor,
        });

        if (!messagesResponse.data.messages?.length) {
          return {
            items: [],
            nextCursor: undefined,
          };
        }

        const messages = await Promise.all(
          messagesResponse.data.messages.map(async (message) => {
            const messageDetails = await ctx.gmail.users.messages.get({
              userId: "me",
              id: message.id!,
            });

            const headers = messageDetails.data.payload?.headers;
            const labels =
              messageDetails.data.labelIds?.map((labelId) => ({
                id: labelId,
                name: labelMap.get(labelId) || labelId,
              })) || [];

            const payload = messageDetails.data.payload;
            const body = payload?.parts?.find(
              (part) => part.mimeType === "text/plain",
            );
            
            const base64Data = (body?.body?.data || "")
              .replace(/-/g, "+")
              .replace(/_/g, "/")
              .padEnd(
                (body?.body?.data || "").length +
                  ((4 - ((body?.body?.data || "").length % 4)) % 4),
                "=",
              );
            
            const bodyText = new TextDecoder().decode(
              Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)),
            );

            const bodyTextWithoutUrls = bodyText.replace(
              /(https?:\/\/[^\s]+)/g,
              "URL OMITTED",
            );

            const bodyToSend =
              bodyTextWithoutUrls.length > 10000
                ? messageDetails.data.snippet + "..."
                : bodyTextWithoutUrls;

            return {
              id: messageDetails.data.id!,
              subject:
                headers?.find((h) => h.name === "Subject")?.value ||
                "No Subject",
              from: headers?.find((h) => h.name === "From")?.value || "",
              to: headers?.find((h) => h.name === "To")?.value || "",
              date: headers?.find((h) => h.name === "Date")?.value || "",
              snippet: messageDetails.data.snippet || "",
              bodyText: bodyToSend,
              labels,
            };
          }),
        );

        return {
          items: messages,
          nextCursor: messagesResponse.data.nextPageToken || undefined,
        };
      } catch (error) {
        console.error("Error fetching individual emails:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error fetching individual emails",
        });
      }
    }),
  bulkArchiveEmails: publicProcedure
    .input(
      z.object({
        emailIds: z.array(z.string()),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.gmail) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      try {
        await Promise.all(
          input.emailIds.map((emailId) =>
            ctx.gmail!.users.messages.modify({
              userId: "me",
              id: emailId,
              requestBody: {
                removeLabelIds: ["INBOX"],
              },
            }),
          ),
        );

        return { success: true };
      } catch (error) {
        console.error("Error bulk archiving emails:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Error archiving emails",
        });
      }
    }),
});
