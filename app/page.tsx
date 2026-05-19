import {
  BookOpenText,
  Cable,
  LogOut,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";

import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();
  const userName = session?.user?.name ?? session?.user?.email ?? "User";

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpenText className="size-5" aria-hidden="true" />
            </div>
            <span className="font-semibold">KnowledgeBot</span>
          </div>

          <form
            action={async () => {
              "use server";

              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline">
              <LogOut className="size-4" aria-hidden="true" />
              Logout
            </Button>
          </form>
        </div>
      </header>

      <section className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-muted-foreground">
            Signed in as {userName}
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">
            Internal Knowledge Base Bot
          </h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            Foundation auth already active. Now if user not authenticated, they will be redirected to login page.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/chat"
            className="rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <MessageSquareText className="mb-4 size-5 text-muted-foreground" />
            <h2 className="font-medium">Chat RAG</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Open chat UI with streaming, markdown, and source attribution.
            </p>
          </Link>
          <div className="rounded-lg border bg-card p-5 text-card-foreground">
            <BookOpenText className="mb-4 size-5 text-muted-foreground" />
            <h2 className="font-medium">Protected app</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              All pages in this app are protected with auth.
            </p>
          </div>

          <Link
            href="/admin"
            className="rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ShieldCheck className="mb-4 size-5 text-muted-foreground" />
            <h2 className="font-medium">Admin documents</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Upload, monitor, and delete knowledge base documents.
            </p>
          </Link>

          <Link
            href="/test-upload"
            className="rounded-lg border bg-card p-5 text-card-foreground transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <Cable className="mb-4 size-5 text-muted-foreground" />
            <h2 className="font-medium">Ingest pipeline</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Click to test ingest pipeline.
            </p>
          </Link>
        </div>
      </section>
    </main>
  );
}
