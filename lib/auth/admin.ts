import "server-only";

import type { Session } from "next-auth";

import { auth } from "@/auth";

export async function getAdminSession() {
  const session = await auth();

  if (!session?.user || !isAdminSession(session)) {
    return null;
  }

  return session;
}

export async function requireAdminApiSession() {
  const session = await auth();

  if (!session?.user) {
    return {
      session: null,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (!isAdminSession(session)) {
    return {
      session: null,
      response: Response.json({ error: "Forbidden" }, { status: 403 }),
    };
  }

  return { session, response: null };
}

export function isAdminSession(session: Session) {
  return isAdminEmail(session.user?.email);
}

export function isAdminEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  const adminEmails = parseList(process.env.ADMIN_EMAILS);
  if (adminEmails.length > 0) {
    return adminEmails.includes(normalizedEmail);
  }

  const adminDomains = parseList(process.env.ADMIN_EMAIL_DOMAIN);
  if (adminDomains.length > 0) {
    return adminDomains.some((domain) =>
      normalizedEmail.endsWith(`@${domain.replace(/^@/, "")}`)
    );
  }

  return false;
}

function parseList(value?: string) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}
