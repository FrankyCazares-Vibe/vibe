import { LegalP, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, Sec, SubH3 } from "./parts";

/** Privacy Policy sections 3e to 3h (part of sections 1 to 3: see
 *  sections-1-3.tsx). The wording is privacy-policy-final.md's: do not reword
 *  it here. */
export function Sections3eTo3h() {
  return (
    <>
      <SubH3 n="3e" />
      <LegalUL bullets>
        <li>
          No advertising tracker, and no outside tool that builds a profile of
          you. Sentry is the one outside tool that measures how Vibe is used:
          errors, speed and visits (<Sec to="3d">section 3d</Sec>). One other
          outside tool looks at your browser, for one job: Cloudflare&apos;s
          check that you are a person on the sign-in and sign-up pages (
          <Sec to="6">section 6</Sec>). What Vibe itself
          records about what you open is also in <Sec to="3d">section 3d</Sec>.
        </li>
        <li>
          We do not ask your device for its location, and we do not work one out
          from your IP address. Four things come close. Some photos and videos
          you upload carry a location inside the file (
          <Sec to="3c">section 3c</Sec>). Vercel adds a rough location to each
          request. Until our release of October 5, 2026, that could end up in a
          report to Sentry (<Sec to="3d">section 3d</Sec>). Each report your
          browser sends to Sentry carries the browser&apos;s language and time
          zone. And an event check-in records that you were at that event while
          it was on (<Sec to="3c">section 3c</Sec>). Vibe does not ask your
          device where it is to check you in.
        </li>
        <li>
          No date of birth, phone number, contact list or card number, and no
          sign-in through Google, Apple or anyone else.
        </li>
      </LegalUL>
      <LegalP>
        Vibe makes one automatic check. Before your text is saved, messages
        included, it is checked against a short list of blocked words.
      </LegalP>

      <SubH3 n="3f" />
      <LegalP>
        <strong>Paying for Vibe+.</strong> Vibe+ exists today only on accounts
        we give it to (<Sec to="5d">section 5d</Sec>). Once billing is on, you
        pay on Stripe&apos;s own pages and card numbers never reach us. We send
        Stripe only your Vibe account ID (a random label Vibe gives each
        account). We store your Stripe customer and subscription numbers, your
        Vibe+ status and a list of payment events. Vibe+ is not sold inside the
        iPhone or Android app.
      </LegalP>
      <LegalP>
        <strong>Notifications to your phone or browser.</strong> If you turn
        them on, we store the notification address your device gives us until
        you sign out, turn them off or delete your account. A notification shows
        the sender&apos;s name and, with previews on, up to 100 characters of
        the message. Browser notifications travel encrypted through the browser
        maker&apos;s service (Google, Apple, Mozilla or Microsoft). App
        notifications go through Firebase, a Google service, and on iPhone
        through Apple as well. Both companies can read them. After your first
        yes in the app, Firebase contacts Google each time the app opens, even
        after you turn notifications off or sign out.
      </LegalP>

      <SubH3 n="3g" />
      <LegalP>
        You need no account to email us a report, a request to take down an
        intimate image, or a child-safety tip. If you have an account, the
        Report button in the app is the fastest way. To recover an account we
        may ask for proof that it is yours.
      </LegalP>
      <LegalP>
        Mail to <Mail box="hello" /> or <Mail box="help" /> passes through
        Cloudflare, which forwards it to the personal Gmail inbox of the
        cofounder with direct access (<Sec to="1">section 1</Sec>). So Google
        holds it. That cofounder reads it, and it stays in that inbox until they
        delete it. The other two cofounders see a message only if it is passed
        on.
      </LegalP>
      <LegalP>
        We aim to delete recovery proof within 90 days after your request
        closes. A person has to do that. Nothing does it automatically.
      </LegalP>

      <SubH3 n="3h" />
      <LegalP>
        The apps are not in the stores yet. When they are, they will show the
        same Vibe as the website, inside an app, and everything on this page
        will apply to them. They add only this:
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>Permissions.</strong> The iPhone app asks for the camera,
          microphone and photo library only when you take, pick or save a photo
          or video. It asks for notifications only when you turn them on. The
          Android app asks only for notifications.
        </li>
        <li>
          <strong>Telling the site it is the app.</strong> Each request says it
          comes from the iPhone or Android app, so that we can show the right
          screens. We store that only next to a notification address, if you
          turn notifications on.
        </li>
        <li>
          <strong>Apple&apos;s notification service.</strong> The iPhone app
          registers with it each time it opens, even before you turn
          notifications on. No prompt shows, and Vibe&apos;s servers store
          nothing from that until you say yes.
        </li>
        <li>
          <strong>What they do not have.</strong> No location, no contacts, no
          advertising software, and nothing that follows you into other
          companies&apos; apps or websites. Sentry&apos;s reports (
          <Sec to="3d">section 3d</Sec>) work the same inside the app. The
          check that you are a person (<Sec to="6">section 6</Sec>) runs inside
          the apps too, because they show the same sign-in pages.
        </li>
        <li>
          <strong>The stores.</strong> If you install the app, Apple or Google
          knows you installed it and handles that under its own privacy policy.
        </li>
      </LegalUL>
    </>
  );
}
