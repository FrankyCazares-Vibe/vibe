import { LegalP, LegalTable, LegalUL } from "@/components/legal/LegalLayout";

import { Mail, PageLink, Sec, SectionH2 } from "./parts";

/** Privacy Policy sections 11 to 15. The wording is
 *  privacy-policy-publish.md's (see page.tsx): do not reword it here. */
export function Sections11To15() {
  return (
    <>
      {/* The waitlist form links to /legal/privacy#waitlist. The wrapping
          section carries that second name; the heading inside keeps
          #section-11, and both land on the same spot. */}
      <section id="waitlist" style={{ scrollMarginTop: 24 }}>
        <SectionH2 n={11} />
        <LegalP>
          Joining the waitlist does not make an account, and it is not agreeing
          to this policy. This section is our notice to you.
        </LegalP>
        <LegalP>
          <strong>What we collect.</strong> From the form: your school email
          (IU or Purdue only) and your name. If you give them: your year,
          major, the clubs you are in, whether you run a club and which one,
          and one line on what you would want from Vibe. We also store:
        </LegalP>
        <LegalUL bullets>
          <li>your university, from the address;</li>
          <li>where you found us, if your link carried a tag saying so;</li>
          <li>
            when you sent the form with each box checked: &ldquo;I&apos;m 18 or
            older and a current student&rdquo;, &ldquo;Email me when it&apos;s
            my turn&rdquo;, and the optional &ldquo;Also send me Vibe
            news&rdquo;;
          </li>
          <li>
            the state of your entry: when we emailed you, when you confirmed,
            your wave (we let people in one group at a time), and when a code
            was sent and by which cofounder;
          </li>
          <li>
            a log of each email we send you (its kind, the part of the address
            after the @, the time, whether it was sent), with a scrambled code
            in place of your address. The code cannot be turned back into the
            address.
          </li>
        </LegalUL>
        <LegalP>
          The entry stores no IP address (the number that identifies your
          internet connection), browser, device or location, and the waitlist
          pages set no cookie. To stop abuse they count requests by IP address,
          and those counts can stay for weeks.
        </LegalP>
        <LegalP>
          <strong>Why.</strong> To confirm your spot, choose who gets in each
          wave and email you your access code. No news email exists. If we ever
          send one, it is meant only for people who checked the news box. That
          checkbox is deleted with your entry, so we would have to ask you
          again.
        </LegalP>
        <LegalP>
          <strong>If a cofounder adds you</strong> because you asked us, you
          checked no boxes. We store the address you gave us, your name, your
          clubs, your wave and who added you. Your first email from us is the
          access code. The same 40 days apply.
        </LegalP>
        <LegalP>
          <strong>Who handles it.</strong> Supabase stores it, Vercel runs the
          site and the daily clean-up, and Resend sends our emails. Fonts load
          from Google and error reports go to Sentry. Vercel&apos;s visit logs
          see the code in our email links. Emails to a school mailbox are
          carried by your university&apos;s mail system. We send the
          universities nothing else.
        </LegalP>
        <LegalP>
          <strong>Who at Vibe sees it.</strong> The three cofounders see the
          list with addresses partly hidden (the first letter and the part
          after the @), next to your name and answers and, once you sign up,
          your handle. A cofounder we have set up to do it can see a full
          address, one person at a time, and each look is logged first. A reply
          to one of our emails lands in our support inbox with your full
          address, outside this list and outside the 40 days. The form gives
          everyone the same answer, so it does not show who is on the list.
        </LegalP>
        <LegalP>
          <strong>How long.</strong>
        </LegalP>
        <LegalTable
          head={["What", "How long"]}
          rows={[
            ["Your answers", "Up to 40 days after you join the list"],
            [
              "An entry you never confirm",
              "Up to 30 days after its last confirm email",
            ],
            ["The confirm link", "Works for 7 days"],
            ["An access code", "Works once, for up to 14 days"],
          ]}
        />
        <LegalP>
          The 40 days hold whatever state your entry is in. A daily clean-up
          deletes the whole entry. Sending the form again before you confirm
          starts the 40 days again, with your new answers.
        </LegalP>
        <LegalP>
          <strong>Leaving sooner.</strong> Every waitlist email has a
          &ldquo;Take me off the list&rdquo; link. Open it, tap &ldquo;Yes,
          take me off&rdquo;, and your entry is deleted right away. Use our
          newest email, because an older link may no longer work. With no email
          from us, write to <Mail box="hello" /> from that address. After you
          make an account, the entry goes with the clean-up or when you delete
          the account.
        </LegalP>
        <LegalP>
          <strong>What stays after an entry is deleted.</strong> Our email log,
          without the scrambled code. Resend&apos;s own record of the emails it
          sent, with your address and, in the access-code email, your name and
          the code. We have not confirmed how long Resend keeps it. Our log of
          cofounder actions, with no name or address.
        </LegalP>
        <LegalP>
          <strong>When you sign up with a code.</strong> The email you sign up
          with is stored on your waitlist entry, linked to your new account,
          until the entry is deleted. Your account keeps a record of the code
          and a wave note (the wave, how you came, the day the code was sent
          and the day you joined), deleted with the account. Your waitlist
          answers are not copied into your profile. A few addresses we list
          ourselves can sign up without a code. That list keeps the address and
          a reason, even after the account is deleted.
        </LegalP>
        <LegalP>
          <strong>Questions,</strong> or want a copy of your entry? Write to{" "}
          <Mail box="hello" />.
        </LegalP>
      </section>

      <SectionH2 n={12} />
      <LegalP>
        If we learn an account belongs to someone under 18, we close it and
        take its content down. We then aim to delete its information ourselves,
        except what the law requires us to keep. Closing an account works like
        a ban and keeps the scrambled codes in <Sec to="9">section 9</Sec>.
        Once the person turns 18 they can ask <Mail box="help" /> to let that
        school email be verified again.
      </LegalP>

      <SectionH2 n={13} />
      <LegalP>
        When you check the box we record the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> version, the time on our
        server, that you confirmed you are 18 or older, and which screen you
        accepted on. The record is deleted with your account.
      </LegalP>
      <LegalP>
        <strong>One version.</strong> Your checkbox covers the{" "}
        <PageLink href="/legal/terms">Terms</PageLink> and this policy
        together, under one recorded version. When that version changes, Vibe
        asks you to accept again the next time you open it. Using Vibe does not
        count as agreeing. This version of the policy was published before the
        recorded version was changed. If you made your account before the date
        at the top, this page is our notice to you, and you are asked to accept
        it when the version next changes.
      </LegalP>

      <SectionH2 n={14} />
      <LegalP>
        Vibe is run from Indiana. The choices in <Sec to="9">section 9</Sec>{" "}
        are open to everyone, free, wherever you live. If the law where you
        live gives you more rights, write to us and we will honor them as far
        as that law requires.
      </LegalP>

      <SectionH2 n={15} />
      <LegalP>
        <strong>CONNECTVIBE. LLC</strong>, an Indiana limited liability company
      </LegalP>
      <LegalTable
        head={["Write to", "For"]}
        rows={[
          [
            <Mail key="hello" box="hello" />,
            "Questions about Vibe or this policy, and a copy of your data",
          ],
          [
            <Mail key="help" box="help" />,
            "Safety, reports, appeals, takedowns, child safety and account help",
          ],
        ]}
      />
      <LegalP>
        Copyright complaints: see the{" "}
        <PageLink href="/legal/terms">Terms of Service</PageLink>.
      </LegalP>
      <LegalP>
        This policy:{" "}
        <PageLink href="/legal/privacy">connectvibe.app/legal/privacy</PageLink>
        . Terms:{" "}
        <PageLink href="/legal/terms">connectvibe.app/legal/terms</PageLink>.
      </LegalP>
    </>
  );
}
