import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, Sec, WaitlistSection } from "./parts";

/** Privacy Policy section 11, the waitlist notice. The wording is
 *  privacy-policy-final.md's: do not reword it here. WaitlistSection draws
 *  the heading and answers to both #waitlist and #section-11. */
export function Section11Waitlist() {
  return (
    <WaitlistSection>
      <LegalP>
        Joining the waitlist does not make an account, and it is not agreeing to
        this policy. This section is our notice to you: it says what we do with
        what you send. You must be 18 or older to join (
        <Sec to="12">section 12</Sec>).
      </LegalP>

      <LegalP>
        <strong>What does Vibe collect?</strong>
      </LegalP>
      <LegalP>
        You must give: your school email (IU or Purdue only) and your name.
      </LegalP>
      <LegalP>You can also give:</LegalP>
      <LegalUL bullets>
        <li>your year and major;</li>
        <li>the clubs you are in;</li>
        <li>whether you run a club, and which one;</li>
        <li>one line on what you would want from Vibe.</li>
      </LegalUL>
      <LegalP>We add:</LegalP>
      <LegalUL bullets>
        <li>your university, read from your address;</li>
        <li>
          where you found us, if your link carried a label saying so;
        </li>
        <li>the time you sent the form;</li>
        <li>
          which of its boxes you checked: the one confirming you are 18 or
          older, &ldquo;Email me when it&apos;s my turn&rdquo;, and the optional
          &ldquo;Also send me Vibe news&rdquo;;
        </li>
        <li>which version of the form&apos;s notice you saw;</li>
        <li>
          where your entry stands: when we emailed you, when you confirmed and
          which wave you are in. A wave is one group we let in at a time;
        </li>
        <li>when your access code was sent, and which cofounder sent it;</li>
        <li>
          a log of each email we send you. It holds its kind, the part of your
          address after the @, the time and whether it was sent. It also holds
          the reference number our email service (Resend) gave the message. In
          place of your address the log holds a scrambled code, which cannot be
          turned back into the address. Our servers can still test whether a
          given address matches it (<Sec to="3d">section 3d</Sec>).
        </li>
      </LegalUL>
      <LegalP>
        Your entry holds no IP address (the number that identifies your internet
        connection), no browser, no device and no location. The waitlist pages
        set no cookie. Each time the waitlist page is opened by a browser that
        is not signed in, we add one to a tally for that day and for the link
        label, if the link had one. The tally holds no IP address, no browser,
        no device and no cookie (<Sec to="3d">section 3d</Sec>). Apart from
        your entry and that tally, three counts stop abuse. The waitlist pages
        count how often each network uses them, under a scrambled code that
        changes every day, not the address. The form counts how often one
        school address is sent in, and keeps that count under a scrambled code,
        not the address. The tally counts the opens from each network under a
        scrambled code that changes every day, not the address. We delete these
        counts within three days.
      </LegalP>
      <LegalP>
        One more place could hold what you typed. Sentry is the service we use
        to find bugs. Until our release of October 5, 2026, an error or speed
        report made as the form was sent could include everything typed into
        it, the address included. That release is built to keep what you type
        out of new reports, and we have not yet confirmed that it does (
        <Sec to="3d">section 3d</Sec>).
      </LegalP>

      <LegalP>
        <strong>Why?</strong> To confirm your spot, choose who gets in each wave
        and email you your access code. Whether you run a club is one of the
        things we look at when we choose a wave. If you said you run a club, a
        cofounder may also write to you about setting up its page on Vibe. We
        read your line on what you would want from Vibe to learn what to build.
        No news email exists. If we ever send one, it goes only to people who
        checked the news box. It will carry a postal address and an unsubscribe
        link that keeps working. That checkbox is deleted with your entry, so we
        would have to ask you again.
      </LegalP>

      <LegalP>
        <strong>If a cofounder adds you</strong> because you asked us, you
        checked no boxes. We store the address you gave us, your name, your
        clubs, whether you help run one, your wave and who added you. Your first
        email from us is the access code. The same 40 days apply.
      </LegalP>

      <LegalP>
        <strong>Which companies handle it?</strong> Supabase stores it, Vercel
        runs the site and the daily clean-up, and Resend sends our emails. Fonts
        load from Google. Error reports, speed reports and visit signals go to
        Sentry. The film on the front page loads from Vercel&apos;s file
        storage. When you open a link from one of our emails, Vercel&apos;s
        visit logs record its web address, including the code inside the link.
        Emails to a school email are carried by your university&apos;s mail
        system. We send the universities nothing else. The AI coding assistant
        we build Vibe with (Claude, made by Anthropic) may see the list on
        screen when the cofounder with direct access tests the admin tools with
        it. <Sec to="6">Section 6</Sec> says more about each company.
      </LegalP>

      <LegalP>
        <strong>Who at Vibe sees it?</strong> The three cofounders see the list.
        Each address is partly hidden: only its first letter and the part after
        the @ show. Beside it they see your name, your answers and, once you
        sign up, your handle. A cofounder who has been given that permission can
        show a full address, one entry at a time. Each time is logged before the
        address appears. A reply to one of our emails goes through Cloudflare,
        which forwards our mail, to the personal Gmail inbox of the cofounder
        with direct access (<Sec to="3g">section 3g</Sec>). It arrives with your
        full address, outside this list and outside the 40 days. The form is
        built to show the same message whether or not an address is already on
        the list. That way nobody can use it to find out who joined.
      </LegalP>

      <LegalP>
        <strong>How long does Vibe keep it?</strong>
      </LegalP>
      <LegalTable
        head={["What", "How long"]}
        rows={[
          [
            "Your entry (your address, name and answers)",
            "Up to 40 days after you join the list",
          ],
          [
            "An entry you never confirm, with no access code sent",
            "Up to 30 days after its last confirm email",
          ],
          ["The confirm link", "Works for 7 days"],
          ["An access code", "Works once, for up to 14 days"],
          ["A club setup link", "Works once, for up to 7 days"],
          [
            "A club's members' link",
            "Works for 3 weeks and up to 150 sign-ups, while the club leaves it on",
          ],
        ]}
      />
      <LegalP>
        The 40 days are the longest any entry stays, whether or not you
        confirmed, got an access code or made an account. One thing starts them
        again: the form being sent again for your address before you confirm.
        That also replaces the answers, and anyone who types your address can do
        it. A clean-up is scheduled to run once a day and delete the whole
        entry.
      </LegalP>

      <LegalP>
        <strong>How do I leave sooner?</strong> Every waitlist email has a
        &ldquo;Take me off the list&rdquo; link. Open it, tap &ldquo;Yes, take
        me off&rdquo;, and your entry is deleted right away. Use our newest
        email, because an older link may no longer work. If a link does not
        work, or you have no email from us, write to <Mail box="hello" /> from
        the address you joined with. We reply to that address, and take you off
        by hand once you answer that reply. Once your access code has made an
        account, the link stops offering this. Your entry then goes with the
        clean-up, or sooner if you delete the account.
      </LegalP>

      <LegalP>
        <strong>What stays after an entry is deleted?</strong>
      </LegalP>
      <LegalUL bullets>
        <li>
          Our email log, without the scrambled code. It keeps the reference
          number Resend gave each message.
        </li>
        <li>The abuse counts, which we delete within three days.</li>
        <li>
          Resend&apos;s own record of the emails it sent you. It holds your
          address and, for the access-code email, your name and the access code.
          We have not confirmed how long Resend keeps it.
        </li>
        <li>
          Sentry&apos;s reports, if one was made while you used the form.{" "}
          <Sec to="3d">Section 3d</Sec> says what such a report can hold. We
          have not confirmed how long Sentry keeps them.
        </li>
        <li>
          Our log of what each cofounder did on the waitlist. It holds no name
          and no address.
        </li>
        <li>
          A reply you sent us, in the Gmail inbox, and Vercel&apos;s visit logs.
        </li>
      </LegalUL>

      <LegalP>
        <strong>When you sign up with an access code.</strong> The email you
        sign up with is stored on your waitlist entry, linked to your new
        account, until the entry is deleted. Your account keeps a record of the
        access code you used and a wave note. The note holds your wave, how you
        got in (through the form or added by a cofounder), the day your access
        code was sent and the day you joined. Both are deleted with the account.
        Your waitlist answers are not copied into your profile.
      </LegalP>
      <LegalP>
        We keep a short list of addresses that can sign up without an access
        code. For each one the list holds the address, the reason, an optional
        short note and the date. Deleting your account in Settings takes your
        address off the list. If we delete your account for you, we take it off
        by hand.
      </LegalP>

      <LegalP>
        <strong>When you sign up through a club link.</strong> A club link lets
        someone with a school email sign up, even while sign-up is closed. There
        are two kinds:
      </LegalP>
      <LegalUL bullets>
        <li>
          <strong>A club setup link.</strong> A cofounder makes it in the admin
          tools and hands it, in person, to the person who will run a new club.
          It works once, for up to 7 days. The person who signs up with it, or
          who opens it signed in and taps &ldquo;Make me the owner&rdquo;,
          becomes the owner of the new club.
        </li>
        <li>
          <strong>A club&apos;s members&apos; link.</strong> A club that Vibe
          has checked can have one. Its owner and officers share it. It stops
          working 3 weeks after it was made, once 150 people have signed up
          through it, or when they turn it off. It asks the person who opens it
          to join the club.
        </li>
      </LegalUL>
      <LegalP>
        While your sign-up is under way, we store the email address you typed
        and the time, with the link. That keeps one link from being used by two
        people at once, and counts the 150. Once your account is set up, we drop
        the address. Your account then keeps a record of which link let you in
        and when, whether you joined or made the club through it and when, and
        when you chose &ldquo;Not now&rdquo;, if you did. If you already have an
        account and join a club or make one through a club link, your account
        keeps a record of that link and when. The sign-in system does not keep
        the link&apos;s code with your account, only a scrambled form of it.
        The record is deleted with your account.
      </LegalP>
      <LegalP>
        If no account is made with the address, its place on the link is let go
        after 15 minutes. A place never tied to an account is let go after 30
        days. A place that is let go is deleted, with its address, the next time
        someone signs up through that link. After a link stops working, nothing
        deletes such a place yet. Deleting an account also deletes any place
        its address still holds.
      </LegalP>
      <LegalP>
        For each link we keep who made it, a cofounder or an officer, and when.
        We also keep a members&apos; link&apos;s code, so its owner and officers
        can show the link again. They see how many people joined the club
        through it, never who. Our database stores no IP address for any of
        this. When you open a club link, Vercel&apos;s visit logs record its web
        address, including the code inside it (<Sec to="6">section 6</Sec>).
      </LegalP>

      <LegalP>
        <strong>Questions,</strong> or want a copy of your entry? Write to{" "}
        <Mail box="hello" /> from the address you joined with.
      </LegalP>
    </WaitlistSection>
  );
}
