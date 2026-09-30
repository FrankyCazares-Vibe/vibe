# The analysis frame Franky brought (written by ChatGPT, pasted 2026-09-29)

Use it as the checklist of what the Terms and the companion must cover. It is a frame, not a fact source: where it assumes a feature, check `00-code-facts.md`.

---

ACCOUNT REGISTRATION — .EDU AND PERSONAL EMAIL ADDRESSES
The platform allows users to create or maintain accounts using:

* a college/university `.edu` email address; and/or
* a personal email address, such as Gmail, Outlook, iCloud, Yahoo, or another provider.

The legal documents must NOT assume that possession of a `.edu` email address conclusively establishes that a person is:

* a currently enrolled student;
* an employee of the institution;
* authorized to represent the institution;
* authorized to represent a student organization;
* currently affiliated with the institution;
* the person they claim to be.

Similarly, use of a personal email address does not independently establish or disprove campus affiliation.

1. ACCOUNT AND EMAIL VERIFICATION
Draft provisions explaining:

* whether users must verify control of their email address;
* whether email verification establishes only control/access to the email address;
* what additional verification, if any, is used to establish campus affiliation;
* whether users can add both a personal and `.edu` email;
* which email is considered the primary account email;
* whether users can change their primary email;
* what happens if access to an email address is lost;
* account-recovery procedures;
* what happens when a university disables a student's `.edu` email after graduation;
* what happens when a student transfers institutions;
* what happens when a student withdraws, graduates, is suspended, or otherwise loses an institutional affiliation;
* whether alumni may retain accounts;
* whether faculty, staff, applicants, prospective students, parents, or other non-students may create accounts.

Do not make claims about identity verification that exceed what the actual technical system verifies.

2. CAMPUS AFFILIATION
Create precise definitions for concepts such as:
"Campus"
"Campus Community"
"Student"
"Campus Affiliation"
"Verified Email"
"Verified Campus Affiliation"
Only use terms such as "verified student" if the underlying verification process reasonably supports that representation.
Determine whether `.edu` verification should mean something narrower, such as:
"Verified access to an email address associated with the applicable educational institution."
Do not automatically equate email-domain verification with verification of enrollment or identity.

3. PERSONAL EMAIL ACCOUNTS
Determine how personal-email users interact with campus-specific portions of the platform.
Analyze scenarios including:

* a legitimate student registering with Gmail;
* a student whose institution does not issue `.edu` addresses;
* an international institution using a different academic domain;
* an alumnus retaining a `.edu` address;
* a university employee possessing a `.edu` address;
* an applicant receiving a university email before enrollment;
* a former student retaining email access;
* a person gaining unauthorized access to another person's university email;
* someone creating a personal-email account and falsely claiming to attend a university.

Determine which functionality, if any, should require stronger campus verification.
Do not solve product-level identity problems merely by placing liability disclaimers in the Terms.

4. UNIVERSITY AFFILIATION DISCLAIMER
Draft appropriate language explaining that, unless expressly stated otherwise:

* the platform is independently operated;
* availability of a university-specific community does not necessarily mean the university sponsors or operates it;
* verification of an institution-associated email address does not mean the institution endorses the user;
* a student organization's presence on the platform does not necessarily mean the institution endorses that organization;
* use of an institution's name for identification purposes should not imply sponsorship or partnership.

Flag university names, logos, seals, trademarks, branding, and representations of official affiliation for separate intellectual-property review.

5. ORGANIZATION ACCOUNTS
Email verification must NOT automatically authorize a person to represent a student organization.
Develop separate rules for determining who may:

* create an organization account;
* claim an existing organization;
* become an administrator;
* remove another administrator;
* transfer ownership/control;
* purchase premium features;
* cancel paid features;
* change payment information;
* delete the organization account.

Stress-test officer turnover.
Example:
A club president creates the organization account using their university email, purchases premium features using Stripe, graduates, loses access to their university email, and a new president requests control.
Determine:

* how control should be transferred;
* what evidence may be requested;
* what happens to the subscription;
* whether the previous administrator's personal payment method remains attached;
* who may cancel the subscription;
* who may request a refund;
* how disputes between competing officers are handled;
* whether the platform may temporarily freeze administrative changes during a dispute.

Do not assume the student organization itself is a separate legal entity.

6. ACCOUNT RECOVERY AND EMAIL CHANGES
Stress-test:

* lost `.edu` access;
* lost personal-email access;
* compromised email accounts;
* hacked platform accounts;
* changed university domains;
* university email deactivation;
* graduation;
* transfer;
* account recovery fraud;
* unauthorized email changes;
* conflicting recovery requests.

Draft contractual authority allowing reasonable identity/account-control verification before restoring access.
Identify corresponding engineering controls that should exist rather than relying entirely on contractual language.

7. PRIVACY POLICY CROSS-CHECK
Determine what the Privacy Policy should disclose concerning collection and processing of:

* email addresses;
* email domains;
* educational institution affiliation;
* verification status;
* account-recovery information;
* organization affiliation;
* Stripe-related account/payment information;
* login/security information;
* IP addresses and device information, if actually collected.

Do not claim that information is collected unless confirmed by the actual product architecture.
Determine what information is:

1. provided directly by users;
2. generated through verification;
3. obtained from Stripe;
4. automatically collected;
5. publicly displayed;
6. visible only to other campus users;
7. visible to organization administrators;
8. retained after account deletion.

8. SECURITY / ABUSE RED TEAM
Attempt to abuse the `.edu` + personal-email system.
Test scenarios including:

* stolen university credentials;
* disposable email accounts;
* fake personal accounts;
* alumni with active `.edu` addresses;
* shared organization email addresses;
* transferring accounts;
* impersonating another student;
* impersonating professors;
* impersonating university officials;
* impersonating campus organizations;
* multiple accounts;
* ban evasion using another email;
* changing from `.edu` to personal email after verification;
* changing universities;
* buying/selling verified accounts;
* compromised organization accounts.

For each scenario identify:

1. contractual protection;
2. missing contractual protection;
3. technical safeguard;
4. moderation/operational safeguard;
5. privacy implication;
6. whether legal review is warranted.

9. DO NOT OVERSTATE VERIFICATION
Search the entire Terms of Service, Privacy Policy, Community Guidelines, marketing language, onboarding flow, and UI for statements such as:
"verified student"
"verified campus"
"students only"
"only students can join"
"verified university student"
"safe campus community"
"authenticated students"
For every statement, determine whether the actual verification mechanism supports the representation.
Flag discrepancies between marketing language and actual verification.

10. REQUIRED OUTPUT
After analysis, provide:
A. proposed Terms of Service language;
B. Privacy Policy provisions;
C. Community Guidelines provisions;
D. organization-account provisions;
E. account recovery rules;
F. recommended `.edu` verification UX;
G. personal-email account rules;
H. engineering/security requirements;
I. unresolved product decisions;
J. questions for outside counsel.

Finally, adversarially review all recommendations from the perspectives of:

* a malicious user;
* a banned user attempting to return;
* a student disputing an impersonation;
* a former club officer;
* a new club officer;
* a university;
* a privacy regulator;
* a consumer-protection regulator;
* plaintiff's counsel;
* startup defense counsel.

Revise the proposed language after completing that review.
