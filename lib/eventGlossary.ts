// lib/eventGlossary.ts — French explanations for the gold-relevant
// economic events ForexFactory ships in its weekly calendar feed.
//
// Why this exists: the upstream feed's title field is often a
// terse data label ("ISM Manufacturing PMI") that means nothing
// to a non-economist trader. Compounded by the fact that the
// SAME hour can host materially different event types — a
// routine data print at 10:00 UTC vs a Powell speech at 10:30 vs
// a Trump remarks at 11:00 — and the title alone doesn't
// communicate "this matters because <reason>".
//
// The glossary maps title keyword patterns to:
//   summary  — one sentence on what the data IS
//   gold     — one sentence on how the surprise direction maps
//              to gold price action
//
// Both fields are rendered inside the CalendarPanel event tooltip
// so the trader gets the educational layer without leaving the
// dashboard. When no entry matches, the tooltip falls back to
// just the metadata (title + UTC time + impact + forecast/prev).
//
// Coverage prioritises the events that actually move gold —
// Fed/FOMC, CPI, NFP, GDP, PCE, ISM, retail sales, central-bank
// speeches, political speeches. Adding a new entry is a one-line
// edit.

export interface EventExplanation {
  summary: string
  gold: string
}

// Patterns are lowercase substring matches. Order matters: more
// specific patterns first (so "core cpi" beats the broader "cpi"
// entry), generic-but-distinctive last. The matcher walks this
// array top-to-bottom and returns the first hit.
//
// Keep the patterns terse and lowercase. Both keys (the patterns
// array) and values (summary/gold) live inline so a contributor
// reading this file sees the rule + content together.
const GLOSSARY: Array<{
  patterns: string[]
  explanation: EventExplanation
}> = [
  // ─── Fed / FOMC ────────────────────────────────────────────
  {
    patterns: ['fomc statement'],
    explanation: {
      summary:
        "Communiqué officiel du FOMC après chaque réunion (8x/an) — annonce la décision de taux et le ton sur l'inflation/emploi.",
      gold:
        "Ton dovish (taux bas, patience sur l'inflation) = HAUSSIER pour l'or. Ton hawkish (taux haut plus longtemps) = BAISSIER. Lire le communiqué ligne par ligne — un mot change tout.",
    },
  },
  {
    patterns: ['fomc press conference'],
    explanation: {
      summary:
        "Conférence de presse de Powell après le FOMC — Q&A en direct, plus volatile que le communiqué écrit.",
      gold:
        "Surveiller la réponse aux questions sur l'inflation et la trajectoire de taux. Powell dovish = HAUSSIER pour l'or. Hawkish = BAISSIER. Mouvements souvent brutaux pendant la conf.",
    },
  },
  {
    patterns: ['fomc minutes'],
    explanation: {
      summary:
        "Compte-rendu détaillé de la réunion FOMC précédente, publié 3 semaines après. Révèle les divergences internes.",
      gold:
        "Si plus dovish que ce que le communiqué laissait entendre = HAUSSIER pour l'or. Si plus hawkish = BAISSIER. Lecture lente : les nuances sont dans le détail.",
    },
  },
  {
    patterns: ['federal funds rate', 'interest rate decision', 'rate decision'],
    explanation: {
      summary:
        "Décision officielle de la Fed sur le taux des fonds fédéraux — le taux directeur qui détermine le coût du crédit aux États-Unis.",
      gold:
        "Baisse de taux ou pause = HAUSSIER pour l'or (l'or ne paie pas d'intérêt — taux bas le rendent plus attractif). Hausse de taux = BAISSIER.",
    },
  },
  {
    patterns: ['powell speaks', 'powell speech', 'fed chair'],
    explanation: {
      summary:
        "Intervention publique du président de la Fed — mots qui font bouger les marchés. Souvent surveillé pour signaux entre réunions FOMC.",
      gold:
        "Powell dovish (mention de patience, de risque déflationniste) = HAUSSIER pour l'or. Hawkish (inflation persistante, taux haut plus longtemps) = BAISSIER.",
    },
  },

  // ─── Inflation ────────────────────────────────────────────
  {
    patterns: ['core cpi', 'core consumer price'],
    explanation: {
      summary:
        "Indice des prix à la consommation hors énergie et alimentation — la mesure d'inflation que la Fed regarde le plus.",
      gold:
        "Surprise à la hausse (inflation plus haute que prévu) = BAISSIER court terme pour l'or (la Fed devra rester hawkish), mais HAUSSIER moyen terme (l'or est un hedge inflation). Surprise à la baisse = HAUSSIER (Fed peut baisser les taux).",
    },
  },
  {
    patterns: ['cpi', 'consumer price index', 'inflation rate'],
    explanation: {
      summary:
        "Indice des prix à la consommation — mesure phare de l'inflation. Sortie mensuelle, énorme catalyseur pour l'or.",
      gold:
        "Surprise à la hausse = pression initiale baissière (Fed hawkish), suivie souvent d'un rebond (hedge inflation). Surprise à la baisse = HAUSSIER immédiat (espoir de baisse de taux).",
    },
  },
  {
    patterns: ['core pce', 'pce price index'],
    explanation: {
      summary:
        "Indice de prix PCE Core — la mesure d'inflation préférée de la Fed (vs CPI). Sortie mensuelle.",
      gold:
        "Même logique que le Core CPI : surprise haute = Fed hawkish = BAISSIER court terme, mais souvent rebond. Surprise basse = HAUSSIER (Fed dovish).",
    },
  },
  {
    patterns: ['ppi', 'producer price'],
    explanation: {
      summary:
        "Indice des prix à la production — mesure l'inflation côté entreprises, indicateur avancé du CPI.",
      gold:
        "Hausse plus forte que prévu = pression inflationniste à venir = BAISSIER court terme, HAUSSIER moyen terme. Plus faible = HAUSSIER pour l'or (Fed peut s'assouplir).",
    },
  },

  // ─── Emploi ────────────────────────────────────────────────
  {
    patterns: ['non-farm payroll', 'nonfarm payroll', 'nfp'],
    explanation: {
      summary:
        "Emplois non-agricoles US — l'événement macro #1 du mois (1er vendredi). Mesure la création d'emplois hors secteur agricole.",
      gold:
        "Création d'emplois plus forte que prévu = économie solide = Fed hawkish = BAISSIER pour l'or. Plus faible = signe de ralentissement = HAUSSIER (Fed peut baisser).",
    },
  },
  {
    patterns: ['unemployment claims', 'jobless claims'],
    explanation: {
      summary:
        "Demandes hebdomadaires d'allocations chômage US. Indicateur en temps réel de la santé du marché du travail.",
      gold:
        "Hausse des demandes = marché du travail qui se dégrade = HAUSSIER pour l'or (Fed dovish potentiel). Baisse = économie solide = BAISSIER.",
    },
  },
  {
    patterns: ['unemployment rate'],
    explanation: {
      summary:
        "Taux de chômage US — pourcentage de la population active sans emploi.",
      gold:
        "Hausse du chômage = ralentissement économique = HAUSSIER pour l'or (Fed va devoir s'assouplir). Baisse = économie tendue = BAISSIER.",
    },
  },
  {
    patterns: ['jolts', 'job openings'],
    explanation: {
      summary:
        "Enquête JOLTS sur les offres d'emplois disponibles aux États-Unis. Indicateur de tension du marché du travail.",
      gold:
        "Beaucoup d'offres = marché tendu = pression sur les salaires = inflation = Fed hawkish = BAISSIER pour l'or. Peu d'offres = HAUSSIER.",
    },
  },

  // ─── Croissance / activité ────────────────────────────────
  {
    patterns: ['advance gdp', 'gdp q/q', 'gdp annualized'],
    explanation: {
      summary:
        "Première estimation du PIB trimestriel US. Mesure la croissance économique sur le trimestre.",
      gold:
        "Croissance plus forte que prévu = économie solide = Fed hawkish = BAISSIER pour l'or. Plus faible = ralentissement = HAUSSIER (Fed dovish potentiel).",
    },
  },
  {
    patterns: ['gdp price index', 'gdp deflator'],
    explanation: {
      summary:
        "Déflateur du PIB — mesure d'inflation calculée à partir des données PIB.",
      gold:
        "Lecture plus forte = inflation plus élevée = Fed hawkish = BAISSIER court terme. Plus faible = HAUSSIER (Fed peut s'assouplir).",
    },
  },
  {
    patterns: ['ism manufacturing pmi', 'manufacturing pmi'],
    explanation: {
      summary:
        "Indice manufacturier ISM (ou PMI manufacturier) — enquête mensuelle sur l'activité des usines US. Au-dessus de 50 = expansion, en-dessous = contraction.",
      gold:
        "Lecture > 50 (expansion) = économie solide = légèrement BAISSIER pour l'or. Lecture < 50 (contraction) = signe de récession = HAUSSIER (l'or comme valeur refuge).",
    },
  },
  {
    patterns: ['ism services pmi', 'ism non-manufacturing', 'services pmi'],
    explanation: {
      summary:
        "Indice ISM des services — couvre 80% de l'économie US (vs ~10% pour le manufacturier). Plus important que l'ISM manufacturier en pratique.",
      gold:
        "Lecture > 50 = services en expansion = économie solide = BAISSIER pour l'or. Lecture < 50 = HAUSSIER (refuge anti-récession).",
    },
  },
  {
    patterns: ['ism manufacturing prices', 'ism prices'],
    explanation: {
      summary:
        "Sous-indice prix de l'ISM — mesure les pressions inflationnistes côté entreprises manufacturières.",
      gold:
        "Hausse du sous-indice = pression inflationniste à venir = BAISSIER court terme pour l'or (Fed hawkish), mais HAUSSIER moyen terme (hedge inflation).",
    },
  },
  {
    patterns: ['retail sales'],
    explanation: {
      summary:
        "Ventes au détail US — mesure mensuelle de la consommation des ménages, qui pèse 70% du PIB américain.",
      gold:
        "Surprise à la hausse = consommation forte = économie solide = Fed hawkish = BAISSIER pour l'or. Surprise basse = HAUSSIER (Fed peut baisser les taux).",
    },
  },
  {
    patterns: ['durable goods'],
    explanation: {
      summary:
        "Commandes de biens durables US — indicateur d'investissement des entreprises (avions, machines, etc.).",
      gold:
        "Hausse plus forte que prévu = entreprises qui investissent = économie solide = BAISSIER pour l'or. Baisse = HAUSSIER (signe de ralentissement).",
    },
  },
  {
    patterns: ['consumer confidence', 'consumer sentiment'],
    explanation: {
      summary:
        "Confiance / sentiment des consommateurs US — enquête mensuelle. Anticipe la consommation à venir.",
      gold:
        "Confiance en hausse = consommation à venir = économie solide = BAISSIER pour l'or. Confiance en baisse = HAUSSIER (refuge anti-ralentissement).",
    },
  },

  // ─── Trésor / dette ────────────────────────────────────────
  {
    patterns: ['treasury', 'bond auction', 'note auction'],
    explanation: {
      summary:
        "Adjudication de bons / obligations du Trésor US — la demande pour la dette américaine. Le rendement reflète l'appétit pour le dollar.",
      gold:
        "Adjudication forte (forte demande, rendements bas) = HAUSSIER pour l'or (taux réels bas). Adjudication faible (rendements en hausse) = BAISSIER.",
    },
  },

  // ─── Politique / interventions ────────────────────────────
  {
    patterns: ['president trump speaks', 'trump speech', 'trump remarks'],
    explanation: {
      summary:
        "Intervention publique du président américain — annonces de politique économique, commerciale ou géopolitique.",
      gold:
        "Annonces de tarifs douaniers, tensions commerciales, menaces géopolitiques = HAUSSIER pour l'or (refuge). Détente diplomatique = BAISSIER. Volatilité élevée — élargir les stops.",
    },
  },
  {
    patterns: ['lagarde speaks', 'ecb president'],
    explanation: {
      summary:
        "Intervention de la présidente de la BCE. Donne le ton sur les taux européens et l'euro.",
      gold:
        "Lagarde dovish (taux BCE bas) = euro faible / dollar fort = légèrement BAISSIER pour l'or. Hawkish = euro fort / dollar faible = HAUSSIER.",
    },
  },
  {
    patterns: ['bailey speaks', 'boe governor'],
    explanation: {
      summary:
        "Intervention du gouverneur de la BoE (Bank of England). Donne le ton sur les taux britanniques et la livre.",
      gold:
        "Mouvement parallèle à la BCE — impact indirect sur l'or via le différentiel dollar/livre. Surveiller les coordonnées avec la Fed.",
    },
  },

  // ─── BCE / Europe ──────────────────────────────────────────
  {
    patterns: ['ecb main refinancing rate', 'main refinancing rate'],
    explanation: {
      summary:
        "Taux directeur de la BCE. Décision de politique monétaire pour la zone euro.",
      gold:
        "BCE qui baisse = euro faible / dollar fort = BAISSIER pour l'or à court terme. BCE qui monte = euro fort / dollar faible = HAUSSIER.",
    },
  },
  {
    patterns: ['core cpi flash', 'core cpi flash estimate'],
    explanation: {
      summary:
        "Première estimation de l'inflation core en zone euro. Indicateur précoce du CPI final.",
      gold:
        "Surprise haute = pression sur la BCE = euro plus fort / dollar plus faible = HAUSSIER pour l'or. Surprise basse = BAISSIER.",
    },
  },
  {
    patterns: ['cpi flash estimate', 'cpi flash'],
    explanation: {
      summary:
        "Première estimation de l'inflation totale en zone euro. Sort avant le chiffre officiel.",
      gold:
        "Même logique que le CPI core : surprise haute = euro fort = HAUSSIER pour l'or. Surprise basse = BAISSIER.",
    },
  },
  {
    patterns: ['german prelim gdp', 'german gdp'],
    explanation: {
      summary:
        "PIB préliminaire allemand. Allemagne = économie #1 de la zone euro, indicateur clé.",
      gold:
        "Croissance allemande forte = euro fort / dollar plus faible = HAUSSIER pour l'or. Croissance faible = euro faible = BAISSIER.",
    },
  },
]

// Public lookup. Lower-case the title once and walk the patterns
// in declaration order — first match wins. Returns null when no
// pattern matches; the tooltip caller falls back to metadata-only
// rendering in that case.
export function explainEvent(title: string): EventExplanation | null {
  const lower = title.toLowerCase()
  for (const entry of GLOSSARY) {
    if (entry.patterns.some((p) => lower.includes(p))) {
      return entry.explanation
    }
  }
  return null
}
