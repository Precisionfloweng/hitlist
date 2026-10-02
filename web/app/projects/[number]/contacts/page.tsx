import { notFound, redirect } from "next/navigation";
import Header from "../../../Header";
import ProjectHeader from "../ProjectHeader";
import ContactsList from "./ContactsList";
import { canEdit, canSee, requireUser } from "@/lib/auth";
import { getProject } from "@/lib/data";
import { loadContacts } from "@/lib/contacts";
import { loadResults } from "@/lib/results";

export const dynamic = "force-dynamic";

/** Who gets this project's deficiency list. Staff only; techs and admins edit. */
export default async function ContactsPage({ params }: { params: Promise<{ number: string }> }) {
  const user = await requireUser();
  const number = decodeURIComponent((await params).number);
  if (user.role === "customer") redirect(`/projects/${encodeURIComponent(number)}`);
  const [data, results, contacts] = await Promise.all([getProject(number), loadResults(number), loadContacts(number)]);
  if (!data || !canSee(user, data.project.id)) notFound();
  const p = data.project;
  return (
    <>
      <Header user={user} />
      <main>
        <ProjectHeader user={{ customer: false, canSync: canEdit(user) }} project={p} tab="contacts"
          missingRequired={results?.summary.missing_required} notes={results?.notes?.length} />
        <ContactsList project={p.id} subject={`${p.name} - TAB Deficiency List`} initial={contacts} canEdit={canEdit(user)} />
      </main>
    </>
  );
}
