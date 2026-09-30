# Fact-check: bank.md (checked 2026-09-25)

Checked against the bank's own pages, IRS.gov, FinCEN, Indiana SOS, and Stripe/Mercury help centers.
Anything without a primary source is marked UNVERIFIED. The research file was not edited.

**Bottom line:** The plan holds up. Mercury first, IMCU as backup, EIN first, and $0 on the Mercury path are all sound.
There are **three things to fix before James acts**:

1. The late-filing penalty is **$260**, not $255.
2. Bluevine's user and card limits are wrong.
3. IMCU needs **$50 to open**.

Several items the doc marked UNVERIFIED are now confirmed (details below).

---

## Must fix (wrong or misleading)

| # | What bank.md says | What the primary source says | Source |
|---|---|---|---|
| 1 | Late Form 1065 costs "about $255 per member per month" | For a return **due in 2027** (our 2026 return), the penalty is **$260** per partner per month, up to 12 months. $255 applies to returns due in 2026. | IRS Rev. Proc. 2025-32 §4.55 (irs.gov/pub/irs-drop/rp-25-32.pdf); Rev. Proc. 2024-40 §4.56 for the $255 |
| 2 | Bluevine: "One main holder + up to 9 employee cards" | Bluevine's FAQ: "A total of 50 physical and virtual debit cards can be issued," and the admin "can invite your partners and team members to become additional users." "No joint accounts" comes only from NerdWallet, not Bluevine. | bluevine.com/faq |
| 3 | IMCU: to open, "small savings share (amount UNVERIFIED)" | **$50 minimum to open** each business checking account, plus a required membership savings account. | imcu.com/business/business-checking- (comparison table) |
| 4 | Mercury ID: "each founder or majority owner" | Mercury's help center says it needs ID for **everyone with 25% or more**, plus one person with operating control. With three roughly equal members, **all three verify**. The marketing-page wording undersells this. Step 4 in bank.md already says this correctly. | support.mercury.com, "Eligibility and requirements…" (updated 2026-09-19); "Company structures Mercury supports" |
| 5 | Chase: "Branch only for multi-member LLCs. Every member must be there" | This is true only if the LLC is **member-managed**. Chase: a "Member-managed LLC—all members" and a "Manager-managed LLC—all managers" must be present. An LLC "managed by a single member or manager" can open **online**. So the answer depends on how the Articles set up management. | chase.com Business Complete page; chase.com/business/resources/business-bank-account-information |
| 6 | "Mercury and Relay turn down … registered-agent addresses" | Mercury: yes (no registered agent, PO box, or UPS box). Relay: a registered-agent address **is** allowed as the legal address if you also give a real operating address. Relay only bans PO boxes and virtual mailboxes. The advice to use a real street address still stands. | Relay "Required Documents…by Entity Type" |
| 7 | "Responsible party = James (**he filed the LLC**)" | The IRS test is who "ultimately owns or controls the entity," not who filed it. James can be the responsible party only if he is a member or manager with real control. Any later change has to be reported within 60 days on Form 8822-B. | IRS Instructions for Form SS-4 |
| 8 | Digital EIN letter copy "UNVERIFIED" | **It exists.** Business Tax Account users can download a digital CP575 that replaces Letter 147C and that banks accept. **But** for multi-member LLCs filing Form 1065, "Designated Official" access is still "coming soon." For us, today, the fallback is still a phone call for Letter 147C. So James still needs to save the PDF the day he gets it. | irs.gov/businesses/employer-identification-number (17-Jul-2026); irs.gov/businesses/business-tax-account (24-Aug-2026) |
| 9 | Mercury: Franky "sees the account and routing numbers in his own login" | This works only if Franky gets an **Admin, Accountant, or custom** role. Mercury's "Teammate" role "cannot view account balances or account numbers." Pick the role on purpose. | support.mercury.com, "Understanding roles and permissions" (updated 2026-09-22) |
| 10 | "Cost of all of this: $0" | True for the Mercury path. The IMCU backup costs a **$50 opening deposit** (still our money) plus a **$21.42** Certificate of Existence (a real fee). | IMCU page; Indiana SOS Certificate of Existence alert |

## UNVERIFIED items that are now confirmed

| Item | Finding | Source |
|---|---|---|
| Mercury approval time | "Usually within 0–2 business days." Linking an outside bank can speed it up. If 7 business days pass with no answer, check email for a document request. The Fri Oct 2 target is realistic. | support.mercury.com, "What happens after I submit…" (updated 2026-09-20) |
| Principal office change fee | **$0.** State Form 50656 (R8/01-26) says "NO FILING FEE." You can file it on INBiz. | forms.in.gov/Download.aspx?id=16992 |
| Certificate of Existence fee | **$21.42** on INBiz, emailed within minutes. The source is Indiana SOS's own 2022 alert, so check the INBiz fee calculator for the current amount. Certified copies of the Articles are **free** on INBiz. | in.gov/sos/business/files/Certificate-of-Existence-Alert-2022.pdf |
| Indiana operating agreement not required | The statute is permissive. IC 23-18-4-6 governs an operating agreement *if* one is adopted; nothing mandates one. We read the statute text through FindLaw (Justia blocked us). | codes.findlaw.com IC 23-18-4-6 |
| Indiana has its own partnership return | **Yes: Form IT-65.** Partnerships with Indiana-resident partners must file it, due the 15th day of the 4th month (**April 15, 2027** for 2026). We confirmed this from in.gov IT-65 booklet search results. The PDF text wouldn't extract, so read the booklet before relying on it. | forms.in.gov IT-65 booklets |

