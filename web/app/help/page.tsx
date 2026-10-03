import Link from "next/link";
import Header from "../Header";
import { requireStaff } from "@/lib/auth";
import { whatsNew } from "@/lib/whatsNew";

export const dynamic = "force-dynamic";

const SECTIONS = [
  ["whats-new", "What's new"],
  ["getting-around", "Getting around"],
  ["sync", "Syncing a project"],
  ["checklist", "Reading the equipment checklist"],
  ["fix", "Clearing a red ✕"],
  ["special", "Special rules"],
  ["issues", "Possible issues found"],
  ["deficiencies", "Deficiencies"],
  ["notes", "Notes"],
  ["rules", "Rules"],
  ["ai", "AI Tools"],
  ["sharing", "Sharing and confidentiality"],
  ["ipad", "iPad Home Screen"],
] as const;

export default async function HelpPage() {
  const user = await requireStaff();
  const admin = user.role === "admin";
  return (
    <>
      <Header user={user} />
      <main className="help">
        <h1>How PFE Hitlist works</h1>
        <p className="lead">
          Hitlist reads each project&apos;s BuildingStart export and shows what&apos;s been filled in, what&apos;s still
          missing, and the open punch items. It only <b>reads</b> BuildingStart. To change anything you see here, update
          it in BuildingStart and press <b>Sync</b>.
        </p>

        <nav className="help-toc card">
          <b>On this page</b>
          <ol>
            {SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}
            {admin && <li><a href="#admin">For admins</a></li>}
          </ol>
        </nav>

        <section id="whats-new">
          <h2>What&apos;s new</h2>
          <ul className="whats-new">
            {whatsNew(admin).slice(0, 15).map((e, i) => (
              <li key={i}><span className="muted">{new Date(`${e.date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>{" "}
                <b>{e.title}</b>{e.audience === "admins" && <span className="pill gray" style={{ marginLeft: 6 }}>Admins</span>}: {e.text}</li>
            ))}
          </ul>
        </section>

        <section id="getting-around">
          <h2>Getting around</h2>
          <ul>
            <li><b>All Projects</b> lists every active project. Tick <b>My projects</b> to see only the ones where you&apos;re the tech. Use the search box to find a project by number, name or tech.</li>
            <li>Click a project to open it. Each project has these tabs:
              <ul>
                <li><b>Overview</b>: units fully complete, open and closed deficiencies, and a card for each equipment type. Click a card to jump to that type. The fourth card shows when the <b>last punch list was sent</b>: the newest file in the project&apos;s Dropbox <b>Deficiency Reports</b> folder (checked on each sync and before the Monday email), so keep saving each sent punch list there.</li>
                <li><b>Equipment checklist</b>: every unit and field, marked done or missing.</li>
                <li><b>Deficiencies</b>: the punch list, with breakdowns by priority, contractor and contact.</li>
                <li><b>Notes</b>: the notes entered in BuildingStart. See <a href="#notes">Notes</a>.</li>
                <li><b>Contacts</b>: who gets the deficiency list. See <a href="#contacts">Contacts</a>.</li>
                <li><b>Rules</b>: what this project checks, and its tolerances. See <a href="#rules">Rules</a>.</li>
                <li><b>✨ AI Tools</b> (techs and admins): clean up a deficiency or note before you enter it, and ask questions about the project&apos;s specs and submittals. See <a href="#ai">AI Tools</a>.</li>
              </ul>
            </li>
            <li>On a phone held upright, the top bar&apos;s links, your name and <b>Sign out</b> are under the <b>☰</b> button at the top right.</li>
            <li>When the tabs don&apos;t fit on one line (an iPad held upright, a phone), they fold into one <b>☰</b> button showing the tab you&apos;re on. Tap it to pick another tab.</li>
          </ul>
        </section>

        <section id="sync">
          <h2>Syncing a project</h2>
          <p>Press <b>Sync</b> to pull the latest data from BuildingStart. A server downloads the project&apos;s export and checks it. It usually takes <b>5–10 minutes</b>, and longer for big projects. You can leave the page while it runs.</p>
          <table className="card help-table"><tbody>
            <tr><td><span className="pill gray">Waiting</span></td><td>In line for the server. If another project is syncing, yours starts next.</td></tr>
            <tr><td><span className="pill warn">Syncing</span></td><td>Running. The line underneath shows the current step (logging in, downloading export, checking rules…).</td></tr>
            <tr><td><span className="pill ok">✓ Complete</span></td><td>Done. The numbers on the site are now from this sync.</td></tr>
            <tr><td><span className="pill bad">Failed</span></td><td>Something went wrong; the reason is shown underneath. Press <b>Try again</b>. You and Rick also get an email.</td></tr>
            <tr><td className="error">The server has not started.</td><td>The server didn&apos;t pick the sync up within 2 minutes. It may be off or restarting. Let Rick know.</td></tr>
            <tr><td><span className="pill warn">Server down</span></td><td>An orange banner at the top, <b>&ldquo;The server is currently down so the site is unable to sync,&rdquo;</b> means the server hasn&apos;t checked in for over 10 minutes. Everything already synced still shows; new syncs wait until it&apos;s back. The admins get an email.</td></tr>
          </tbody></table>
          <p><b>Last sync</b> shows how long ago the project was synced. Nothing updates on its own, so sync after you&apos;ve entered data in BuildingStart. Every Monday morning you get an email listing your projects and the days since each was last synced.</p>
        </section>

        <section id="checklist">
          <h2>Reading the equipment checklist</h2>
          <p>Pick an equipment type on the left (they&apos;re in the same order as BuildingStart). Each row is a unit and each column is a field.</p>
          <table className="card help-table"><tbody>
            <tr><td><span className="ck-key p">✓</span></td><td><b>Filled in.</b></td></tr>
            <tr><td><span className="ck-key r"><span>✕</span></span></td><td><b>Required and missing.</b> This counts against the unit and the project.</td></tr>
            <tr><td><span className="ck-key o">!</span></td><td><b>Optional and missing.</b> It&apos;s shown as a reminder but doesn&apos;t count against anything. Optional fields have grey headings.</td></tr>
            <tr><td><span className="ck-key mn">–</span></td><td><b>Marked with a dash</b> in BuildingStart. It counts as answered.</td></tr>
            <tr><td><span className="ck-key na">·</span></td><td><b>Doesn&apos;t apply</b> to this unit (see <a href="#special">Special rules</a>). Columns that don&apos;t apply to any unit on screen are hidden.</td></tr>
          </tbody></table>
          <ul>
            <li id="done"><b>Done</b> (for example 17/26) is required fields filled out of required fields for that unit. Optional fields aren&apos;t counted, so a unit can show 8/8 with a few <b>!</b> marks.</li>
            <li>A unit is <b>fully complete</b> when all its required fields are filled. The Overview counts these.</li>
            <li><b>All units</b> shows everything; <b>Needs data</b> shows only units with a required field missing.</li>
            <li>A <b>light red row</b> with a red <b>“1 open”</b> tag means the unit has an open deficiency. This includes items on its sub-items; for example, an item on a coil also marks its AHU. Tap (or click) the tag to read them.</li>
            <li>A <b>light blue row</b> with a blue <b>“1 note”</b> tag means the unit has a note in BuildingStart (again including its sub-items). Tap the tag to read it. A unit with both stays light red and shows both tags.</li>
            <li>The last column, <b>Completed</b>, shows whether the unit is ticked Completed in BuildingStart (✓) or not (<b>!</b>). It&apos;s optional, so it doesn&apos;t count toward Done or % complete.</li>
            <li>Hover over (or press and hold) any mark to see the field name.</li>
          </ul>
        </section>

        <section id="fix">
          <h2>Clearing a red ✕</h2>
          <p>Go to BuildingStart and do one of these, then press <b>Sync</b>:</p>
          <ul>
            <li><b>Enter the reading</b>, or</li>
            <li>if the field genuinely doesn&apos;t apply to that unit, <b>enter a dash ( - )</b>. The ✕ becomes a grey dash and stops counting against the unit.</li>
          </ul>
          <p><b>?</b> in a field (BuildingStart&apos;s &quot;can&apos;t calculate yet&quot;) still counts as missing. <b>0</b> counts as a real reading.</p>
        </section>

        <section id="special">
          <h2>Special rules</h2>
          <ul>
            <li><b>Design and Actual pairs</b> (Design Airflow / Actual Airflow, Design O/A / Actual O/A, and so on):
              <ul>
                <li>If the <b>Design</b> field is left completely blank, both fields are skipped. The unit doesn&apos;t have that item (for example, no outside air).</li>
                <li>If there&apos;s no design but the reading is still needed, put a <b>dash ( - )</b> in the Design field. The Actual is then still required.</li>
              </ul>
            </li>
            <li><b>Coil air velocities</b> (Air Velocity Design / Actual) are only checked once <b>Airside Face Area</b> is filled in.</li>
            <li><b>Sheaves and belts</b> are only checked when the drive type is <b>Belt Drive</b>.</li>
            <li><b>VAV fan and reheat fields</b> are only checked when the box has a design fan or reheat airflow. <b>Unit heater</b> electrical readings are only checked when it has a design kW.</li>
            <li><b>Electric heat volts and amps</b> use phase 1 only. On other equipment, a volts or amps reading in any phase counts.</li>
          </ul>
        </section>

        <section id="issues">
          <h2>Possible issues found</h2>
          <p>Shown on the Overview when a unit is <b>ticked Complete in BuildingStart</b> but still has required fields empty, grouped by equipment type. The first 15 are listed; press <b>Show all</b> for the rest. Either fill in the fields, or untick Complete until the unit is really finished.</p>
        </section>

        <section id="deficiencies">
          <h2>Deficiencies</h2>
          <p>The Deficiencies tab lists every punch item from BuildingStart, with breakdowns by priority, contractor role, assigned contact and status. Filter by open only, priority or contact. <b>Punch items</b> on the projects list is the total count, open and closed. Items marked <b>Fixed</b> or <b>Accepted</b> (or Closed, Resolved, Complete, Void, Cancelled) count as closed; every other status counts as open, and the red number on the Deficiencies tab is the open count.</p>
          <p><b>AI Review</b> (techs and admins) has Claude read each open deficiency and suggest clearer wording where it helps: what&apos;s wrong, where, measured vs. design, and what&apos;s needed. Edit the suggestion if needed (fill in any <b>___</b>), press <b>Copy</b>, and paste it into the deficiency in BuildingStart. After the next <b>Sync</b>, updated items move to <b>Reads well</b>. New or changed items show under <b>Not reviewed yet</b> until you review again. If you&apos;d rather keep the original wording, press <b>Keep as is</b>: the item moves to Reads well (tagged <b>Kept as is</b>, with <b>Undo</b>) and comes back only if its wording changes.</p>
        </section>

        <section id="notes">
          <h2>Notes</h2>
          <p>The <b>Notes</b> tab lists every note entered in BuildingStart for the project: <b>Project notes</b> (not tied to a unit) first, then <b>Notes by unit</b>. Notes update on each <b>Sync</b>. To add or change a note, do it in BuildingStart. Customers don&apos;t see notes.</p>
          <p><b>AI Review</b> works on the Notes tab too, the same way as on Deficiencies: Claude flags notes that are unclear or have spelling or grammar problems and suggests clearer wording. <b>Copy</b> it into the note in BuildingStart, or press <b>Keep as is</b>.</p>
        </section>

        <section id="contacts">
          <h2>Contacts</h2>
          <p>The <b>Contacts</b> tab keeps the project&apos;s email list for the deficiency list in one place, so you don&apos;t have to dig up the last email to find everyone. Techs and admins add, edit and remove contacts; customers don&apos;t see this tab.</p>
          <ul>
            <li>When someone asks to be added, type their name, position, company, trade and email into <b>Add a contact</b>.</li>
            <li>Set each person to <b>To</b> or <b>Cc</b>. PFE staff start on <b>Cc</b>, everyone else on <b>To</b>; tap to switch.</li>
            <li><b>✉ New email</b> opens a new email in your own mail app (Outlook) with everyone ticked on the To and Cc lines and the project name in the subject. Attach the deficiency list and send it as usual. It goes out from your account and shows in your Sent Items.</li>
            <li>Untick <b>On list</b> to leave someone off for now without deleting them. <b>✕</b> removes them for good.</li>
            <li><b>Added</b> shows when each person joined the list, so you can see who&apos;s new since your last send.</li>
            <li>On an iPad, set Outlook as your email app first: <b>Settings → Apps → Default Apps → Email</b>.</li>
          </ul>
        </section>

        <section id="rules">
          <h2>Rules</h2>
          <ul>
            <li>Rules decide which fields are <b>Required</b>, <b>Optional</b> or <b>Ignored</b> for each equipment type.</li>
            <li><b>Default Rules</b> (top bar) are the company standard. Only admins can change them.</li>
            <li>A project&apos;s <b>Rules</b> tab lets anyone change a field for <b>that project only</b>. Changed fields are highlighted blue, with the default shown next to them and a <b>Reset</b> button. Every change is logged and can be undone.</li>
            <li>Rule changes show up on the project&apos;s next <b>Sync</b>.</li>
            <li><b>Tolerances</b>: at the top of a project&apos;s Rules tab, enter the spec&apos;s ±% for AHUs, RTUs, fans, terminal units, outlets &amp; inlets, pumps and coils. Leave a box blank if the spec doesn&apos;t give one. Filled-in tolerances show on the Overview, and the AI uses them when wording deficiencies.</li>
          </ul>
        </section>

        <section id="ai">
          <h2>AI Tools</h2>
          <p>On a project&apos;s <b>✨ AI Tools</b> tab, choose <b>Deficiency</b> or <b>Note</b>, pick the unit if you like, and type, paste or dictate what you found (rough is fine; tap 🎤 on the iPad keyboard to talk). Press <b>Refine</b> and Claude rewrites it the PFE way, using the same rules as AI Review and the project&apos;s tolerances. Edit it if needed, fill in any <b>___</b>, press <b>Copy</b> and paste it into BuildingStart. Nothing you type there is saved.</p>
          <h3>Search the Documents</h3>
          <p>Below Refine, <b>Search the Documents</b> answers questions from the project&apos;s Dropbox folder. It reads the <b>Drawings and Specs</b>, <b>Submittal</b>, <b>TAB Plan</b>, <b>ASIs and RFIs</b> and <b>Change Orders</b> folders; the other folders are left alone, and Hitlist can only read Dropbox, never change it.</p>
          <ul>
            <li>The first time, press <b>Find documents</b> (once files have been read, the button becomes <b>Update documents</b>). The server finds the folder by the job number in the technician folders (and by name when several projects share a number; if it can't tell, it asks you to pick) and reads the files; a big project can take several minutes. After that, every <b>Sync</b> also checks for new or changed files.</li>
            <li>Hitlist prefers the folder inside the project&apos;s tech&apos;s own Dropbox folder. If it picks the wrong folder (or can&apos;t find one), press <b>Set folder</b> and paste the folder&apos;s path from File Explorer or its dropbox.com link.</li>
            <li>Type a question (for example <i>What is the design airflow on AHU-16?</i>) and press <b>Ask</b>, or use the quick buttons: <b>Tolerances</b>, <b>TAB requirements</b>, or <b>Design values</b> for a unit. Put a unit tag in the unit box to ask about just that unit; <b>Ask</b> uses it too.</li>
            <li>Every value comes with its source (<b>S1</b>, <b>S2</b>...): folder, file, page and file date, so you can check it. If the answer isn&apos;t in the documents it says so instead of guessing, and it points out when an ASI, RFI or change order changes a value.</li>
            <li>After <b>Tolerances</b>, <b>Fill in Tolerances</b> puts the numbers on the project&apos;s Rules / Tol. tab.</li>
            <li><b>Asked before</b> lists earlier questions and answers on the project, so you don&apos;t need to ask twice.</li>
            <li>Scanned files with no text can&apos;t be read yet; they&apos;re listed under &quot;couldn&apos;t be read&quot;.</li>
          </ul>
        </section>

        <section id="sharing">
          <h2>Sharing and confidentiality</h2>
          <ul>
            <li>Everything in Hitlist is <b>confidential Precision Flow Engineering information</b>. That includes project data, checklists, deficiencies and screenshots of any page.</li>
            <li><b>Don&apos;t share it with customers, contractors or anyone outside PFE without permission</b> from Cody.</li>
            <li>If a customer should see their project, ask Cody. With permission, the customer can be set up with their own <b>read-only</b> sign-in. Don&apos;t share your own sign-in.</li>
          </ul>
        </section>

        <section id="ipad">
          <h2>iPad Home Screen</h2>
          <ol>
            <li>Open this site in <b>Safari</b>.</li>
            <li>Tap <b>Share</b> (the square with an arrow pointing up), then <b>Add to Home Screen</b>, then <b>Add</b>. It&apos;s named <b>PFE</b>.</li>
            <li>Open <b>PFE</b> from the Home Screen and sign in once. It stays signed in and opens full-screen.</li>
          </ol>
          <p>Forgot your password? On the sign-in page, choose <b>Email me a code</b>. You can change your password any time by clicking your name in the top bar.</p>
        </section>

        <section id="desktop">
          <h2>Desktop app (Windows)</h2>
          <p>Install Hitlist as an app on your computer. It opens in its own window with the Hitlist icon, like a regular program.</p>
          <ol>
            <li>Open this site in <b>Chrome</b> or <b>Edge</b> and sign in.</li>
            <li><b>Chrome:</b> click <b>⋮</b> (top right), then <b>Cast, save, and share</b>, then <b>Install page as app…</b>, then <b>Install</b>.<br />
              <b>Edge:</b> click <b>⋯</b> (top right), then <b>Apps</b>, then <b>Install this site as an app</b>, then <b>Install</b>.</li>
            <li>When it asks, tick <b>Create desktop shortcut</b> and <b>Pin to taskbar</b> if you want them.</li>
          </ol>
          <p>If there&apos;s no desktop shortcut afterwards, open the Start menu, find <b>PFE Hitlist</b>, right-click it and choose <b>Pin to taskbar</b>, or drag it onto the desktop. A link dragged from the address bar works too, but shows the browser&apos;s icon instead of Hitlist&apos;s.</p>
        </section>

        {admin && (
          <section id="admin">
            <h2>For admins</h2>
            <ul>
              <li><b>Projects</b> (<Link href="/admin">Admin → Project list</Link>): add a project with its BuildingStart number, name and tech. The tech name must match the person&apos;s name on the Users page for <b>My projects</b> to work.</li>
              <li><b>Archive vs delete</b>: <b>Archived</b> hides a project but keeps all its data. <b>Delete</b> removes it along with its sync results, history and project rules.</li>
              <li><b>Two sites on one contract</b> can share a project number, as long as the names differ. The server opens the BuildingStart project whose name matches best, so keep the Hitlist name close to the BuildingStart name.</li>
              <li><b>Users</b> (<Link href="/admin/users">Admin → Users</Link>): add people with their work email. Tick <b>Email them a welcome</b> to send sign-in and iPad instructions, or press <b>Send welcome</b> on anyone already listed. <b>Last used</b> shows the last day each person opened the app. Roles: <b>Admin</b> (everything), <b>Tech</b> (projects, Sync, project rules), <b>Viewer</b> (read-only), <b>Customer</b> (read-only, only the projects you pick).</li>
              <li><b>Sign-in log</b>: every sign-in (who, when, password or emailed code, device) is recorded on the <b>SignIns</b> tab of the PFE Hitlist Data Google Sheet.</li>
              <li><b>Emails</b>: a failed sync emails the tech and Rick. The Monday summary goes to each tech and the admins. Successful syncs don&apos;t send email.</li>
              <li><b>&quot;Rules that didn&apos;t match this export&quot;</b> on an Overview means a sheet or column name in the Default Rules looks mistyped. Fix it on the Rules page and Sync.</li>
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
