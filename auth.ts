import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    authorized({ auth, request }) {
      if (request.nextUrl.pathname.startsWith("/login")) {
        return true;
      }

      return Boolean(auth?.user);
    },
    signIn({ profile }) {
      const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
      const email = profile?.email?.toLowerCase();

      if (!allowedDomain) {
        return true;
      }

      return Boolean(email?.endsWith(`@${allowedDomain.toLowerCase()}`));
    },
  },
});
