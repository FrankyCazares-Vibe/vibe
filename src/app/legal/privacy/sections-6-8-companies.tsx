import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Sec } from "./parts";

/** The list of companies in Privacy Policy section 6, from Supabase to
 *  Anthropic. Split out of sections-6-8.tsx for length; the wording is
 *  privacy-policy-final.md's: do not reword it here. */
export function CompanyList() {
  return (
    <LegalUL bullets>
      <li>
        <strong>Supabase</strong> (database, sign-in, file storage). It holds
        the whole database. That includes what the sign-in system keeps: your
        email, a scrambled password and the sign-in records in{" "}
        <Sec to="3d">section 3d</Sec>. It also holds public photos, private
        résumés and the photos we keep as evidence. Evidence files are photos
        and videos we keep because of a report or a removal (
        <Sec to="9">section 9</Sec>). On some pages your browser talks to
        Supabase directly. They are the pages where you sign in, sign up,
        confirm or verify an email, set a new password or read a suspension
        notice. During set-up on a phone, the account sheet (Sign out and
        Delete account) does the same. Your browser also talks to Supabase when
        a profile page checks that you are signed in, and each time a profile
        or post photo loads. Supabase writes the &ldquo;confirm your
        account&rdquo; email and passes it to Resend to send. When you sign
        in, sign up or ask for a new email, Supabase sends the one-time code
        from the check that you are a person, with your IP address, to
        Cloudflare to confirm it.
      </li>
      <li>
        <strong>Vercel</strong> (hosting). It runs the site, our server
        software and the daily waitlist clean-up. Its visit logs record the web
        address requested, your IP address and browser. Some web addresses
        carry personal details, such as search words or the link in one of our
        emails. Checking in at an event, with the link or the code, puts that
        event in the log, with the time and your IP address. When the
        club&apos;s owner or an admin marks you as here, or takes your check-in
        off, the log holds that event and your account ID (a random label),
        with the time. It also stores the
        short film on our front page. Your browser
        loads the film from Vercel&apos;s file storage when the film comes into
        view or you press Play.
      </li>
      <li>
        <strong>Cloudflare</strong> (media storage, incoming mail and the check
        that you are a person). It holds
        post videos, a club&apos;s photos and videos, chat photos and videos,
        and group chat photos, including ones kept as evidence. Your browser
        fetches them straight from Cloudflare. It also serves the small program
        that shows a résumé PDF, and looks after the connectvibe.app name. And
        it forwards every email sent to hello@ or help@ (
        <Sec to="3g">section 3g</Sec>). It also runs the check that you are a
        person. The sign-up page, the sign-in page and any page that shows
        &ldquo;Send a new email&rdquo; load a small box straight from
        Cloudflare. The check starts when the page shows the box, not when you
        press the button. So on the &ldquo;Check your email&rdquo; screen it
        runs even if you never ask for a new email. Through the box Cloudflare
        sees your IP address, details of your browser and device, the address
        of the Vibe page you are on, and which of the three forms it is. We
        send Cloudflare nothing you type. Cloudflare says it uses what it sees
        only to tell people from bots and to make the check better. The box
        gives your browser a one-time code that lasts five minutes, and your
        browser sends that code to Supabase with the form. Cloudflare tells us
        pass or fail for each try. We also see totals of passes and fails,
        never who. We have turned off the box&apos;s link for sending feedback
        to Cloudflare. Cloudflare publishes its own notice for this check, the
        Turnstile Privacy Addendum.
      </li>
      <li>
        <strong>Resend</strong> (sending email). It gets the address and full
        content of every automatic email Vibe sends, with the access codes and
        links inside. Resend sends them through Amazon&apos;s email service.
      </li>
      <li>
        <strong>Sentry</strong> (finding bugs). It gets the error reports,
        speed reports and visit signals in <Sec to="3d">section 3d</Sec>. That
        section says what a report can hold, and what our release of October 5,
        2026 changed.
      </li>
      <li>
        <strong>Google</strong> (fonts, and the inbox our mail lands in).
        Fonts: your browser loads them from Google on almost every page, and
        your mail app may load them when you open one of our emails. Inbox:
        email to hello@ or help@ ends up in the personal Gmail inbox of the
        cofounder with direct access (<Sec to="3g">section 3g</Sec>). So Google
        holds your address and whatever you write to us. Both come under
        Google&apos;s own terms for the public, not under an agreement with us.
      </li>
      <li>
        <strong>Anthropic</strong> (AI coding assistant). We build and maintain
        Vibe with Claude, an AI assistant made by Anthropic. Its job is our
        software, not your information. What it can be shown is below.
        <LegalP>
          Our rule for the live database (the real one, which holds
          people&apos;s accounts): the assistant may be shown counts (how
          many), settings and code fingerprints. A code fingerprint is a short
          code that shows whether a piece of our software has changed. The
          assistant may not be shown anyone&apos;s records: no profile, post,
          message, email address or waitlist entry. This rule is new. Before
          October 4, 2026 the assistant could be shown records while a problem
          was being fixed.
        </LegalP>
        <LegalP>The rule covers the database only. Outside it:</LegalP>
        <LegalUL bullets>
          <li>
            <strong>Testing the live site.</strong> The cofounder with direct
            access can test the live site with the assistant. When that
            happens, it sees the screens that cofounder&apos;s own account
            sees, the admin tools in <Sec to="1">section 1</Sec> included.
          </li>
          <li>
            <strong>Logs and reports.</strong> The assistant may be asked to
            read the logs at Vercel or Supabase, or Sentry&apos;s reports, to
            fix a bug. Then it sees what they hold. That can include an IP
            address or an email address. In a Sentry report made before our
            release of October 5, 2026, it can also include a sign-in cookie or
            the text someone was sending (<Sec to="3d">section 3d</Sec>).
          </li>
          <li>
            <strong>The inbox and our other accounts.</strong> We have not yet
            written a rule for the inbox (<Sec to="3g">section 3g</Sec>) or for
            our accounts at the other companies on this list.
          </li>
        </LegalUL>
        <LegalP>
          The rule is one we keep ourselves. No system enforces it. Whatever
          the assistant is shown passes through Anthropic, which handles it
          under its own terms. We have not yet confirmed whether Anthropic may
          use it to improve its AI models.
        </LegalP>
      </li>
    </LegalUL>
  );
}
