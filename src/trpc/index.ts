import { router, publicProcedure, createCallerFactory } from './trpc';
import type { GaxiosResponse } from 'googleapis-common';
import { gmail_v1 } from 'googleapis';
import { TRPCError } from '@trpc/server';

export const appRouter = router({
  hello: publicProcedure.query(() => 'Hello World'),
  getRecentEmail: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.gmail) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    try {
      const response = await ctx.gmail.users.messages.list({
        userId: 'me',
        maxResults: 1,
      });

      if (!response.data.messages?.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No emails found' });
      }

      const messageId = response.data.messages[0].id!;
      const message: GaxiosResponse<gmail_v1.Schema$Message> = await ctx.gmail.users.messages.get({
        userId: 'me',
        id: messageId,
      });

      const headers = message.data.payload?.headers;
      const subject = headers?.find((h) => h.name === 'Subject')?.value;
      const from = headers?.find((h) => h.name === 'From')?.value;
      const snippet = message.data.snippet;

      return {
        subject,
        from,
        snippet,
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
export const createCaller = createCallerFactory(appRouter);
