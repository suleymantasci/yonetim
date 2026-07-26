import type { LocaleContent } from "../index";

/**
 * İngilizce pazarlama içeriği.
 *
 * Slug'lar Türkçe içerikle **aynı** tutulur: dil değiştiren kullanıcı aynı
 * yazıda kalır ve `hreflang` eşleşmesi doğru kurulur (SPEC Bölüm 10.1).
 * Mevzuat atıfları Türk hukukuna aittir; İngilizce metinde kanun adları
 * açıklanarak verilir.
 */
export const enContent: LocaleContent = {
  killerFeatures: [
    {
      slug: "whatsapp-sakin-deneyimi",
      title: "Check your balance over WhatsApp",
      description:
        "Residents write “balance” on WhatsApp without installing anything, see their debt instantly and pay by card. " +
        "Even your 70-year-old neighbour gets it right the first time.",
      detail:
        "It uses a rule-based command engine rather than AI: intent is detected with 90%+ accuracy and handed to the " +
        "manager when unclear. Replies inside Meta's service window are free of charge.",
      specRef: "3.1 / 3.2",
    },
    {
      slug: "seffaf-komisyon",
      title: "Transparent commission display",
      description:
        "The payment screen lists the platform fee and the bank commission on separate lines. No hidden deductions.",
      detail:
        "The most complained-about issue with competitors is “unfair service fee deductions”. We show every kuruş on the receipt.",
      specRef: "1.2",
    },
    {
      slug: "aidat-degisiklik-timeline",
      title: "Immutable dues history",
      description:
        "Every dues change is recorded with date, time, previous and new amount — and residents can see it too.",
      detail:
        "Append-only at database level: records cannot be deleted or edited. A silent retroactive increase is impossible.",
      specRef: "1.2 / 3",
    },
    {
      slug: "butce-simulatoru",
      title: "Budget simulator (what-if)",
      description:
        "Answers “what happens if I raise dues by 20%?” with a 12-month cash-flow projection.",
      detail:
        "Collection-rate elasticity, expense inflation and one-off investments are all included. " +
        "A fully deterministic calculation — spreadsheet logic, no guesswork.",
      specRef: "3.4",
    },
    {
      slug: "borcu-yoktur-belgesi",
      title: "Instant clearance certificate",
      description:
        "The resident requests it, the system checks the balance, and a PDF with a verification code is ready in seconds.",
      detail:
        "No more waiting days for a mortgage application. Optional official delivery by registered electronic mail.",
      specRef: "3.6",
    },
    {
      slug: "bakim-takvimi",
      title: "Statutory maintenance calendar",
      description:
        "Lift inspection, chimney sweeping, fire extinguisher refills… 50+ maintenance types tracked with their regulatory reference.",
      detail:
        "Reminders 30, 15, 7 and 0 days before, and 3 days after. Upload the report afterwards and the next date is computed automatically.",
      specRef: "3.7",
    },
    {
      slug: "kvkk-denetim",
      title: "Data protection audit log and risk score",
      description:
        "Who saw which data and when is on the record; your announcements pass a privacy filter before they go out.",
      detail:
        "Phrases like “unit 3 is in arrears” are blocked automatically. The manager gets a 0-100 risk score with concrete remediation steps.",
      specRef: "3.3 / 6.4",
    },
    {
      slug: "banka-failover",
      title: "Multiple banks with automatic failover",
      description:
        "We don't depend on a single provider. If one goes down another takes over, and reconciliation gaps go to a queue.",
      detail:
        "A circuit breaker and retry queue mean you never face “collections haven't shown up for a month”.",
      specRef: "3.10",
    },
    {
      slug: "icra-asistani",
      title: "Smart enforcement assistant",
      description:
        "For debts past 90 days: a draft formal notice, lawyer assignment and an 8-stage tracking table.",
      detail:
        "A collection likelihood score shows which route is more productive based on the debtor's profile.",
      specRef: "3.5 / 6.12",
    },
    {
      slug: "veri-gecisi",
      title: "Switch from a competitor in an hour",
      description:
        "Upload your Apsiyon, Biyos, Dijiyon or Yönetimcell export and let the wizard map the columns.",
      detail:
        "With our switching offer — free until your current contract ends — you never pay for two systems at once.",
      specRef: "3.11 / 16",
    },
  ],

  faqs: [
    {
      question: "How long does it take to set up a dues tracking system?",
      answer:
        "After signing up, the wizard takes about 15 minutes: property details, the unit list (bulk create or Excel), the first dues plan and resident invitations. If you're moving from another product, you upload its export file and map the columns.",
    },
    {
      question: "Do residents have to install an app?",
      answer:
        "No. Residents can write “balance” on WhatsApp to see what they owe and receive a payment link; those who prefer it use the web portal. A mobile app is planned for the phase after launch.",
    },
    {
      question: "How is the late fee on dues calculated?",
      answer:
        "Under article 20 of the Turkish Condominium Act (Law No. 634) it is capped at 5% per month. If the general assembly set a lower rate you can change it in settings; the calculation is redone from scratch every day, so no cumulative error builds up.",
    },
    {
      question: "Is our data stored in line with data protection law?",
      answer:
        "Yes. Fields such as the Turkish ID number, IBAN and phone number are encrypted at field level with AES-256-GCM, and every access is written to the audit log. Data subject requests are answered within 72 hours and records past their retention period are anonymised automatically.",
    },
    {
      question: "Do you take a commission on payments?",
      answer:
        "We take no platform commission on dues collection. Only the bank's/POS provider's commission applies, and it is shown as a separate line on the payment screen.",
    },
    {
      question: "Our current software contract is still running — what happens?",
      answer:
        "Under our switching offer we charge nothing until your current contract ends (up to 12 months). You can import your data now and run both systems in parallel.",
    },
    {
      question: "Will the price go up later?",
      answer:
        "Renewal increases are inflation-linked and contractually capped at 30%. A price obtained through an offer stays locked until the end of the period.",
    },
    {
      question: "Do I need a credit card for the trial?",
      answer:
        "No. The 30-day trial is entirely card-free. Nothing is charged when it ends; your account is suspended and your data is kept for 6 months.",
    },
  ],

  comparison: [
    { feature: "Balance enquiry and payment over WhatsApp", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Transparent commission display", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Immutable dues change history", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Budget simulator", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Instant clearance certificate", us: true, apsiyon: "partial", biyos: false, yonetimcell: "partial" },
    { feature: "50+ statutory maintenance templates", us: true, apsiyon: "partial", biyos: false, yonetimcell: "partial" },
    { feature: "Data protection risk score and audit log", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Multi-bank failover", us: true, apsiyon: false, biyos: false, yonetimcell: false },
    { feature: "Debt enforcement module", us: true, apsiyon: true, biyos: false, yonetimcell: true },
    { feature: "Mobile app", us: "soon", apsiyon: true, biyos: true, yonetimcell: true },
  ],

  posts: [
    {
      slug: "apartman-aidat-nasil-hesaplanir",
      category: "rehber",
      title: "How are apartment dues calculated? (2026 guide)",
      description:
        "Equal split or land share? Calculation methods under the Turkish Condominium Act, worked examples and the mistakes managers make most often.",
      publishedAt: "2026-01-15",
      readingMinutes: 7,
      keywords: ["apartment dues calculation", "land share dues", "condominium act dues"],
      body: `## How are shared costs split?

Article 20 of the Turkish Condominium Act (Law No. 634) divides shared costs into two groups:

- **Costs split equally**: caretaker, boiler operator, gardener and security wages, plus management overheads, are shared **equally** between owners.
- **Costs split by land share**: the building's insurance premium and maintenance and preservation costs are shared in proportion to **land share**.

If the management plan sets out a different split, the management plan prevails.

## A worked example

Say a 24-unit building has monthly costs of 30,000 ₺:

1. Staff and management costs of 18,000 ₺ → split equally across 24 units: **750 ₺**
2. Maintenance and insurance of 12,000 ₺ → by land share: a unit with a 5% share pays **600 ₺**
3. Total: 750 + 600 = **1,350 ₺**

## Common mistakes

- **Exempting vacant units.** The law grants no exemption for vacancy; the obligation to contribute continues.
- **Not pursuing the tenant's debt.** Under article 22, the tenant is jointly liable with the owner, limited to the rent amount.
- **Forgetting the late fee.** Up to 5% per month may be claimed; it discourages late payers and protects those who pay on time.
- **Applying an increase without notice.** A change in dues must rest on a general assembly decision and be announced in advance.

## What changes with digital management?

You define the formula once; the accrual is created automatically on the 1st of each month, a reminder goes out as the due date approaches, payment is made by card and the receipt lands instantly. Changes are written to a ledger that cannot be deleted — nobody can apply a silent retroactive increase.`,
    },
    {
      slug: "kat-malikleri-toplantisi-yeter-sayisi",
      category: "mevzuat",
      title: "Quorum at the general assembly: how many votes does each decision need?",
      description:
        "Meeting and decision thresholds under articles 30, 31, 32 and 44 of the Condominium Act, the second-meeting rule and how vote weight is calculated.",
      publishedAt: "2026-02-02",
      readingMinutes: 6,
      keywords: ["condominium general assembly quorum", "condominium act article 32", "apartment meeting majority"],
      body: `## Meeting quorum (art. 30)

The first meeting requires the attendance of **more than half of the owners, both by number and by land share**. If that isn't met, a second meeting is held within 15 days and decisions are taken **with those present**.

## Decision thresholds

| Subject | Required majority | Basis |
| --- | --- | --- |
| Routine agenda items | Simple majority of attendees | art. 32 |
| Electing the manager / auditor | Majority of owners by number and land share | art. 34, art. 41 |
| Significant improvements to common areas | Two-thirds of owners | art. 42 |
| Amending the management plan | Four-fifths of owners | art. 28 |
| Altering the building's architectural state | Unanimous | art. 19 |

## Vote weight

Each unit carries one vote. Where one person owns several units, they hold as many votes as units — but that vote count **cannot exceed one third of all votes** (art. 31).

## Minutes and the decision book

Decisions are written into the **decision book** and signed by those present. The decision book is the single most important document in objections and enforcement proceedings; a printout of digitally produced minutes should also be signed and filed in it.`,
    },
    {
      slug: "aidat-borcu-icra-takibi",
      category: "mevzuat",
      title: "How do you start enforcement proceedings for unpaid dues?",
      description:
        "Formal notice, enforcement proceedings, the statutory mortgage right and collection strategy. A step-by-step route for managers.",
      publishedAt: "2026-03-10",
      readingMinutes: 8,
      keywords: ["unpaid dues enforcement", "condominium dues lawsuit", "statutory mortgage article 22"],
      body: `## 1. Start with a written notice

Sending a written notice before enforcement is both a sign of good faith and useful evidence later. The notice should state the period, the amount, the late fee and the payment deadline clearly.

## 2. Enforcement proceedings

Shared expense receivables can be pursued through **enforcement without judgment**. Under article 35, the manager may start these proceedings without a general assembly decision.

## 3. Statutory mortgage right (art. 22)

For unpaid shared expenses, the creditor owners or the manager may request registration of a **statutory mortgage** on the debtor's unit. This significantly improves the chance of collection.

## 4. Approaching the tenant

The tenant is **jointly liable** with the owner for shared expenses, limited to the rent amount. Any notice given to the tenant should also be given to the owner.

## 5. Manage the process with data

Which debtor has a strong payment history, and which is unreachable? A simple score based on payment history, contactability and the age of the debt makes it clear where to attempt settlement first and where to go straight to enforcement.`,
    },
    {
      slug: "kvkk-apartman-yoneticisi",
      category: "mevzuat",
      title: "Data protection for property managers: what you can and cannot share",
      description:
        "Why posting a debt list in a WhatsApp group is a breach. Privacy notices, explicit consent and the 72-hour response target.",
      publishedAt: "2026-04-05",
      readingMinutes: 6,
      keywords: ["condominium data protection", "property management personal data", "sharing debt list privacy"],
      body: `## The management is a data controller too

Acting on behalf of the owners' assembly, the management processes residents' names, ID numbers, phone numbers, IBANs and debt information — which makes it a **data controller**. That brings a duty to inform and an obligation to apply security measures.

## The most common breach: sharing a debt list

Writing “unit 3 hasn't paid for four months” in the building's WhatsApp group is an unlawful transfer of personal data to third parties. The correct approach is to send debt information **only to the person concerned**, individually.

## What you should do

1. Publish the privacy notice and show it to new residents at registration.
2. Separate mandatory processing from processing that requires explicit consent (marketing messages need their own opt-in).
3. Store fields such as ID number and IBAN encrypted; restrict who can access them.
4. Answer requests within 30 days at the latest (our target in practice: 72 hours).
5. Anonymise records once their retention period ends.

## Camera recordings

Common area cameras rest on legitimate interest, but an information sign is mandatory and the retention period must be limited to the purpose (usually no more than 30 days).`,
    },
    {
      slug: "site-yonetim-programi-secerken",
      category: "urun",
      title: "Ten things to check when choosing property management software",
      description:
        "What matters beyond price: data ownership, bank integration, data protection compliance and how easily you can leave.",
      publishedAt: "2026-05-20",
      readingMinutes: 5,
      keywords: ["property management software", "choosing condominium software"],
      body: `1. **Can you export your data?** Without Excel/CSV export you're locked in.
2. **Does bank integration depend on a single provider?** When that provider fails, collections become invisible.
3. **Are commissions disclosed?** The payment screen should say which deduction goes to whom.
4. **Are dues changes recorded?** If retroactive changes can't be traced, trust breaks down.
5. **Is the barrier low for residents?** Solutions that force an app install don't work with older residents.
6. **Is statutory maintenance tracked?** If a lift or fire inspection is missed, the fine lands on the manager.
7. **Are data protection processes ready?** You need a privacy notice, consent records and request handling.
8. **Are meetings and decisions supported?** Calculating quorum by hand makes mistakes inevitable.
9. **How is support delivered?** Providers whose response times stretch at the start of the season cause problems.
10. **Is the price increase capped in the contract?** A surprise increase at renewal is the most common complaint.`,
    },
  ],

  guides: [
    {
      slug: "apartman-aidat-zammi-nasil-hesaplanir",
      title: "How do you calculate a dues increase?",
      summary:
        "Which cost items determine the increase, how the general assembly decision is taken, and how it should be announced to residents.",
      keywords: ["condominium dues increase", "calculating dues increase", "dues increase rate"],
      sections: [
        {
          heading: "Who decides on an increase?",
          body: "The dues amount is set by the owners' assembly as part of the operating budget (Condominium Act art. 37). A manager cannot impose a permanent increase alone; interim collection is possible until the operating budget is approved.",
        },
        {
          heading: "Which items drive the increase?",
          body: "Staff costs (minimum wage rises and social security contributions), energy, maintenance contracts, insurance policies and planned investments. A weighted average of these gives a realistic increase.",
        },
        {
          heading: "Don't forget the collection rate",
          body: "Accrual and collection are not the same. In a property collecting 85% of what it bills, accruals need to be roughly 118% of costs to cover them.",
        },
        {
          heading: "Announcement and transparency",
          body: "The increase should be announced in advance with its reasons, and the change record should be accessible. Silent, retroactive increases are the single most common complaint.",
        },
      ],
    },
    {
      slug: "kapici-maasi-ve-sgk-hesaplama",
      title: "How are a caretaker's salary and social security contributions calculated?",
      summary:
        "Minimum wage, social security rates, tax exemptions and severance calculation for residential caretakers in Türkiye.",
      keywords: ["caretaker salary calculation", "caretaker social security", "building attendant payroll"],
      sections: [
        {
          heading: "Tax exemption",
          body: "Residential caretakers are exempt from income tax under the Turkish Income Tax Law (No. 193), and no stamp duty applies either. The gross-to-net difference therefore comes mainly from social security contributions.",
        },
        {
          heading: "Social security contributions",
          body: "The employee's and employer's shares are calculated separately. As the employer, the property management must file the monthly contribution declaration and pay on time.",
        },
        {
          heading: "Severance and notice pay",
          body: "When the employment ends, severance accrues at 30 days' gross pay for each full year. Setting aside a provision during the year prevents a sudden cash squeeze.",
        },
      ],
    },
    {
      slug: "asansor-yillik-muayene-zorunlulugu",
      title: "Is the annual lift inspection mandatory? What do the label colours mean?",
      summary:
        "Periodic lift inspection, the A-type inspection body, the meaning of green/blue/yellow/red labels, and the manager's liability.",
      keywords: ["annual lift inspection", "lift label colours", "lift maintenance obligation"],
      sections: [
        {
          heading: "The annual inspection is mandatory",
          body: "Lifts must be inspected at least once a year by an A-type inspection body. The result is displayed on a label inside the lift car.",
        },
        {
          heading: "Label colours",
          body: "Green: compliant. Blue: minor defects, to be fixed. Yellow: defective, a deadline is given. Red: unsafe, the lift must be taken out of service immediately.",
        },
        {
          heading: "Monthly maintenance is a separate duty",
          body: "The annual inspection does not replace monthly maintenance. A maintenance contract with an authorised service provider is required and the records must be kept.",
        },
      ],
    },
    {
      slug: "kiraci-aidat-odemezse-ne-yapilir",
      title: "What if the tenant doesn't pay the dues?",
      summary:
        "Joint liability of tenant and owner, who the notice must be served on, and how enforcement proceeds.",
      keywords: ["tenant not paying dues", "who pays dues tenant or owner", "tenant dues debt"],
      sections: [
        {
          heading: "Who is liable?",
          body: "Under article 22 of the Condominium Act the tenant is jointly liable with the owner, limited to the rent amount. In other words, the management may also claim from the owner.",
        },
        {
          heading: "How notice is served",
          body: "A copy of the payment demand served on the tenant must also be given to the owner. Otherwise the owner can argue they were unaware of the debt.",
        },
        {
          heading: "Transfer and move-out",
          body: "Who carries the remaining debt when a tenant moves out is determined by the management plan and the handover protocol; the default is to transfer it to the owner.",
        },
      ],
    },
    {
      slug: "isletme-projesi-nasil-hazirlanir",
      title: "How do you prepare the operating budget?",
      summary:
        "The content, service, objection period and enforceability of the operating budget under article 37 of the Condominium Act.",
      keywords: ["operating budget condominium", "condominium operating budget example", "condominium act article 37"],
      sections: [
        {
          heading: "Content",
          body: "It sets out estimated annual income and expenses, each owner's share of shared costs, and the payment schedule.",
        },
        {
          heading: "Service and objection",
          body: "The budget is served on owners against signature or by registered letter. If no objection is raised within 7 days of service, it becomes final.",
        },
        {
          heading: "Enforceability",
          body: "A finalised operating budget qualifies as a document under the Enforcement and Bankruptcy Law; unpaid shares can be pursued directly.",
        },
      ],
    },
  ],
};
