import { router, publicProcedure, createCallerFactory } from './trpc';
import type { GaxiosResponse } from 'googleapis-common';
import { gmail_v1 } from 'googleapis';
import { TRPCError } from '@trpc/server';

export const appRouter = router({
  hello: publicProcedure.query(() => 'Hello World'),
  getRecentEmails: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.gmail) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    try {
      const threadResponse = await ctx.gmail.users.threads.list({
        userId: 'me',
        maxResults: 10,
        q: 'in:inbox'
      });

      if (!threadResponse.data.threads?.length) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No email threads found' });
      }

      // Get all labels first to have their names
      const labelsResponse = await ctx.gmail.users.labels.list({
        userId: 'me'
      });
      
      const labelMap = new Map(
        labelsResponse.data.labels?.map(label => [label.id, label.name]) || []
      );

      const threadsWithMessages = await Promise.all(
        threadResponse.data.threads.map(async (thread) => {
          const threadDetails = await ctx.gmail.users.threads.get({
            userId: 'me',
            id: thread.id!,
          });
          const firstMessage = threadDetails.data.messages?.[0];
          if (!firstMessage) return null;

          const headers = firstMessage.payload?.headers;
          const labels = firstMessage.labelIds?.map(labelId => ({
            id: labelId,
            name: labelMap.get(labelId) || labelId
          })) || [];

          return {
            id: firstMessage.id,
            subject: headers?.find((h) => h.name === 'Subject')?.value || 'No Subject',
            from: headers?.find((h) => h.name === 'From')?.value || '',
            to: headers?.find((h) => h.name === 'To')?.value || '',
            date: headers?.find((h) => h.name === 'Date')?.value || '',
            snippet: firstMessage.snippet || '',
            labels,
          };
        })
      );

      return threadsWithMessages.filter((thread): thread is NonNullable<typeof thread> => thread !== null);
    } catch (error) {
      console.error('Error fetching email threads:', error);
      throw new TRPCError({ 
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Error fetching email threads'
      });
    }
  }),
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
