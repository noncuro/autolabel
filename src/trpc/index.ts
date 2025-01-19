import { router, publicProcedure } from './trpc';
import { google } from 'googleapis';
import type { GaxiosResponse } from 'googleapis-common';
import { gmail_v1 } from 'googleapis';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { TRPCError } from '@trpc/server';

export const appRouter = router({
  hello: publicProcedure.query(() => 'Hello World'),
  getRecentEmail: publicProcedure.query(async () => {
    const session = await getServerSession(authOptions);
  
    if (!session?.accessToken) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    try {
      const oauth2Client = new google.auth.OAuth2();
      oauth2Client.setCredentials({
        access_token: session.accessToken as string,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,
      });

      if (!response.data.messages?.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No emails found' });
      }

      const messageId = response.data.messages[0].id!;
      const message: GaxiosResponse<gmail_v1.Schema$Message> = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });

      const headers = message.data.payload?.headers;
      const subject = headers?.find((h) => h.name === 'Subject')?.value;
      const from = headers?.find((h) => h.name === 'From')?.value;
      const body = message.data.snippet;

      return {
        subject,
        from,
        body,
      };
    } catch (error) {
      console.error('Error fetching email:', error);
      throw new TRPCError({ 
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error fetching email'
      });
    }
  }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;