import { gmailRouter } from "./routers/gmail";
import { createCallerFactory, publicProcedure, router } from "./trpc";

export const appRouter = router({
  hello: publicProcedure.query(() => "Hello World"),
  gmail: gmailRouter,
});

// Export type router type signature,
// NOT the router itself.
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
