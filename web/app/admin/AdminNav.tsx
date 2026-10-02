import Link from "next/link";

export default function AdminNav({ on }: { on: "projects" | "users" | "whats-new" }) {
  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      <Link href="/admin"><button className={on === "projects" ? "on" : ""}>Project list</button></Link>
      <Link href="/admin/users"><button className={on === "users" ? "on" : ""}>Users</button></Link>
      <Link href="/admin/whats-new"><button className={on === "whats-new" ? "on" : ""}>What&apos;s new</button></Link>
    </div>
  );
}
