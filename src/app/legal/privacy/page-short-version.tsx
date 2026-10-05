// "The short version": the ten numbered items above section 1, word for word
// from privacy-policy-final.md. Not a route: only page.tsx is one. Imported
// only by page.tsx.
import {
  LegalCallout,
  LegalOL,
  LegalP,
  LegalUL,
} from "@/components/legal/LegalLayout";

import { PageLink, Sec } from "./parts";

export function ShortVersion() {
  return (
    <LegalCallout id="short-version" title="The short version">
      <LegalOL>
        <li>
          <strong>Your profile and your posts are public.</strong> Anyone on the
          internet can open most of your profile and read your posts, and search
          engines can list them. A block does not hide them from someone who is
          signed out.
        </li>
        <li>
          <strong>Club pages are public too.</strong> They show the club&apos;s
          12 newest posts and who wrote each one. What you join, follow and post
          can show personal things about you, such as your religion, your
          politics or your health.
        </li>
        <li>
          <strong>Everyone in a chat sees every message in it.</strong> A person
          added later can read everything sent before they joined. In a club
          room, treat what you write as readable by every member, even one you
          blocked.
        </li>
        <li>
          <strong>Vibe can read messages, and does so only in six cases:</strong>
          <LegalUL bullets>
            <li>when one is reported;</li>
            <li>when someone in the chat asks us to or agrees;</li>
            <li>
              when we have specific evidence of a serious break of the Terms,
              such as threats or spam;
            </li>
            <li>when the law requires it;</li>
            <li>when a fault in the chat cannot be fixed any other way;</li>
            <li>
              when we believe someone is in danger of death or serious injury,
              or a child is at risk.
            </li>
          </LegalUL>
          <LegalP>
            This is our own rule, not a lock. Until our release of October 5,
            2026, a copy of a message&apos;s text could also reach the outside
            service we use to find bugs. That release is built to stop it, and
            we have not yet confirmed that it does (
            <Sec to="3d">sections 3d</Sec> and <Sec to="5h">5h</Sec>).
          </LegalP>
        </li>
        <li>
          <strong>One cofounder can reach everything Vibe stores.</strong> All
          three cofounders moderate Vibe, and all three can see a copy of
          anything that is reported. Mail you send us lands in that one
          cofounder&apos;s personal Gmail inbox.
        </li>
        <li>
          <strong>We record what you look at.</strong> When you are signed in,
          we record each profile you open and each post you open or stop on in
          the feed. You cannot turn this off. Anyone signed in sees how many
          people looked. With Vibe+, the person you looked at also sees who.
          Vibe+ is a paid plan that is not on sale yet. We can give it to an
          account ourselves, and any account that has it sees names today.
        </li>
        <li>
          <strong>
            You can delete your account in{" "}
            <PageLink href="/settings">Settings</PageLink>, right away.
          </strong>{" "}
          There is no undo, and we keep no backups. Your posts are deleted, and
          your messages are deleted from other people&apos;s chats too. Records
          of reports and bans stay. So do a few kinds of files and a few logs,
          and one of those logs can still hold your email address (
          <Sec to="8">sections 8</Sec> and <Sec to="9">9</Sec>).
        </li>
        <li>
          <strong>Photos and videos can show where you were.</strong> On new
          uploads we strip the hidden location from your profile photo, your
          cover and the photos on your own posts. Videos, chat photos and
          anything posted as a club keep it, and posts are public.
        </li>
        <li>
          <strong>No selling, no ads.</strong> We do not sell your information.
          Vibe has no ads and no AI features, and we do not train AI on what you
          post. We do build Vibe with an AI coding assistant made by another
          company. <Sec to="6">Section 6</Sec> says what it may see. We have not
          yet confirmed whether that company may use what it is shown to improve
          its AI models. In all, seven outside companies handle your information
          so that Vibe can run (<Sec to="6">section 6</Sec>).
        </li>
        <li>
          <strong>
            &ldquo;Verified&rdquo; does not mean &ldquo;student&rdquo;, and Vibe
            is for people 18 or older.
          </strong>{" "}
          &ldquo;Verified&rdquo; means an account could once read mail at an
          @iu.edu or @purdue.edu address. It does not prove the person is a
          student, or is who they say. The age rule covers the waitlist too, and
          you confirm it with a checkbox.
        </li>
      </LegalOL>
    </LegalCallout>
  );
}