## Confirmed as written

- **EIN is free.** IRS: "You never have to pay a fee for an EIN." It's issued immediately with a printable confirmation letter (IRS, updated 19-Aug-2026).
- **Online EIN hours (Eastern):** Mon–Fri 6 a.m.–1 a.m., Sat 6 a.m.–9 p.m., Sun 6 p.m.–midnight. There's no save-and-return, and it times out after 15 minutes of inactivity. The limit is one EIN per responsible party per day (IRS + SS-4 instructions).
- **EIN name characters:** only A–Z, 0–9, hyphen, and ampersand, per the IRS Online EIN FAQ (read through a search snippet; the page didn't load directly) and Clerky. "CONNECTVIBE LLC" without the period is correct.
- **SS-4 line 8b** asks for the number of LLC members. Line 11 is the business start date.
- **Default tax status:** an LLC with 2+ members is a partnership unless it files Form 8832 (IRS LLC page, 29-May-2026). Form 1065 is due the 15th day of the 3rd month. March 15, 2027 is a Monday. **Nuance:** a partnership skips filing only if it has *no income and no deductible expenses*. Any spending (hosting, filing fees) means it files.
- **BOI:** FinCEN's final rule came out Aug 11 and took effect Aug 14, 2026. US companies are permanently exempt. FinCEN says anything referencing "Form 4022" or "Form 5102" is fraudulent (fincen.gov/boi).
- **Bank ID rule:** under 31 CFR 1010.230, banks identify everyone with 25%+ plus one controlling person. Chase collects details at **10%+** (Chase page).
- **Mercury:** $0/month base plan, no minimums, free ACH and domestic wires. "Apply in 10 minutes." It needs formation documents, the EIN document, and photo IDs. Home addresses are OK; PO, UPS, and registered-agent addresses are not. The partner banks are Choice Financial Group and Column N.A., Members FDIC. Unlimited team members with roles.
- **Mercury Stripe app** exists (Mercury blog, 2022). A Stripe App Marketplace listing appears in search results; we didn't open the listing itself.
- **Relay:** Starter $0, unlimited users, 20 accounts, up to 50 cards per cardholder per account. A **signed** operating agreement is required for multi-member LLCs. Every 25%+ owner must be invited. "Most … reviewed within 1–2 business days."
- **Chase Business Complete:** $15/month, waived with a $2,000 minimum daily ending balance (or Chase-only options). $0 to open, but it must be funded within 60 days. 2 IDs per person. An operating agreement or meeting minutes must list the members.
- **Bank of America Fundamentals:** "No monthly fee for the first 12 months," then $16. Waived with a $5,000 combined average balance, $500 in net debit purchases, or Preferred Rewards. "Some complex business types may require an in person financial center visit." *Missing watch-out:* BofA closes the account if it isn't funded within 45 business days.
- **Bluevine:** Standard plan is $0. Cash deposits cost up to $4.95 at Green Dot or $1 + 0.5% at Allpoint+ (Bluevine help center).
- **IMCU:** $0 monthly. The first 300 transactions are free. "Subject to credit approval." Debit cards are "issued instantly." It needs proof of federal tax ID, a Certificate of Existence, and a driver's license plus a second ID per signer, plus a CDD questionnaire. Member Services is 800-556-9268. It was founded in 1956 as the IU Medical Center FCU and is the "largest credit union in Central Indiana," with 33 branches. The Campus Center branch is at 420 University Blvd, IU Indy. Anyone who lives or works in Central Indiana can join.
- **Forum CU Business Select:** $0 monthly, 150 free transactions. Two IDs per signer, EIN verification, and Articles filed with Indiana.
- **Stripe:** "7-14 day waiting period for the first payout," which "cannot be waived under any circumstances." For an LLC, the payout account must be in the company's legal name or DBA. Unverified accounts get two micro-deposits marked "ACCTVERIFY" within 1–2 business days.
- **Novo / Found** (NerdWallet, secondary): Novo has no phone support, no cash deposits, and no joint accounts. Found is built for the self-employed, and commenters say frozen accounts are hard to resolve ("only email support is available for frozen accounts").
- **FDIC:** $250,000 per depositor, per bank, per ownership category. Credit unions (IMCU, Forum) are covered by the NCUA instead. The limit is the same, but the glossary's "FDIC" wording doesn't apply to them.

## Still UNVERIFIED (no primary source found)

- The LLC's state record showing principal office "NONE" and a May 8, 2026 effective date. INBiz public search blocks automated access, so James should confirm both in INBiz.
- "Mercury limits the account if the address on file is wrong." Mercury's address page only says it "may request documentation."
- Whether every IMCU signer or member must join the credit union, and whether the account can be opened entirely online. IMCU shows an "Open Account" online form, so "likely in person" isn't certain.
- Forum CU's opening deposit and whether it opens online.
- Approval times for Chase (same visit), Bank of America, and Bluevine.
- Whether an operating agreement "can come up" in Mercury review (third-party claim).
- "Everyone must be 18+." Not checked on each bank's site.
- "Fewer Indy branches than Chase." IBJ reports 19 BofA Indy-area centers, 12 of them full-service, but the article date isn't confirmed and we didn't check Chase's count.
