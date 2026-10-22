import Link from "next/link";

export default function AdminNav({ on }: { on: "projects" | "users" | "whats-new" | "settings" | "weights" }) {
  return (
    <div className="tabs" style={{ marginBottom: 16 }}>
      <Link href="/admin"><button className={on === "projects" ? "on" : ""}>Project list</button></Link>
      <Link href="/admin/users"><button className={on === "users" ? "on" : ""}>Users</button></Link>
      <Link href="/admin/whats-new"><button className={on === "whats-new" ? "on" : ""}>What&apos;s new</button></Link>
      <Link href="/admin/settings"><button className={on === "settings" ? "on" : ""}>Settings</button></Link>
      <Link href="/admin/weights"><button className={on === "weights" ? "on" : ""}>Completion weights</button></Link>
    </div>
  );
}
