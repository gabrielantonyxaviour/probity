import Link from "next/link";

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center" }}>
      <div style={{ display: "grid", gap: 16, justifyItems: "center" }}>
        <span className="p-badge">Not found</span>
        <h1 className="t-heading" style={{ color: "var(--fg)" }}>This page does not exist.</h1>
        <Link href="/app" className="p-btn p-btn--accent">Back to change requests</Link>
      </div>
    </main>
  );
}
