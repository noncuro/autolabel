import { gmail_v1, google } from "googleapis";
import { categorizeEmail } from "./openai";
import {
  getAllGmailCredentials,
  getGmailCredentials,
  getRedis,
  saveGmailCredentials,
} from "./redis";

interface GmailAuthResult {
  gmail: gmail_v1.Gmail;
  credentials: {
    accessToken: string;
    refreshToken: string;
    expiresAt?: number;
  };
}

// Add this helper function to track processed emails
export const isEmailProcessed = async (
  email: string,
  messageId: string,
): Promise<boolean> => {
  const key = `processed:${email}:${messageId}`;
  const result = await getRedis().get(key);
  return result !== null;
};

export const markEmailProcessed = async (
  email: string,
  messageId: string,
): Promise<void> => {
  const key = `processed:${email}:${messageId}`;
  // Store with 7 day expiration to prevent Redis from growing too large
  await getRedis().set(key, "1", "EX", 60 * 60 * 24 * 7);
};

export const authenticateGmail = async (
  email: string,
): Promise<GmailAuthResult | null> => {
  try {
    console.log(`Authenticating Gmail for ${email}...`);
    const credentials = await getGmailCredentials(email);
    if (!credentials) {
      console.log(`No credentials found for ${email}`);
      return null;
    }

    console.log(
      `Got credentials for ${email}, expires at: ${credentials.expiresAt ? new Date(credentials.expiresAt * 1000).toISOString() : "unknown"}`,
    );

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL,
    );

    oauth2Client.setCredentials({
      access_token: credentials.accessToken,
      refresh_token: credentials.refreshToken,
      expiry_date: credentials.expiresAt
        ? credentials.expiresAt * 1000
        : undefined,
    });

    // Always refresh token to ensure it's fresh
    try {
      console.log(`Refreshing token for ${email}...`);
      const { credentials: newCredentials } =
        await oauth2Client.refreshAccessToken();
      console.log(`Successfully refreshed token for ${email}`);

      // Save new credentials to Redis
      const updatedCredentials = {
        accessToken: newCredentials.access_token!,
        refreshToken: credentials.refreshToken, // Keep existing refresh token
        expiresAt: Math.floor(
          (Date.now() + (newCredentials.expiry_date || 3600 * 1000)) / 1000,
        ),
      };

      await saveGmailCredentials(email, updatedCredentials);
      oauth2Client.setCredentials(newCredentials);
      credentials.accessToken = newCredentials.access_token!;
      credentials.expiresAt = updatedCredentials.expiresAt;
    } catch (error) {
      console.error(`Failed to refresh token for ${email}:`, error);
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          name: error.name,
          stack: error.stack,
        });
      }
      return null;
    }

    // Verify the credentials work by making a simple API call
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });
    try {
      console.log(`Testing Gmail API access for ${email}...`);
      await gmail.users.getProfile({ userId: "me" });
      console.log(`Successfully verified Gmail API access for ${email}`);
    } catch (error) {
      console.error(`Failed to verify Gmail API access for ${email}:`, error);
      if (error instanceof Error) {
        console.error("Error details:", {
          message: error.message,
          name: error.name,
          stack: error.stack,
        });
      }
      return null;
    }

    return {
      gmail,
      credentials,
    };
  } catch (error) {
    console.error(
      `Unexpected error during Gmail authentication for ${email}:`,
      error,
    );
    if (error instanceof Error) {
      console.error("Error details:", {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });
    }
    return null;
  }
};

export const getLabels = async (
  gmail: gmail_v1.Gmail,
): Promise<Map<string, string>> => {
  const labelsResponse = await gmail.users.labels.list({
    userId: "me",
  });

  if (!labelsResponse.data.labels) {
    throw new Error("Error fetching labels");
  }

  return new Map(
    labelsResponse.data.labels.map((label) => [label.id!, label.name!]) || [],
  );
};

export const ensureLabelsExist = async (
  gmail: gmail_v1.Gmail,
  labelNames: string[],
): Promise<Map<string, string>> => {
  const labelMap = await getLabels(gmail);
  const labelIds = new Map<string, string>();

  await Promise.all(
    labelNames.map(async (labelName) => {
      const existingLabel = Array.from(labelMap.entries()).find(
        ([, name]) => name === labelName,
      );

      if (existingLabel) {
        labelIds.set(labelName, existingLabel[0]);
        return;
      }

      const createResponse = await gmail.users.labels.create({
        userId: "me",
        requestBody: {
          name: labelName,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });

      labelIds.set(labelName, createResponse.data.id!);
    }),
  );

  return labelIds;
};

export interface EmailMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  bodyText: string;
  date: string;
  snippet: string;
}

