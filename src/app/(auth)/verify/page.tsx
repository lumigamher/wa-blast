import Link from "next/link";

export default function VerifyPage() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Email verification</h1>
      <p className="text-sm">
        If you just clicked a verification link, you can now{" "}
        <Link href="/login" className="underline">
          log in
        </Link>
        .
      </p>
      <p className="text-sm text-muted-foreground">
        If the link expired, request a new one from the signup page.
      </p>
    </div>
  );
}
