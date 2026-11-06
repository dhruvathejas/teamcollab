import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import { redeemChallenge } from "@/lib/challenges";

// Sign-in is two-step (see src/lib/challenges.ts): the password or sign-up form
// is checked in a server action, which emails a one-time code. The only way to
// obtain a session is this provider, and it only accepts the token of a
// challenge whose emailed code was verified moments ago. A password alone can
// never produce a session.
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      id: "email-code",
      credentials: { token: {} },
      async authorize(credentials) {
        const token = credentials?.token;
        if (typeof token !== "string" || token.length < 20) throw new CredentialsSignin();
        const userId = await redeemChallenge(token);
        if (!userId) throw new CredentialsSignin();
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, email: true },
        });
        if (!user) throw new CredentialsSignin();
        return user;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        // When this session began; lets an admin end all of a user's sessions.
        token.loginAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (typeof token.loginAt === "number") session.loginAt = token.loginAt;
      return session;
    },
  },
});
