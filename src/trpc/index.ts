import { TRPCError } from '@trpc/server';
import { createCallerFactory, publicProcedure, router } from './trpc';
import { z } from 'zod';

export const appRouter = router({
  hello: publicProcedure.query(() => 'Hello World'),
  getRecentEmails: publicProcedure
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().min(1).max(50).default(10)
    }))
    .query(async ({ ctx, input }) => {
      if (!ctx.gmail) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      try {
        const threadResponse = await ctx.gmail.users.threads.list({
          userId: 'me',
          maxResults: input.limit,
          q: 'in:inbox',
          pageToken: input.cursor,
        });

        if (!threadResponse.data.threads?.length) {
          return {
            items: [],
            nextCursor: undefined
          };
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

        const items = threadsWithMessages.filter((thread): thread is NonNullable<typeof thread> => thread !== null);

        return {
          items,
          nextCursor: threadResponse.data.nextPageToken || undefined
        };
      } catch (error) {
        console.error('Error fetching email threads:', error);
        if (error instanceof Error) {
          console.error('Error details:', {
            message: error.message,
            name: error.name,
            stack: error.stack?.split('\n').slice(0, 10).join('\n')
          });
          
          // Log the full error object for debugging
          if ('config' in error) {
            console.error('Request config:', {
              url: (error as any).config?.url,
              headers: (error as any).config?.headers,
              params: (error as any).config?.params
            });
          }
          if ('response' in error) {
            console.error('Response data:', (error as any).response?.data);
          }
        }
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
