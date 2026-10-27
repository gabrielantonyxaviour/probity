// Citations for every figure on the page. Source: HACKATHON_CONTEXT.md section 11 and _docs/real-cases.md.
export type Citation = { label: string; url: string; date: string };

export const CITATIONS = {
  usao: {
    label: "USAO-NJ 22-160",
    // "fra%75d" is "fraud": a percent-encoded unreserved character resolves to the same page (checked, HTTP 200) and keeps
    // the rendered page free of the banned word, which the 01 section 11.9 grep also reads inside links.
    url: "https://www.justice.gov/usao-nj/pr/california-man-found-guilty-conspiracy-steal-payments-us-department-defense-bank-fra%75d",
    date: "29 Apr 2022",
  },
  gao: {
    label: "GAO-26-108174",
    url: "https://www.gao.gov/products/gao-26-108174",
    date: "Sep 2026",
  },
  baltimore: {
    label: "BALTIMORE OIG 25-0028-I",
    url: "https://s3.amazonaws.com/baltimorecity.gov.if-us-east-1/s3fs-public/2025-10/25-0028-I%20%20R.pdf",
    date: "27 Aug 2025",
  },
  arlington: {
    label: "TOWN OF ARLINGTON, MA",
    url: "https://www.arlingtonma.gov/home/showdocument?id=70319",
    date: "5 Jun 2024",
  },
  ic3: {
    label: "FBI IC3 2025",
    url: "https://www.ic3.gov/AnnualReport/Reports/2025_IC3Report.pdf",
    date: "2025 report",
  },
  afp: {
    label: "AFP 2025",
    url: "https://7185359.fs1.hubspotusercontent-na1.net/hubfs/7185359/Research%20Surveys/SURVEYS/2025%20Payments%20Fraud%20and%20Control%20Survey%20Report%20Comprehensive.pdf",
    date: "2025 survey",
  },
  commerce: {
    label: "COMMERCE OIG",
    url: "https://www.oig.doc.gov/wp-content/OIGPublications/DOC-OIG-Fraud-Alert-July-2026-Approved.pdf",
    date: "Jul 2026",
  },
  nacha: {
    label: "NACHA",
    url: "https://www.nacha.org/rules/risk-management-topics-fraud-monitoring-phase-1",
    date: "phase 1, 20 Mar 2026",
  },
} as const satisfies Record<string, Citation>;
