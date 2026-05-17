// @ts-check
/**
 * EU regulation reference dataset for InsectAlert.
 *
 * Two item types:
 *
 *   - approvedInsects: insect species authorised in the EU food chain,
 *     either under the Novel Food Regulation (2015/2283) or, for the
 *     historic case of carmine/E120, under the Food Additives Regulation
 *     (1333/2008).
 *
 *   - regulationItems: contextual concepts (Novel Food definition, EU
 *     approval process, EFSA's role, labelling obligations, allergy
 *     warning) used to answer questions that are not about one specific
 *     ingredient.
 *
 * This file is the ground-truth data source for Generative UI Categorie 2
 * — "Algemeen begrip EU-regelgeving" — as defined in the ontology
 * document published under issue 1AM-229.
 *
 * IMPORTANT: All facts here must be verifiable on EUR-Lex or EFSA.
 * Do not let an LLM mutate the values. Updates are human-only.
 *
 * Tickets: 1AM-228 (umbrella) · 1AM-229 (ontology) · 1AM-230 (this file)
 */

/**
 * @typedef {Object} ApprovedInsect
 * @property {string} id                          - Slug-id, e.g. "huiskrekel"
 * @property {string} nlName                      - Dutch name
 * @property {string} latinName                   - Latin species name
 * @property {string | null} approvalDate         - ISO date of the EU regulation that authorised this insect (or null for pre-1997 items)
 * @property {string | null} approvalNote         - Free-form note, e.g. used to flag pre-1997 status or later extension regulations
 * @property {string} regulationCode              - Primary EU regulation, e.g. "EU 2022/188"
 * @property {string} regulationUrl               - EUR-Lex URL of the primary regulation
 * @property {string[]} allowedCategories         - Product categories in which the ingredient is allowed
 * @property {string | null} efsaAssessmentStarted - Year EFSA started its safety assessment (string, e.g. "2018")
 * @property {string | null} efsaAssessmentPositive - ISO month of EFSA's positive opinion (e.g. "2021-07"), null when not applicable
 * @property {"approved" | "pending"} status      - Approval status. v1 contains only "approved" items; "pending" reserved for future use
 * @property {string} source                      - Human-readable citation
 * @property {"high" | "medium" | "low"} confidence
 */

/**
 * @typedef {Object} RegulationItem
 * @property {string} id                          - Slug-id, e.g. "novel_food_definition"
 * @property {string} title                       - Title as shown in the UI
 * @property {string} summary                     - Max 50 words, plain Dutch
 * @property {string} source                      - Human-readable citation
 * @property {string} sourceUrl                   - Primary linkable URL
 * @property {"high" | "medium" | "low"} confidence
 */

/** @type {ApprovedInsect[]} */
export const approvedInsects = [
  {
    id: "gele-meelworm",
    nlName: "Gele meelworm",
    latinName: "Tenebrio molitor",
    approvalDate: "2021-06-01",
    approvalNote:
      "Eerste insect goedgekeurd als novel food in de EU. UV-treated powder van Tenebrio molitor is later separaat uitgebreid via Uitvoeringsverordening (EU) 2025/89 voor brood, pasta, koekjes, kaasproducten en fruitcompote.",
    regulationCode: "EU 2021/882",
    regulationUrl: "https://eur-lex.europa.eu/eli/reg_impl/2021/882/oj",
    allowedCategories: ["Pasta", "Koekjes", "Brood", "Vleesvervangers"],
    efsaAssessmentStarted: "2018",
    efsaAssessmentPositive: "2021-01",
    status: "approved",
    source: "Uitvoeringsverordening (EU) 2021/882",
    confidence: "high",
  },
  {
    id: "treksprinkhaan",
    nlName: "Treksprinkhaan",
    latinName: "Locusta migratoria",
    approvalDate: "2021-11-12",
    approvalNote: null,
    regulationCode: "EU 2021/1975",
    regulationUrl: "https://eur-lex.europa.eu/eli/reg_impl/2021/1975/oj",
    allowedCategories: ["Meergranenbrood", "Peulvruchtenproducten"],
    efsaAssessmentStarted: "2019",
    efsaAssessmentPositive: "2021-05",
    status: "approved",
    source: "Uitvoeringsverordening (EU) 2021/1975",
    confidence: "high",
  },
  {
    id: "huiskrekel",
    nlName: "Huiskrekel",
    latinName: "Acheta domesticus",
    approvalDate: "2022-02-10",
    approvalNote:
      "Partially defatted powder van Acheta domesticus is later separaat uitgebreid via Uitvoeringsverordening (EU) 2023/5.",
    regulationCode: "EU 2022/188",
    regulationUrl: "https://eur-lex.europa.eu/eli/reg_impl/2022/188/oj",
    allowedCategories: [
      "Meergranenbrood",
      "Koekjes",
      "Pasta",
      "Granenrepen",
      "Eiwitproducten",
    ],
    efsaAssessmentStarted: "2018",
    efsaAssessmentPositive: "2021-07",
    status: "approved",
    source: "Uitvoeringsverordening (EU) 2022/188",
    confidence: "high",
  },
  {
    id: "kleine-meelworm",
    nlName: "Kleine meelworm",
    latinName: "Alphitobius diaperinus",
    approvalDate: "2023-01-05",
    approvalNote:
      "Internationaal ook bekend als buffaloworm. Toelating betreft larvae in bevroren, paste, gedroogde en poedervorm.",
    regulationCode: "EU 2023/58",
    regulationUrl: "https://eur-lex.europa.eu/eli/reg_impl/2023/58/oj",
    allowedCategories: ["Brood", "Pasta", "Koekjes"],
    efsaAssessmentStarted: "2020",
    efsaAssessmentPositive: "2022-07",
    status: "approved",
    source: "Uitvoeringsverordening (EU) 2023/58",
    confidence: "high",
  },
  {
    id: "schildluis",
    nlName: "Schildluis (karmijn / E120)",
    latinName: "Dactylopius coccus",
    approvalDate: null,
    approvalNote:
      "Pre-1997: historisch toegestaan als levensmiddelenkleurstof E120 (karmijn). Valt onder de Additievenverordening (EG) 1333/2008, niet onder de Novel Food Verordening.",
    regulationCode: "EG 1333/2008",
    regulationUrl: "https://eur-lex.europa.eu/eli/reg/2008/1333/oj",
    allowedCategories: [
      "Rode/roze zuiveldranken",
      "Rood snoep",
      "Roze koeken",
      "Banket",
      "Aperitieven",
    ],
    efsaAssessmentStarted: null,
    efsaAssessmentPositive: null,
    status: "approved",
    source:
      "Verordening (EG) Nr. 1333/2008 — levensmiddelenadditieven; E120 als toegestane kleurstof opgenomen",
    confidence: "high",
  },
];

