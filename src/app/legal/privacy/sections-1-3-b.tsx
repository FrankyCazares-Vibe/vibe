import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { PageLink, Sec, SubH3 } from "./parts";

/** Privacy Policy section 3d (part of sections 1 to 3: see sections-1-3.tsx).
 *  The wording is privacy-policy-final.md's: do not reword it here. */
export function Section3d() {
  return (
    <>
      <SubH3 n="3d" />
      <LegalUL bullets>
        <li>
          <strong>Views.</strong> When you are signed in, we record a view when
          you open a profile or open a post. We also record one when a post
          stays on your screen in the feed for about a second. The record holds
          who you are, what you viewed and the day. We keep one record per day
          for each profile or post. For a profile we also record the time of
          your first look that day. Until October 7, 2026 we also recorded the
          web address of the page you came from (up to 80 characters). We no
          longer record it, the addresses recorded before then are still
          stored, and nothing in Vibe reads them. Your own views and
          signed-out views are not recorded.
        </li>
        <li>
          <strong>Last active.</strong> While the Campus page is open, we store
          the latest time your browser checked in.
        </li>
        <li>
          <strong>Abuse counts.</strong> We count how often some actions happen,
          mostly per account. A few counts hold an IP address or part of one,
          and a few hold a scrambled code made from an email address. We clear
          them from time to time, not on a set schedule, so they can stay for
          weeks. Apart from these counts, the parts of the database that we
          built hold no IP address.
        </li>
        <li>
          <strong>Sign-in records.</strong> The sign-in system, which is
          software made by Supabase, keeps its own records in the same
          database. They can hold the IP address and browser of each device you
          are signed in on. They can also hold a log of sign-in activity, with
          your email address and IP address. No other user can read them. The
          cofounder with direct access can (<Sec to="1">section 1</Sec>).
        </li>
        <li>
          <strong>Email log.</strong> We log each email our own software sends.
          The log holds its kind, your account if there is one, the part of the
          address after the @ and the time. It also holds whether it worked, and
          the reference number that our email service (Resend) gives the
          message. In place of the address, the log holds a scrambled code.
          Nobody can turn the scrambled code back into the address. Our servers
          do hold a secret key that lets us test whether a particular address
          matches it.
        </li>
        <li>
          <strong>Error reports.</strong> When something breaks, a report goes
          to Sentry, the service we use to find bugs. A speed report also goes
          for about one page load in ten, and for about one in ten requests to
          our servers. (A request is your browser or app asking our servers for
          something.) Sentry also gets a small signal each time you open or
          change a page, so it can count what share of visits hit an error.
          That signal holds no page address and nothing about your account.
          <LegalP>
            Our own code does not put your name, account or email on these
            reports, and we strip sign-in links, access codes and profile
            handles from web addresses. A report can still hold things that
            point to you. It can include a club&apos;s handle, the ID (a random
            label) of a post or chat, or search words. It also carries a short
            trail of what happened just before it. The trail lists the pages you
            opened, the requests your browser made and lines our own software
            logs. Until October 8, 2026 it also listed the buttons you tapped,
            by their labels and never what you typed.
          </LegalP>
          <LegalP>
            Until our release of October 5, 2026, an error report or a speed
            report about a request to our servers could also hold four things:
          </LegalP>
          <LegalUL bullets>
            <li>
              <strong>What your browser sent.</strong> That could be the thing
              you were sending at that moment. Examples are the text of a
              message or a post, a report you were filing, the waitlist form, or
              an email address you typed.
            </li>
            <li>
              <strong>Your sign-in cookie.</strong> It identifies your account.
              Someone who could read the report could use it to act as you.
              Signing out in{" "}
              <PageLink href="/settings">Settings</PageLink> stops that, within
              about an hour (<Sec to="7">section 7</Sec>).
            </li>
            <li>
              <strong>A rough location.</strong> Our hosting company (Vercel)
              works it out from your IP address and adds it to each request. We
              have not confirmed that the IP address itself was always left out.
            </li>
            <li>
              <strong>What our server asked the database.</strong> To answer a
              request, our server asks the database for things, and the report
              lists the address of each thing it asked for. Those addresses
              could hold account IDs (random labels), yours and other
              people&apos;s. At a few steps they could also hold an email
              address. Those steps were sending the waitlist form, typing or
              confirming a school email, and a cofounder looking an account up
              by email or adding someone to the waitlist.
            </li>
          </LegalUL>
          <LegalP>
            That release is built to strip the first three from new reports, and
            to take the account IDs and email addresses out of the fourth. We
            have not yet opened a live report, from before the release or after
            it, to confirm what one holds. Reports made before the release keep
            what they hold until Sentry deletes them, and we have not confirmed
            how long that is.
          </LegalP>
          <LegalP>
            One thing still gets through to a new report: an account ID that is
            part of the web address of one of our own pages or of a stored file.
          </LegalP>
        </li>
        <li>
          <strong>Search words</strong> are not stored in our database, but
          Vercel can log them as part of the web address.
        </li>
      </LegalUL>
    </>
  );
}
