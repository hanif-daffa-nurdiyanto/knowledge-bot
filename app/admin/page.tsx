import { ShieldAlert } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { isAdminSession } from "@/lib/auth/admin";

import { AdminDocumentsClient } from "./admin-documents-client";

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (!isAdminSession(session)) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <div className="mb-4 flex size-10 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
            <ShieldAlert className="size-5" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">Admin access required</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            This account is signed in but is not registered as an admin. Add
            the email to <code>ADMIN_EMAILS</code> or the domain to{" "}
            <code>ADMIN_EMAIL_DOMAIN</code>.
          </p>
          <Button asChild className="mt-6">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <AdminDocumentsClient
      userEmail={session.user.email ?? ""}
      userName={session.user.name ?? session.user.email ?? "Admin"}
    />
  );
}
