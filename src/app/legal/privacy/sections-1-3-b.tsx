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
          stored, and nothing in Vibe reads them. Your own views, and
          signed-out views of profiles and posts, are not recorded.
        </li>
        <li>
          <strong>Last active.</strong> While you are signed in and Vibe is open
          on your screen, your browser checks in with our server every few
          minutes, from any page. We store the latest time it checked in, to
          within a minute. It shows how many people are active right now, and
          it tells us when you are active for the first time in a day or a
          week, for the use totals below. The &ldquo;active now&rdquo; number
          that people see in the app counts each campus on its own. It leaves
          out a campus unless at least 5 people besides the viewer are active
          there and at least 5 besides the viewer are not, so it never shows
          for a campus of fewer than 10 people. It is never under 5, and it can
          be lower than the number of people active. The Vibe team&apos;s own
          usage page shows the exact number.
        </li>
        <li>
          <strong>Use totals.</strong> We count how many people use Vibe each
          day and each week. The first time your browser checks in on a day, we
          add one to that day&apos;s count, to the count for your school system
          (IU or Purdue), and to the count for the kind of device: a phone, a
          computer, or Vibe added to your Home Screen (or installed from your
          browser on a computer). Your browser works out the kind itself, and
          we keep only that word, never the browser&apos;s name or details. The
          first time you check in during a week, we add one to that week&apos;s
          count and, in your first few weeks on Vibe, to a count of people who
          joined Vibe in the same week as you, so we can see how many come
          back. We also count how many times Otto and the campus map are
          opened. Each browser tab counts an open at most once every 10
          minutes, and a day&apos;s opens stop at ten times the number of
          people active that day (at least ten), so one account cannot inflate them without
          limit. These totals are numbers for each day or week and nothing
          else: no account, no IP address, no browser name or version and no
          time of day. To know a check-in is your first that day or week, we
          compare it with your last-active time, and we store nothing else
          about you for this. The Vibe team&apos;s own accounts are not
          counted. A total does not say who was active, but on a quiet day, or
          for a small sign-up week, it can come from one person.
        </li>
        <li>
          <strong>Page opens.</strong> We count how many times three pages are
          opened by a browser that is not signed in: the front page, the
          waitlist page and the sign-up page. The count is one number for each
          day, page and link label. The label is the short tag on the link you
          came in on, if it had one, for example one that says the link was
          posted on Instagram. The tally holds no account, no IP address, no
          browser or device details, no cookie, no address of the page you came
          from and no time of day. Opens by search engines and other automated
          tools that name themselves are left out. To tell them apart, our
          server looks at the name your browser gives itself. The tally does
          not keep it. To stop someone inflating the numbers, we also count the
          opens from each network in an hour and in a day. We keep that count
          under a scrambled code made from the network (an IP address or part
          of one), the day and a secret only our servers hold, not under the
          address, and the code changes every day.
        </li>
        <li>
          <strong>Abuse counts.</strong> We count how often some actions happen,
          mostly per account. A few counts are kept under a scrambled code
          made from an email address, not under the address. A few are kept
          under a scrambled code made from a network (an IP address or part of
          one), the day and a secret only our servers hold, and a
          network&apos;s code changes every day. The network counts include
          how often a browser that is not signed in opens a profile, a club
          page or a post&apos;s share link, in an hour and in a day. They do
          not say which page was opened. We delete each count within three
          days. The parts of the database that we built hold no IP address.
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
            by their labels and never what you typed. Until October 12, 2026 a
            speed report could also name the thing you tapped, or the largest
            thing on your screen, by its label, and some labels hold a
            person&apos;s name, such as the button that opens their profile.
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
