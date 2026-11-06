import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
    /** ms since epoch when this session was created by signing in. */
    loginAt?: number;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    loginAt?: number;
  }
}
