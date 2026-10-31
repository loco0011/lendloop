import { clerkMiddleware } from "@clerk/nextjs/server";

// Only makes the Clerk session available. No route is protected here on
// purpose: authorization is enforced inside Convex, where the data lives.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