export const processUserEmails = async (
  emailAddress: string,
  options: {
    processAll?: boolean;
    batchSize?: number;
  } = {}
): Promise<{
  email: string;
  success: boolean;
  processedCount?: number;
  skippedCount?: number;
  error?: string;
}> => {
  try {
    const auth = await authenticateGmail(emailAddress);
    if (!auth) {
      return {
        email: emailAddress,
        success: false,
        error: "Failed to authenticate",
      };
    }

    const { gmail } = auth;
    let processedCount = 0;
    let skippedCount = 0;
    let pageToken: string | undefined;

    do {
      // Get emails in batches
      const threadResponse = await gmail.users.threads.list({
        userId: "me",
        maxResults: options.batchSize || 20,
        q: "in:inbox",
        pageToken,
      });

      if (!threadResponse.data.threads?.length) {
        break;
      }

      // Get full thread details
      const emails = await Promise.all(
        threadResponse.data.threads.map(async (thread) => {
          const threadDetails = await gmail.users.threads.get({
            userId: "me",
            id: thread.id!,
          });

          const message =
            threadDetails.data.messages?.[threadDetails.data.messages.length - 1];
          if (!message || !message.payload?.headers) return null;

          const headers = message.payload.headers;
          const body = message.payload.parts?.find(
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

          const bodyText = new TextDecoder()
            .decode(Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0)))
            .replace(/(https?:\/\/[^\s]+)/g, "URL OMITTED");

          return {
            id: message.id!,
            subject:
              headers.find((h) => h.name === "Subject")?.value || "No Subject",
            from: headers.find((h) => h.name === "From")?.value || "",
            to: headers.find((h) => h.name === "To")?.value || "",
            date: headers.find((h) => h.name === "Date")?.value || "",
            snippet: message.snippet || "",
            bodyText:
              bodyText.length > 10000 ? message.snippet + "..." : bodyText,
            labels: message.labelIds,
          };
        }),
      );

      const validEmails = emails.filter(
        (e): e is NonNullable<typeof e> => e !== null,
      );

      // Ensure labels exist
      const labelNameToId = await ensureLabelsExist(gmail, [
        "To Read",
        "To Reply",
        "To Archive",
      ]);

      // Process each email
      const results = await Promise.all(
        validEmails.map(async (email) => {
          // Check if email was already processed
          if (await isEmailProcessed(emailAddress, email.id)) {
            return null;
          }

          const formattedEmail = `From: ${email.from}\nTo: ${email.to}\nSubject: ${email.subject}\nBody: ${email.bodyText.substring(0, 5000)}`;
          const categories = await categorizeEmail(formattedEmail, email.to);

          if (!categories) return null;

          const labelsToAdd: string[] = [];
          if (categories.action === "to read") {
            const id = labelNameToId.get("To Read");
            if (id) labelsToAdd.push(id);
          } else if (categories.action === "to reply") {
            const id = labelNameToId.get("To Reply");
            if (id) labelsToAdd.push(id);
          } else if (categories.action === "to archive") {
            const id = labelNameToId.get("To Archive");
            if (id) labelsToAdd.push(id);
          }

          if (labelsToAdd.length > 0) {
            const existingLabelIds = new Set((email.labels || []).map(l => l.toLowerCase()));
            const targetLabelId = labelsToAdd[0];
            const targetLabelName = categories.action;

            console.log({
              existingLabelIds,
              targetLabelId,
              targetLabelName,
            })
            
            const labelsToModify = {
              addLabelIds: existingLabelIds.has(targetLabelId.toLowerCase()) ? [] : [targetLabelId],
              removeLabelIds: Array.from(labelNameToId.entries())
                .filter(([name, id]) => 
                  // Only include management labels that aren't the target label
                  name.toLowerCase() !== targetLabelName && 
                  ['to read', 'to reply', 'to archive'].includes(name.toLowerCase()) &&
                  existingLabelIds.has(id.toLowerCase())
                )
                .map(([, id]) => id)
            };

            // Only make API call if there are labels to add or remove
            if (labelsToModify.addLabelIds.length > 0 || labelsToModify.removeLabelIds.length > 0) {
              console.log("Modifying labels:", labelsToModify);
              await gmail.users.messages.modify({
                userId: "me",
                id: email.id,
                requestBody: labelsToModify,
              });
            }

            // Mark email as processed after successful modification
            await markEmailProcessed(emailAddress, email.id);
          }

          return {
            emailId: email.id,
            categories,
            addedLabels: labelsToAdd,
          };
        }),
      );

      const processedResults = results.filter(
        (r): r is NonNullable<typeof r> => r !== null,
      );

      processedCount += processedResults.length;
      skippedCount += validEmails.length - processedResults.length;

      // Get next page token if processing all emails
      pageToken = options.processAll ? threadResponse.data.nextPageToken ?? undefined : undefined;
      console.log("Processed", processedCount, "skipped", skippedCount, "pageToken", pageToken, "for", emailAddress);
    } while (pageToken);

    return {
      email: emailAddress,
      success: true,
      processedCount,
      skippedCount,
    };
  } catch (error) {
    console.error(`Error processing emails for ${emailAddress}:`, error);
    return {
      email: emailAddress,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
};

export const processBatchEmails = async (options?: {
  processAll?: boolean;
  batchSize?: number;
}): Promise<{
  success: boolean;
  results: Array<{
    email: string;
    success: boolean;
    processedCount?: number;
    skippedCount?: number;
    error?: string;
  }>;
}> => {
  const allCredentials = await getAllGmailCredentials();
  const results = await Promise.all(
    allCredentials.map(({ email }) => processUserEmails(email, options)),
  );

  return {
    success: true,
    results,
  };
};
