import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { auth, signIn } from "@/auth";
import { Button } from "@/components/ui/button";

export default async function LoginPage() {
  const session = await auth();

  if (session?.user) {
    redirect("/");
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12">
      <section className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              KnowledgeBot
            </h1>
            <p className="text-sm text-muted-foreground">
              Internal knowledge access
            </p>
          </div>
        </div>

        <div className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Sign in
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              You must be signed in to continue
            </p>
          </div>

          <form
            action={async () => {
              "use server";

              await signIn("google", { redirectTo: "/" });
            }}
          >
            <Button type="submit" className="h-10 w-full">
              Continue with Google
            </Button>
          </form>
        </div>
      </section>
    </main>
  );
}
