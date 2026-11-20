# Example prompts — Meta Workbench MCP server

Copy-paste prompts for each of the four tools. All numbers below are a
**fictional teaching example** (marked *example*), used consistently across the
Meta Workbench materials: a hypothetical oral anticoagulant ("veloxaban")
versus warfarin for stroke prevention in atrial fibrillation. Replace them
with your own data.

## 1. PRISMA 2020 flow diagram — tool: `prisma_diagram`

1. "Draw a PRISMA 2020 flow diagram for my systematic review. *Example*
   numbers: 1,286 records identified from databases, 344 duplicates removed,
   942 records screened, 871 excluded at title/abstract, 71 reports sought for
   retrieval, 71 assessed for eligibility, 63 excluded, 8 studies included."
2. "Generate the PRISMA 2020 diagram for a review where database searching
   found 1,286 records and registers found 0; after de-duplication 942 were
   screened and 8 were finally included. Compute the derived counts for me.
   (*Example* data.)"
3. "I need the PRISMA flow numbers checked and drawn: identified 1,286 →
   screened 942 → assessed 71 → included 8, with exclusion reasons at full
   text: wrong population 21, wrong intervention 17, no usable outcome 15,
   duplicate cohort 10. (*Example* data — render the diagram as SVG.)"

## 2. Forest plot — tool: `forest_plot`

1. "Make a forest plot from these *example* results (risk ratios, veloxaban
   vs warfarin, stroke or systemic embolism): Study A 0.78 (0.55–1.11),
   Study B 0.91 (0.70–1.18), Study C 0.69 (0.44–1.08), Study D 1.02
   (0.76–1.37), Study E 0.84 (0.61–1.16). Use a DerSimonian–Laird
   random-effects model and report I²."
2. "Pool these five *example* trials with both fixed-effect and
   random-effects models and show the forest plot: effects 0.78, 0.91, 0.69,
   1.02, 0.84 with the confidence intervals from my spreadsheet. The pooled
   teaching result should come out near RR 0.84 (0.65–1.08) with I² ≈ 58%."
3. "Draw a forest plot for a mean-difference outcome (*example*): three
   trials with MD −2.1 (−3.4 to −0.8), −1.6 (−2.9 to −0.3), and −2.8
   (−4.5 to −1.1). Show the pooled diamond and heterogeneity statistics."

## 3. RoB 2 traffic light — tool: `rob_traffic_light`

1. "Create a RoB 2 traffic-light plot for these *example* judgements —
   Study A: Low / Low / Some concerns / Low / Low; Study B: Some concerns /
   Low / Low / Low / Some concerns; Study C: High / Some concerns / Low /
   Low / Low. Apply the RoB 2 overall-judgement rule."
2. "Render the risk-of-bias traffic lights and the weighted summary bar for
   my eight included studies. I will paste each study's five domain
   judgements (randomization, deviations, missing data, measurement,
   selection) plus its sample size. (*Example* workflow — judgements are the
   review team's own.)"
3. "Two of my studies have 'some concerns' in two or more domains — flag
   them the way RoB 2 does in the traffic-light figure and tell me their
   overall judgements. (*Example*: Study D — Some concerns / Some concerns /
   Low / Low / Low.)"

## 4. Sample size — tool: `sample_size`

1. "Calculate the sample size for a two-arm trial comparing means:
   expected difference 5 points, SD 10, two-sided α = 0.05, power 80%,
   1:1 allocation. (*Example* — the answer should be 63 per group.)"
2. "How many participants do I need to detect a drop in event rate from
   20% to 10% (proportions design, α = 0.05, power 80%), allowing for 10%
   attrition? (*Example* — expect about 199 per group, 444 total to recruit.)"
3. "Run a non-inferiority sample-size calculation for a binary outcome:
   control event rate 12%, non-inferiority margin 4%, one-sided α = 0.025,
   power 90%. (*Example* parameters for a grant-application draft.)"
