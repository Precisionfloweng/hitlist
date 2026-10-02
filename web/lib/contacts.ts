// A project's contact list (who gets the deficiency list), kept on the project's Contacts tab by techs and admins.
import "server-only";
import { randomUUID } from "crypto";
import type { User } from "./auth";
import { appendRows, deleteRow, ensureTab, readTab, updateRow, type Rec } from "./sheets";

export type Contact = {
  id: string; name: string; position: string; company: string; trade: string; email: string;
  onList: boolean; addedBy: string; addedAt: string;
};
export type ContactInput = { name?: string; position?: string; company?: string; trade?: string; email?: string; onList?: boolean };

const toContact = (r: Rec): Contact => ({
  id: r.id, name: r.name, position: r.position ?? "", company: r.company, trade: r.trade, email: r.email,
  onList: r.on_list !== "no", addedBy: r.added_by, addedAt: r.added_at,
});

const byCompany = (a: Contact, b: Contact) =>
  (a.company || "~").localeCompare(b.company || "~") || (a.name || a.email).localeCompare(b.name || b.email);

async function rowsFor(project: string, fresh = false): Promise<Rec[]> {
  try {
    return (await readTab("Contacts", fresh)).filter((r) => r.project_number === project && r.id);
  } catch {
    return [];                       // tab not created yet
  }
}

export async function loadContacts(project: string, fresh = false): Promise<Contact[]> {
  return (await rowsFor(project, fresh)).map(toContact).sort(byCompany);
}

function clean(input: ContactInput) {
  const email = (input.email ?? "").trim().replace(/^mailto:/i, "").replace(/^<|>$/g, "").toLowerCase();
  if (!/^[^\s@;,<>]+@[^\s@;,<>]+\.[a-z]{2,}$/i.test(email)) throw new Error("Enter a valid email address.");
  const t = (v?: string) => (v ?? "").trim().slice(0, 120);
  return { name: t(input.name), position: t(input.position), company: t(input.company), trade: t(input.trade), email };
}

export async function addContact(project: string, input: ContactInput, by: User): Promise<Contact[]> {
  const c = clean(input);
  await ensureTab("Contacts");
  const rows = await rowsFor(project, true);
  if (rows.some((r) => r.email.toLowerCase() === c.email)) throw new Error(`${c.email} is already on this project's list.`);
  await appendRows("Contacts", [{
    project_number: project, id: randomUUID().slice(0, 8), ...c, on_list: input.onList === false ? "no" : "yes",
    added_by: by.name || by.email, added_at: new Date().toISOString().slice(0, 10),
  }]);
  return loadContacts(project, true);
}

export async function updateContact(project: string, id: string, input: ContactInput): Promise<Contact[]> {
  await ensureTab("Contacts");                  // keeps the header current (new columns are added at the end)
  const rows = await rowsFor(project, true);
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error("That contact was removed. Refresh the page.");
  const onlyToggle = input.email === undefined;
  const c = onlyToggle ? { name: row.name, position: row.position ?? "", company: row.company, trade: row.trade, email: row.email } : clean(input);
  if (!onlyToggle && rows.some((r) => r.id !== id && r.email.toLowerCase() === c.email)) {
    throw new Error(`${c.email} is already on this project's list.`);
  }
  const onList = input.onList === undefined ? row.on_list !== "no" : input.onList;
  await updateRow("Contacts", row._row, { ...row, ...c, on_list: onList ? "yes" : "no" });
  return loadContacts(project, true);
}

export async function removeContact(project: string, id: string): Promise<Contact[]> {
  const row = (await rowsFor(project, true)).find((r) => r.id === id);
  if (row) await deleteRow("Contacts", row._row);
  return loadContacts(project, true);
}