/** @type {RegulationItem[]} */
export const regulationItems = [
  {
    id: "novel_food_definition",
    title: "Wat is een novel food?",
    summary:
      "Een novel food is een voedingsmiddel of ingrediënt dat voor 15 mei 1997 niet in noemenswaardige mate in de EU geconsumeerd werd. Alles wat daarna nieuw op de markt komt, moet eerst worden goedgekeurd voor menselijke consumptie. Insecten vallen onder deze regelgeving.",
    source: "Verordening (EU) 2015/2283 — Novel Food Verordening",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg/2015/2283/oj",
    confidence: "high",
  },
  {
    id: "eu_approval_process",
    title: "Hoe werkt EU-toelating voor novel foods?",
    summary:
      "Een producent dient een aanvraag in bij de Europese Commissie. EFSA beoordeelt de veiligheid en publiceert een wetenschappelijk advies. Bij positief advies stelt de Commissie samen met de lidstaten een uitvoeringsverordening op. Het voedingsmiddel wordt vervolgens opgenomen in de Unielijst van goedgekeurde novel foods.",
    source: "Verordening (EU) 2015/2283, artikelen 10-12",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg/2015/2283/oj",
    confidence: "high",
  },
  {
    id: "efsa_role",
    title: "Wat doet EFSA?",
    summary:
      "EFSA (European Food Safety Authority) is het onafhankelijke EU-agentschap dat de veiligheid van voedsel beoordeelt. Voor novel foods evalueert EFSA's wetenschappelijke panel de samenstelling, productiemethode en mogelijke risico's. EFSA verleent geen toelating zelf — dat doet de Europese Commissie op basis van EFSA's advies.",
    source: "EFSA — over de organisatie",
    sourceUrl: "https://www.efsa.europa.eu/en/about",
    confidence: "high",
  },
  {
    id: "labelling_requirement",
    title: "Etiketteringsplicht voor insecten in voeding",
    summary:
      "Wanneer een product insectingrediënten bevat, moet de fabrikant zowel de Latijnse als de Nederlandse naam van het insect vermelden in de ingrediëntenlijst. Bovendien moet expliciet de gebruikte vorm worden aangegeven (bv. gedroogd, poeder, larve). Een fabrikant mag dit niet weglaten of verbergen achter algemene termen.",
    source:
      "Verordening (EU) 2015/2283, artikel 9; Uitvoeringsverordening (EU) 2017/2470",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg_impl/2017/2470/oj",
    confidence: "high",
  },
  {
    id: "allergy_warning_requirement",
    title: "Allergie-waarschuwing op insectproducten",
    summary:
      "Etiketten van producten met insectingrediënten moeten waarschuwen dat ze allergische reacties kunnen veroorzaken bij mensen met een bestaande allergie voor schaaldieren, weekdieren of huisstofmijt. Deze waarschuwing moet direct naast de ingrediëntenlijst staan. Vereiste is gebaseerd op EFSA's veiligheidsbeoordelingen.",
    source:
      "Bijlage bij Uitvoeringsverordeningen (EU) 2021/882, 2021/1975, 2022/188 en 2023/58; opgenomen in de Unielijst (EU) 2017/2470",
    sourceUrl: "https://eur-lex.europa.eu/eli/reg_impl/2017/2470/oj",
    confidence: "high",
  },
];
