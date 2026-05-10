# NUGX — Terminal XAU/USD

**Documentation produit · v2** · _Mise à jour : 2026-05-10_

> Terminal de décision pour le day-trading de l'or spot. Pré-digère
> tout le contexte (prix, macro, news, calendrier, technique
> multi-timeframe, positionnement institutionnel) pour qu'un trader
> retail clique en connaissance de cause — et seulement quand la
> confluence le justifie.

---

## Sommaire

1. [Le produit en une phrase](#1-le-produit-en-une-phrase)
2. [À qui ça s'adresse · ce que ça résout](#2-à-qui-ça-sadresse--ce-que-ça-résout)
3. [Nouveautés v2 — Phase 12](#3-nouveautés-v2--phase-12)
4. [Vue d'ensemble des fonctionnalités](#4-vue-densemble-des-fonctionnalités)
5. [Architecture & sources de données](#5-architecture--sources-de-données)
6. [Le copilote IA · Marcus Reid](#6-le-copilote-ia--marcus-reid)
7. [Risque & exécution · taille de position, ordre presse-papier, alertes](#7-risque--exécution--taille-de-position-ordre-presse-papier-alertes)
8. [Performance & analytics](#8-performance--analytics)
9. [Carte de l'interface](#9-carte-de-linterface)
10. [Walkthrough d'une session](#10-walkthrough-dune-session)
11. [Raccourcis clavier · interactions](#11-raccourcis-clavier--interactions)
12. [PWA & mode hors-ligne](#12-pwa--mode-hors-ligne)
13. [Données locales · vie privée](#13-données-locales--vie-privée)
14. [Démarrage rapide](#14-démarrage-rapide)
15. [Coût d'exploitation](#15-coût-dexploitation)
16. [Déploiement Vercel](#16-déploiement-vercel)
17. [Limites connues · roadmap](#17-limites-connues--roadmap)

---

## 1. Le produit en une phrase

NUGX est un **terminal d'aide à la décision** pour le day-trading XAU/USD,
qui agrège prix temps-réel + signaux macro (rendements réels, DXY, COT) +
technique multi-timeframe + actualités + calendrier + un copilote IA dans
une seule vue terminal sombre, française, raccourcis-clavier-friendly,
**installable en PWA**.

NUGX **ne route pas d'ordre**. Le but est de pré-digérer le contexte pour
que chaque clic du trader soit informé — pas de remplacer le trader.

---

## 2. À qui ça s'adresse · ce que ça résout

### Cible
Trader retail qui scalpe ou day-trade l'or, **1 à 5 trades par session**,
horizon **1–4 heures**. Travaille seul, sans desk senior pour challenger
ses décisions, sans Bloomberg pour agréger les données.

### Les 5 problèmes résolus

| # | Problème retail | Réponse NUGX |
|---|-----------------|--------------|
| 1 | **Agrégation** — prix, macro, news, calendrier, technique éparpillés sur 5 onglets | Tout consolidé dans une vue unique, mise à jour en continu |
| 2 | **Discipline** — FOMO + over-trading | Confluence pondérée 0–10 ; recommandation forcée à FLAT sous le seuil ; gate calendrier 45 min avant événement HIGH |
| 3 | **Mémoire** — "j'ai déjà vu ce setup, ça marche ou pas ?" | Chaque analyse est persistée, classée par session/setup/score ; le copilote injecte la performance personnelle dans son prompt |
| 4 | **Sizing** — sur-sizing après une perte | Calculatrice de position intégrée : compte × risque % ÷ distance stop = taille auto |
| 5 | **Garde-fous** — invalidation + tilt | Banner d'alerte automatique sur cross d'invalidation, détection thèse-en-affaiblissement (MACD/RSI/EMA20), détection tilt après séries de pertes |

### Local-first
Tout tourne en local (ou sur Vercel pour la version déployée). Aucune
donnée perso ne quitte la machine sauf l'appel à Claude (avec
sanitisation anti-prompt-injection sur tous les inputs externes).

---

## 3. Nouveautés v2 — Phase 12

11 commits livrés entre `d148cca` et `c0ba261`. Résumé :

| Phase | Livraison | Impact |
|-------|-----------|--------|
| **12.1** | Sonnet 4 → **Sonnet 4.6** + prompt caching + règle de seuil pondérée (≥6.0/10, lead ≥2.0) | −30 % coût Anthropic, plus de mismatch UI/recommandation |
| **12.2** | **FRED** real yields (DFII10) + breakeven (T10YIE) ; **CFTC COT** Managed Money ; Yahoo XAG / EUR / CHF / SPX | Données qu'un desk pro regarde — toutes gratuites |
| **12.3** | Pivots quotidiens (classique + Camarilla) ; VWAP ancré (Londres + NY) ; régime ATR ; **ligne de prix temps-réel sur le chart** | Profondeur technique pro, lag chart→tick éliminé |
| **12.4** | Calculatrice de position ; bouton presse-papier ordre (MT5/cTrader/TradingView) ; alertes prix custom + notifications navigateur | Élimine le sizing manuel + la friction d'exécution |
| **12.5** | Expectancy, profit factor, distribution R-multiples, max drawdown, time-of-day heatmap, **export CSV** | Stats de qualité institutionnelle sur le journal |
| **12.6** | UI : strip **MACRO+** sous SignalsPanel ; **PerformanceSummaryCard** dans le panel | Surfaçage des données ajoutées en 12.2/12.3/12.5 |
| **12.7** | **PWA** : manifest, service worker offline, installable | Installable depuis la barre d'adresse, fonctionne hors-ligne |
| **12.8** | **Décomposition LLM** : classifieur déterministe + propositeur de niveaux en TS pur ; Claude n'arbitre que | −30 à −40 % output tokens supplémentaires, plus reproductible |
| **12.9** | Prix multi-source : gold-api **+ fallback Yahoo XAU=X** | Plus de single-point-of-failure sur le spot |
| **12.10** | `vercel.json` + cron jobs pour /api/cot et /api/macro | Cache chaud côté Vercel, prêt pour la prod |
| **12.11** | **Suppression** de la feature calibration (HAUTE/MOYENNE/BASSE buckets) | Retiré sur demande utilisateur — la PerformanceCard couvre le besoin "où je perds / où je gagne" |

### Avant / Après — coût Anthropic typique

| Variante | Coût/analyse | Coût/jour (50 calls) | Coût/mois |
|----------|--------------|----------------------|-----------|
| v1 — Sonnet 4 (mai 2025), pas de cache | ~$0.021 | ~$1.05 | **~$32** |
| v2 — Sonnet 4.6 + cache + déterministe | ~$0.008–0.012 | ~$0.40–0.60 | **~$13** |

Soit **~55 % d'économies** sur la même cadence d'utilisation, pour une
qualité d'analyse plus reproductible.

---

## 4. Vue d'ensemble des fonctionnalités

### 4.1 Prix & marché
- ✅ Prix spot XAU/USD live, **multi-source** (`gold-api.com` primaire, Yahoo XAU=X fallback)
- ✅ OHLC du jour (open, prevClose, high, low) dérivé de Yahoo GC=F en spot-frame via correction de basis futures→spot
- ✅ Variation absolue + % signés
- ✅ Session courante : Tokyo / London / NY-London Overlap / NY / Off-hours, avec indicateur de volatilité

### 4.2 Macro — la vision desk
- ✅ **DXY** + **US 10Y** nominal (existait déjà)
- ✅ **Rendement réel 10Y** (FRED `DFII10`) + **breakeven inflation 10Y** (FRED `T10YIE`) — _le vrai moteur structurel de l'or_
- ✅ Optionnels : VIX, USD/JPY, USD/CHF, EUR/USD, S&P 500, WTI, BTC, **silver futures** (= ratio Or/Argent dérivé)
- ✅ **Positionnement CFTC COT** — Managed Money net, percentile 5 ans, signal contrarien aux extrêmes

### 4.3 Technique
- ✅ Indicateurs 1H : RSI, MACD (avec détection de cross), EMA 20/50/200, ATR, Bollinger, swingHigh/swingLow, position dans le range
- ✅ Lectures multi-timeframe : **15M** (timing) · **1H** (setup) · **4H** (filtre macro)
- ✅ Strip d'alignement avec badge "● ALIGNÉ" quand les trois TF pointent dans le même sens
- ✅ Détection de 12 motifs candlestick / structure (engulfing, hammer, shooting star, doji, marubozu, inside bar, HH/HL, LH/LL, double top/bottom forming)
- ✅ **Pivots quotidiens** (classique : P/R1-3/S1-3 ; Camarilla : R1-4/S1-4) basés sur l'OHLC du jour précédent en UTC
- ✅ **VWAP ancré** depuis l'open Londres (07:00 UTC) et l'open NY (13:00 UTC)
- ✅ **Régime de volatilité ATR** : LOW / NORMAL / HIGH / EXTREME selon le percentile sur 90 j

### 4.4 Graphique
- ✅ Chandeliers Lightweight Charts v5 avec switch 15M | 1H | 4H
- ✅ Overlays : EMA20/50/200 colorées (200 visible en 1H seulement)
- ✅ Volume en histogramme bas
- ✅ Lignes IA : **ENTRÉE** (bleu pointillé), **STOP** (rouge), **OBJECTIF** (vert), résistance / support / swing-high-low en pointillés
- ✅ **Ligne LIVE** ambre — prix temps-réel mis à jour à chaque tick (~30 s), plus de décalage avec la dernière bougie close
- ✅ Marqueurs de motifs (flèche verte ↑ haussier, rouge ↓ baissier, cercle ambre ◎ neutre)
- ✅ Persistance du zoom/pan entre les polls
- ✅ Strip TradingView 5M en bas (ticker live broker)

### 4.5 Actualités
- ✅ Flux Google News RSS — gratuit, sans clé : Reuters, Bloomberg, FT, MarketWatch, KITCO, CME
- ✅ Tagging automatique : impact (HIGH / MEDIUM / LOW) + sentiment pour l'or (HAUSSIER / BAISSIER / NEUTRE)
- ✅ Filtres : TOUS · ⚡ URGENT · ▲ HAUSSIERS · ▼ BAISSIERS
- ✅ Barre de ratio sentiment + verdict de flux (HAUSSIER / BAISSIER / MITIGÉ)
- ✅ Validation de scheme `http(s)://` avant ouverture (protection contre `javascript:` / `data:`)

### 4.6 Calendrier économique
- ✅ Événements gold-relevant filtrés depuis ForexFactory (Fed, FOMC, CPI, NFP, GDP, PCE, ISM, retail sales, BCE, BoE)
- ✅ Compte à rebours par événement (rouge pulsant <30 min, ambre <60 min)
- ✅ **Indicateur DÉGAGÉ / BLOQUÉ** : nouvelle position interdite dans les 45 min avant un événement HIGH
- ✅ Tooltips éducatifs sur chaque événement
- ✅ Warning soft à -120 min : "préparer la sortie avant FOMC"

### 4.7 Copilote IA — Marcus Reid
Voir [section 6](#6-le-copilote-ia--marcus-reid) pour le détail.

- ✅ Analyse à la demande (touche **R**) ou auto toutes les 30 min
- ✅ **Suggestion déterministe pré-calculée** envoyée à Claude — il n'arbitre que
- ✅ Sortie : LONG / SHORT / FLAT + biais + confiance + entrée/stop/target/invalidation/R:R
- ✅ Score de confluence pondéré 0–10 (seuil ≥6.0 + lead ≥2.0 pour actionnable)
- ✅ Type d'entrée : ● IDÉALE / ◐ AGGRESSIVE / ○ ATTENDRE
- ✅ Catalyseur structuré : **NOW** / **RISK** / **TRIGGER**
- ✅ Détection de setup nommé (LONDON_FALSE_BREAK, LONDON_CONTINUATION, NY_OVERLAP_TREND, FOMC_FADE, ASIAN_RANGE_BREAKOUT, EMA20_PULLBACK)
- ✅ Scénario alternatif (mirror trade) sur les setups binaires
- ✅ Rehearsal pré-trade : "vos 5 derniers setups identiques : 4W / 1L"

### 4.8 Risque & exécution
- ✅ **Calculatrice de position** : compte × risque % ÷ distance stop = taille en oz/lots, persistée en localStorage
- ✅ **Bouton presse-papier ordre** : un clic copie le ticket au format MT5, cTrader, TradingView ou texte brut
- ✅ **Alertes prix custom** : ABOVE / BELOW / TOUCH avec notifications navigateur
- ✅ **Alertes d'invalidation** automatiques : WARNING (≤0.5 % du niveau) / CRITICAL (cross)
- ✅ Détection de **thèse en affaiblissement** : 2/3 signaux MACD-FLIP / RSI-EXIT / EMA20-BREAK
- ✅ Détection de **tilt** après séries de pertes

### 4.9 Journal de trading
- ✅ Logger un trade : LONG/SHORT, entry/stop/target, notes, session
- ✅ Calcul P&L automatique à la clôture (base 100 oz / contrat COMEX)
- ✅ États de gestion : INITIAL / TRAIL_60 / PARTIAL_80 / STOPPED / TIME_STOP

### 4.10 Performance & analytics
Voir [section 8](#8-performance--analytics).
- ✅ Expectancy, profit factor, win rate, payoff ratio
- ✅ Distribution R-multiples
- ✅ Max drawdown $ et %
- ✅ Streaks gains / pertes max
- ✅ Heatmap win-rate par heure UTC
- ✅ Sharpe annualisé (rolling)
- ✅ **Export CSV** du journal (1 clic)

### 4.11 Briefing de session
- ✅ Auto-généré à l'ouverture de Londres (window 06–09 UTC)
- ✅ 5 sections : OVERNIGHT · KEY LEVELS · CALENDAR RISK · SESSION BIAS · WATCH FOR
- ✅ Auto-ouverture du modal sur génération
- ✅ Persisté en localStorage

### 4.12 PWA & offline
- ✅ **Installable** depuis la barre d'adresse (Chrome/Edge) ou "Ajouter à l'écran d'accueil" (iOS Safari)
- ✅ Service worker : pre-cache du shell + network-first sur `/api/*` avec fallback cache
- ✅ Manifeste avec icône SVG, theme color, viewport bloqué pour mobile

---

## 5. Architecture & sources de données

### 5.1 Stack technique

| Couche | Technologie |
|--------|-------------|
| Framework | Next.js 15.5.15 (App Router) + Turbopack |
| Frontend | React 19, TypeScript 5, Tailwind CSS 4 |
| Police | Geist Sans + Geist Mono |
| Charting | `lightweight-charts` v5.2 |
| Indicateurs | `technicalindicators` v3.1 (server-side) |
| Données marché | `yahoo-finance2` v3.14 (server-side) |
| LLM | `@anthropic-ai/sdk` v0.91, modèle **claude-sonnet-4-6** |
| PWA | manifest natif Next.js + service worker custom |
| Hébergement | Vercel (plan Hobby suffit) |

### 5.2 Routes API

| Route | Source externe | Clé requise ? | Cadence client | Cache serveur |
|-------|----------------|---------------|----------------|---------------|
| `/api/price` | gold-api.com **+ fallback Yahoo XAU=X** + Yahoo GC=F (OHLC) | Non | 30 s | aucun |
| `/api/signals` | Yahoo Finance (DXY, ^TNX, VIX, JPY=X, CL=F, BTC-USD, **SI=F, EURUSD=X, CHF=X, ^GSPC**) | Non | 60 s | aucun |
| `/api/technicals` | Yahoo GC=F multi-interval (15m / 1h / 4h agrégé) | Non | 60 s | 60 s |
| `/api/news` | Google News RSS | Non | 15 min | aucun |
| `/api/calendar` | ForexFactory thisweek JSON | Non | 60 s | 1 h |
| `/api/macro` 🆕 | **FRED** CSV public (DFII10, T10YIE, DFII5, T5YIFR) | Non | 10 min | 1 h |
| `/api/cot` 🆕 | **CFTC** Socrata public (gold COMEX, 5 ans) | Non | 1 h | 12 h |
| `/api/analyze` | Anthropic Claude API | **Oui*** | on-demand + 30 min | aucun |
| `/api/briefing` | Anthropic Claude API | **Oui*** | 1×/jour Londres open | aucun |
| `/api/replay` | Yahoo GC=F (path replay) | Non | 5 min (history) | aucun |
| `/api/backtest` | Yahoo GC=F (replay agrégé) | Non | on-demand | 1 h |

*\* Sans `ANTHROPIC_API_KEY`, les routes IA renvoient des mocks
réalistes dérivés du classifieur déterministe — la UI reste 100 %
fonctionnelle.*

### 5.3 Cron jobs Vercel (`vercel.json`)

| Path | Cron | Rôle |
|------|------|------|
| `/api/cot` | `30 22 * * 5` | Vendredi 22:30 UTC, après publication CFTC |
| `/api/macro` | `30 12 * * *` | 12:30 UTC quotidien — entre publi FRED matin et open NY |

Les deux gardent le cache Next chaud côté Vercel pour que les requêtes
utilisateur tombent sur cache plutôt que de hit FRED/CFTC à chaque fois.

### 5.4 Fallbacks gracieux

Toutes les routes renvoient HTTP 200 avec une payload de fallback en
cas d'erreur upstream — la UI ne crashe jamais. Quand une source est
dégradée, `meta.source: 'partial' | 'mock'` déclenche un badge
**DONNÉES SIMULÉES** dans le PriceBar.

### 5.5 Correction de basis futures→spot

Le ticker live (gold-api spot) et l'iframe TradingView affichent
~$4 615. Yahoo GC=F (futures front-month) affiche ~$4 644 à cause du
contango (+$25–40). `lib/priceFrame.ts` soustrait le basis de toutes
les bougies futures avant rendu pour qu'elles s'alignent avec le
ticker spot.

### 5.6 Durcissement sécurité

- Wrap `<headlines>…</headlines>` / `<patterns>…</patterns>` autour de tous les inputs externes injectés dans les prompts
- Strip de bytes de contrôle + tokens `system: / assistant: / user:`
- Strip de code-fences ` ```json ` avant `JSON.parse` (anti drift LLM)
- Validation de scheme `http(s)://` sur les URLs d'articles
- Cap 8 s + 1 MB sur le fetch RSS
- Validation de schéma sur les enregistrements localStorage
- Headers de sécurité globaux dans `next.config.ts` (CSP, X-Frame-Options DENY, STS, Referrer-Policy)
- 30 s timeout sur les SDK Anthropic (anti-DoS workers serverless)

---

## 6. Le copilote IA · Marcus Reid

### 6.1 Le persona

> _Marcus Reid, 15 ans desk XAU/USD chez Goldman Sachs avant de passer
> indépendant. Trade 3-5 fois par jour. Hold 2-4h. Précis, décisif,
> ne hedge jamais son langage._

### 6.2 Pipeline en 4 étapes

```
1. DETERMINISTIC CLASSIFIER  (lib/deterministicClassifier.ts)
   AnalysisRequest → SignalBreakdown
   ↳ 8 signaux scorés en TS pur, règles transparentes :
      trend / momentum / macd / dxy / us10y / session / news / calendar

2. DETERMINISTIC LEVEL PROPOSER  (lib/deterministicLevels.ts)
   SignalBreakdown + AnalysisRequest → LevelProposal
   ↳ Entry / stop / target satisfaisant les contraintes :
      stop = max(swing-low − 0.1×ATR, entry − 1.3×ATR)
      target ≤ 2× ATR ; aim swing-high si reachable
      reachable = false si R:R < 1:2 → caller force FLAT

3. CLAUDE AS JUDGE  (claude-sonnet-4-6 + cache_control:ephemeral)
   La suggestion (étapes 1+2) est passée à Claude qui peut :
   ↳ Confirmer verbatim si la lecture lui convient
   ↳ Surcharger un signal / un niveau avec rationale explicite

4. SERVER-SIDE RECONCILIATION  (app/api/analyze/route.ts)
   ↳ Si clearToTrade=false → recommendation forcée à FLAT
   ↳ Si confluence pondérée < ACTIONABLE_FLOOR (5.0) ou
     lead < DOMINANCE_LEAD (2.0) → recommendation forcée à FLAT
   ↳ generatedAt overwritten serveur (Claude ne peut pas backdate)
```

### 6.3 Règle d'actionable (renforcée v2)

```
ACTIONABLE_FLOOR  = 5.0  (lib/scoring.ts)
DOMINANCE_LEAD    = 2.0

isActionable = score ≥ FLOOR  AND  |bullish − bearish| ≥ LEAD
```

L'ancienne règle "5 of 8 raw count" est retirée. Cette nouvelle
formulation empêche le mismatch UI/recommandation où la barre montrait
6.0/10 alors que l'IA disait FLAT (4 signaux raw).

### 6.4 Confluence pondérée 0–10

| Signal | Poids | Justification |
|--------|------:|---------------|
| Trend (4H/1H structure) | 1.5 | Filtre le plus haute leverage |
| DXY direction | 1.5 | Macro inverse, primaire |
| US 10Y direction | 1.5 | Macro inverse, primaire |
| Session high-vol | 1.5 | Volume → fiabilité technique |
| News sentiment | 1.5 | Catalyseur rapide |
| Calendar gate | 1.0 | Hard gate ailleurs aussi |
| MACD direction | 0.75 | Corrélé au trend |
| RSI momentum | 0.75 | Corrélé au trend |
| **Total** | **10.0** | |

### 6.5 Playbooks par session

| Session UTC | Règle |
|-------------|-------|
| Tokyo (00–07) | Volume bas, faux-breakouts fréquents — confiance −1 niveau |
| London (07–12) | **False-break window 07:00–07:30** → entryType = WAIT ; après 07:30 = pullback EMA20 fiables |
| NY/Londres Overlap (12–16) | Pic de volume → conviction max si clearToTrade |
| NY (16–21) | Déclin → exiger 7+/8 confluence |
| Off-hours (21–00) | FLAT par défaut sauf confluence 8/8 + catalyseur majeur |

### 6.6 Path replay & outcome tracking

Toutes les 5 minutes, `useHistory` itère les analyses sans outcome et
appelle `GET /api/replay?generatedAt=…&horizonMinutes=240`. La route
ré-fetche les bougies 5 min entre l'analyse et maintenant et renvoie
le chemin OHLC. Classification client-side :

| Outcome | Définition |
|---------|------------|
| **HIT_TARGET** | Le chemin atteint le target avant le stop |
| **HIT_STOP** | Le chemin atteint le stop avant le target |
| **OPEN** | Ni l'un ni l'autre, fenêtre encore ouverte |
| **INCONCLUSIVE** | Prix tape les deux côtés (mean reversion) |

Cette logique évite les false-positives du legacy point-in-time
(checks à +2h / +4h qui pouvaient lire un mean-revert comme une win).

### 6.7 Coût d'une analyse (v2)

```
Input tokens cached:    ~2 200 (system prompt, cache_control:ephemeral)
Input tokens fresh:     ~1 800 (user message — snapshot + suggestion)
Output tokens:          ~400-600

Cached read:   ~$0.30/Mtok   →  ~$0.0007
Fresh input:   ~$3.00/Mtok   →  ~$0.0054
Output:       ~$15.00/Mtok   →  ~$0.006-0.009

Total/analyse: ~$0.012   (vs ~$0.021 en v1 — économie ~43 %)
```

À 50 analyses/jour : **~$0.60/jour**, **~$18/mois**. Avec un usage plus
modéré (10-20 analyses ciblées par session) : **~$5-10/mois**.

---

## 7. Risque & exécution · taille de position, ordre presse-papier, alertes

### 7.1 Calculatrice de position (`PositionSizingCard`)

**Inputs persistés** (localStorage `goldDashboard_traderProfile`) :
- `accountSize` — taille de compte en USD (défaut 10 000)
- `riskPct` — % du compte risqué par trade (défaut 0.5)

**Calcul** :
```
maxLossUsd   = accountSize × riskPct / 100
stopDistance = |entry − stop|
ouncesIdeal  = maxLossUsd / stopDistance
```

Surfacé en 3 granularités lot avec arrondi vers le bas (jamais
d'over-size accidentel) :
- **STD** (100 oz) : `floor(ouncesIdeal / 100)`
- **MINI** (10 oz) : `floor(ouncesIdeal / 10)`
- **MICRO** (1 oz) : `floor(ouncesIdeal)`

Et le risque réalisé à chaque granularité (visible le rounding cost :
"vous avez set 0.5 % = $50, le risque réel à mini est $42").

### 7.2 Bouton presse-papier ordre (`CopyOrderButton`)

Cycle de 4 formats sur clic du chip de gauche :

| Format | Exemple |
|--------|---------|
| **MT5** | `BUY XAUUSD 0.10 @ 2441.00 SL 2420.00 TP 2480.00` |
| **CTRADER** | `BUY XAUUSD Volume=0.10 Limit=2441.00 SL=2420.00 TP=2480.00` |
| **TRADINGVIEW** | `long XAUUSD entry=2441.00 stop=2420.00 target=2480.00 size=0.10` |
| **PLAIN** | `LONG XAUUSD \| size 0.10 \| entry 2441.00 \| stop 2420.00 \| target 2480.00` |

Le format choisi est sticky en localStorage. Le bouton flash vert
(✓ COPIÉ) ou rouge (✗ ÉCHEC) pendant 1.5 s.

### 7.3 Alertes prix custom (`useCustomAlerts`)

Trois directions :
- **ABOVE** — fire quand le prix monte à travers le seuil
- **BELOW** — fire quand le prix descend à travers le seuil
- **TOUCH** — fire dans les deux sens

Single-fire par défaut (`firedAt` set au moment du trigger). L'alerte
peut être réarmée manuellement.

### 7.4 Notifications navigateur (`lib/notifications.ts`)

Wrapper minimal autour de `window.Notification` :
- `requestNotificationPermission()` — async, prompt OS, mémorise le résultat
- `notify({ title, body, tag })` — `tag` dédoublonne (re-fire remplace au lieu d'empiler)
- `canNotify()` — synchrone, gating UI

### 7.5 Alertes d'invalidation (existant, conservé)

| Tier | Trigger | UI |
|------|---------|----|
| **WARNING** | Prix à ≤0.5 % du niveau d'invalidation | Banner ambre ⚠ APPROCHE INVALIDATION |
| **CRITICAL** | Prix a franchi l'invalidation | Banner rouge ⚠ THÈSE INVALIDÉE |

Dédoublonnage par analyse, auto-expiration après 4h. Layout-spacer
dynamique sous le PriceBar pour ne pas cacher la signal-strip.

### 7.6 Détection de thèse en affaiblissement (`useThesisHealth`)

Trois signaux watchés en temps réel sur la position active :

| Signal | Définition |
|--------|------------|
| `MACD_FLIP` | MACD croise contre la direction du trade |
| `RSI_EXIT` | RSI sort de la bande qui supporte le biais (LONG: RSI<45 ; SHORT: RSI>55) |
| `EMA20_BREAK` | Prix clôt au-delà de l'EMA20 contre la position |

État `WEAKENING` quand ≥2 de 3 fire — alerte WARNING levée. État
`BROKEN` quand le niveau d'invalidation est franchi (alerte CRITICAL
gérée par `useAlerts`).

---

## 8. Performance & analytics

### 8.1 PerformanceSummaryCard (visible dans `AnalysisPanel`)

Pré-3 trades : placeholder éducatif. À partir de 3 trades clos :

| Métrique | Description | Couleur |
|----------|-------------|---------|
| **EXPECTANCY** | $/trade moyen — la métrique la plus importante | Vert si >0, rouge si <0 |
| **PROFIT FACTOR** | gross_win / gross_loss | Vert si ≥1, rouge sinon |
| **WIN RATE** | wins / total | Neutre |
| **PAYOFF** | avg_win / |avg_loss| | Neutre |
| **MAX DD** | Drawdown $ + % peak-to-trough | Rouge |
| **SHARPE A.** | Sharpe annualisé × √252 | Vert si ≥1 |

Pied : streaks max gains / pertes consécutifs.

### 8.2 Métriques calculées (`lib/performanceAnalytics.ts`)

Toutes les métriques sont des **fonctions pures** sur `JournalEntry[]`,
faciles à backtester et à unit-tester :

```ts
computePerformance(entries) → {
  totalClosed, totalWins, totalLosses,
  winRate, expectancy, profitFactor,
  avgWin, avgLoss, payoffRatio,
  totalPnl,
  maxDrawdownAbs, maxDrawdownPct,
  rMultiples,            // signed R par trade (pnl / risk-at-stop)
  maxConsecutiveWins, maxConsecutiveLosses,
  timeOfDayBuckets,      // 24 heures UTC, win rate par bucket
  sharpeAnnualized,
  generatedAt,
}
```

Chaque métrique retourne `null` quand l'échantillon est insuffisant —
la UI cache simplement le chip plutôt que d'afficher "0".

### 8.3 R-multiple

Pour chaque trade clos :
```
risk      = |entry − stop| × 100  (1 lot = 100 oz)
rMultiple = pnl / risk
```

La distribution des R permet d'évaluer la qualité du système :
- **Pro** : médiane >0, longue queue droite (asymmetric upside)
- **Random** : médiane ≈ 0, distribution gaussienne
- **Anti-edge** : médiane <0

### 8.4 Heatmap time-of-day

24 buckets UTC, un par heure. Buckets avec <3 trades reportent `winRate=null`
(évite le faux-positif "100 % à 3h du matin sur 1 trade").

Surface une question pratique : "où dans la journée est-ce que je perds
de l'argent ?". Si l'heure 14:00 UTC affiche systématiquement un win-rate
<40 %, c'est un signal pour ne plus trader cette fenêtre.

### 8.5 Export CSV

Bouton `⇩ CSV` en haut de la PerformanceCard. Télécharge le journal en
CSV avec colonnes : `id, direction, session, entry, stop, target, exit,
pnl_usd, r_multiple, createdAt, closedAt, mgmtState, notes`. Format
compatible Excel / Google Sheets / pandas direct.

---

## 9. Carte de l'interface

### 9.1 Layout desktop (≥1024 px)

```
┌──────────────────────────────────────────────────────────────────────┐
│  PRICEBAR · NUGX | XAU/USD | $4,615.40 -29.10 (-0.63%) | H | L | …  │ 48 px
├──────────────────────────────────────────────────────────────────────┤
│  [ALERTBANNER si actif — invalidation crossings]                     │
│  SIGNALSPANEL · MACRO DXY US10Y · TECHNIQUE RSI MACD …               │ 58 px
│  MACRO+ · RÉEL10Y INFL10Y GSR VOL COT MM ◄── nouveau v2              │ 24 px
├─────────────┬────────────────────────────────┬───────────────────────┤
│             │                                │                       │
│  NEWSFEED   │        GOLDCHART               │     ANALYSISPANEL     │
│  (left)     │  ─ Lightweight Charts (70%)    │     (Copilote)        │
│  300 px     │  ─ TradingView strip (30%)     │     320 px            │
│  ────────   │  ─ Ligne LIVE temps-réel ◄──   │     + PositionSizing  │
│  CALENDAR   │                                │     + CopyOrder       │
│             │                                │     + Performance     │
├─────────────┴────────────────────────────────┴───────────────────────┤
│  Hints clavier : R analyser · J journal                              │ 20 px
├──────────────────────────────────────────────────────────────────────┤
│  BOTTOMBAR · OUV PRÉC VAR H L 52SH 52SB · MAJ HH:MM:SS · LIVE        │ 36 px
└──────────────────────────────────────────────────────────────────────┘
```

### 9.2 Overlays
- **JOURNALPANEL** — slide-in 380 px depuis la droite (touche **J**)
- **BRIEFINGMODAL** — modal centré 480 px (auto à 07:00 UTC ou chip BRIEFING)
- **Tooltip** — portal hover-only, 240 px, viewport-clamped

### 9.3 Responsive

| Viewport | Layout |
|----------|--------|
| **Mobile** (<768 px) | Vertical empilé : chart (1) → copilote (2) → news+calendrier (3) ; chart 280 px ; drawers forcés ouverts |
| **Tablet** (768–1023 px) | Vertical empilé ; chart 420 px ; colonnes 240 px |
| **Desktop** (≥1024 px) | 3 colonnes flex ; chart flex:1 ; drawers toggleables |

---

## 10. Walkthrough d'une session

### Ouverture (07:00 UTC — début Londres)

1. **Ouvrir le dashboard.** Le prix tick automatiquement, les chips macro se peuplent en 60 s, les actus en 15 min.
2. **Le BRIEFING MODAL s'ouvre** automatiquement (window 06–09 UTC). Lire les 5 sections en 30 s — surtout le **WATCH FOR**.
3. **Fermer le modal** (ESC ou ✕). Le briefing reste accessible via le chip vert dans le PriceBar.
4. **Scanner la strip MACRO+** : le rendement réel 10Y est-il au-dessus ou sous l'ouverture d'hier ? Le COT est-il en zone d'extrême ?

### Phase d'analyse

5. **Vérifier le calendrier** : indicateur DÉGAGÉ ou BLOQUÉ ? Si BLOQUÉ → recommandation forcée à FLAT.
6. **Scanner les actus** : `⚡ URGENT` pour ne voir que les HIGH-impact. Hover sur un titre → tooltip avec source.
7. **Strip d'alignement sous le chart** : 4H / 1H / 15M dans le même sens = badge `● ALIGNÉ` = setup haute conviction.
8. **Presser R** → le copilote met ~5–8 s à produire la thèse (avec prompt cache, ~3-5 s sur les calls subséquents).

### Lecture de la thèse

9. **Recommendation** grosse police : LONG / SHORT / FLAT. Si FLAT, ne pas trader.
10. **Confluence pondérée 0–10** : ≥6.0 vert avec lead ≥2.0 = haute conviction.
11. **Niveaux** : ENTRÉE / STOP / OBJECTIF / INVALIDATION + R:R minimum 1:2.
12. **Type d'entrée** : ● IDÉALE = tirer maintenant ; ◐ AGGRESSIVE = setup en formation, taille réduite ; ○ ATTENDRE = ne rien faire.
13. **Catalyseur** : `NOW` (pourquoi ça bouge) → `RISK` (la menace) → `TRIGGER` (à quoi attendre pour confirmer).

### Sizing & exécution

14. **Carte DIMENSIONNEMENT** sous les niveaux : taille calculée auto à partir de votre compte × risque %. Surfacée en STD/MINI/MICRO lots.
15. **Bouton COPIER ORDRE** : un clic copie le ticket dans le format de votre broker.
16. Coller dans MT5 / cTrader / TradingView / Telegram pour exécuter.

### Suivi

17. **Logger le trade** dans le JOURNAL (touche **J**) : direction, prix, stop, target, notes courtes.
18. Si le prix s'approche de l'invalidation → banner WARNING ambre. S'il franchit → banner CRITICAL rouge.
19. Si la thèse s'affaiblit (2/3 signaux MACD-FLIP / RSI-EXIT / EMA20-BREAK) → alerte préventive avant l'invalidation.
20. À la clôture, retourner au journal, saisir l'exit, fermer le trade. P&L calculé auto.

### Post-session

21. **PerformanceSummaryCard** : check expectancy, profit factor, max DD.
22. **Heatmap time-of-day** : identifier les heures où vous perdez systématiquement.
23. **Export CSV** mensuel pour analyse offline (pandas / Excel).

---

## 11. Raccourcis clavier · interactions

### Clavier (gérés au niveau page.tsx, ignorés en INPUT/TEXTAREA)

| Touche | Action |
|--------|--------|
| **R** | Déclenche l'analyse copilote |
| **J** | Toggle le panneau journal |
| **ESC** | Ferme journal + briefing modal |

### Clics

| Élément | Effet |
|---------|-------|
| Chips ACTUS / COPILOTE (PriceBar) | Toggle des drawers gauche/droite |
| Chip BRIEFING | Ouvre le briefing modal |
| Tabs 15M / 1H / 4H (chart) | Switch de timeframe |
| Filtres TOUS / URGENT / ▲ / ▼ | Filtre du flux d'actus |
| Article (NewsFeed) | Ouvre dans nouvel onglet |
| Bouton LANCER L'ANALYSE | Trigger copilote |
| Chip format (CopyOrderButton) | Cycle MT5 → cTrader → TradingView → Plain |
| Bouton COPY | Copie le ticket dans le presse-papier |
| Bouton ⇩ CSV (PerformanceCard) | Télécharge le journal CSV |
| ✕ sur banner d'alerte | Dismiss l'alerte |

### Hover

Toute étiquette dans la UI déclenche un tooltip explicatif (en français).

### Pan/zoom chart

- Drag horizontal = pan dans l'historique
- Scroll molette sur axe X = zoom in/out
- Le zoom est **préservé entre les polls** de 60 s (sauf changement de timeframe)

---

## 12. PWA & mode hors-ligne

### 12.1 Installation

| Plateforme | Méthode |
|------------|---------|
| Chrome / Edge / Brave (desktop) | Icône d'installation dans la barre d'adresse → "Installer" |
| Safari iOS | Bouton Partager → "Sur l'écran d'accueil" |
| Chrome Android | Menu kebab → "Installer l'application" |
| Firefox | Pas de support PWA natif — utiliser le navigateur |

### 12.2 Service worker (`public/sw.js`)

Stratégie de cache minimaliste — pas de Workbox, pas de manifest de
pré-cache automatique :

| Type de requête | Stratégie |
|-----------------|-----------|
| Shell (navigation `/`) | Cache-first avec refresh background |
| `/api/*` | Network-first avec fallback cache |
| Tout le reste | Pass-through (HTTP cache du navigateur) |

L'objectif est qu'une connexion flaky affiche la dernière donnée
connue plutôt que de 503. Pas de stockage agressif des prix — un
cache qui sert un prix de 10 minutes est pire qu'un échec visible.

### 12.3 Manifest (`app/manifest.ts`)

```ts
{
  name: 'NUGX — XAU/USD Terminal',
  short_name: 'NUGX',
  display: 'standalone',
  background_color: '#0a0a0a',
  theme_color: '#0a0a0a',
  categories: ['finance', 'business', 'productivity'],
  icons: [{ src: '/icons/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
}
```

---

## 13. Données locales · vie privée

### 13.1 Clés localStorage (`goldDashboard_*`)

| Clé | Type | Rôle |
|-----|------|------|
| `goldDashboard_journal` | `JournalEntry[]` | Trades loggés |
| `goldDashboard_analysisHistory` | `AnalysisHistoryRecord[]` | Toutes les analyses + outcomes |
| `goldDashboard_alerts` | `InvalidationAlert[]` | Alertes actives + dismiss state |
| `goldDashboard_briefings` | `SessionBriefing[]` | 1 par jour, replace même date |
| `goldDashboard_traderProfile` 🆕 | `TraderProfile` | Compte + risque % pour position-sizing |
| `goldDashboard_customAlerts` 🆕 | `CustomAlert[]` | Alertes prix custom |
| `goldDashboard_orderFormat` 🆕 | `OrderFormat` | Format préféré pour le presse-papier |

Cap par store : 200 records max sur `analysisHistory` — éviction LRU
au-delà.

### 13.2 Cross-tab sync

Les hooks (`useTraderProfile`, `useCustomAlerts`) écoutent `window.storage`
et se rechargent quand un autre onglet écrit. Les notifications custom
ne sont pas dédoublonnées entre onglets — un trader avec deux fenêtres
ouvertes peut recevoir deux notifications.

### 13.3 Ce qui est envoyé à Anthropic

Le snapshot de marché complet (prix, macro, technique, calendrier,
actus). **Pas de PII** — juste des données de marché publiques + les
agrégats de performance personnelle (`totalOutcomes`, `accuracy %`).

### 13.4 Ce qui n'est jamais envoyé

- Notes du journal (contenu libre du trader)
- Outcomes individuels trade-par-trade
- Prix exact d'entrée/sortie de chaque trade journal
- Compte / taille de position (calcul 100% local)

### 13.5 Git-ignored

```
.env.local              # ANTHROPIC_API_KEY
.next/, /node_modules/, *.log
.vercel/                # link projet Vercel
```

---

## 14. Démarrage rapide

### Local

```bash
cd NUGX
npm install
npm run dev          # http://localhost:3000 (ou 3001)
```

### Variables d'environnement

Créer `.env.local` à la racine :

```env
ANTHROPIC_API_KEY=sk-ant-...
```

**Sans cette clé**, `/api/analyze` + `/api/briefing` renvoient des mocks
réalistes dérivés du classifieur déterministe — toutes les autres
fonctionnalités tournent à 100 % (gold-api, Yahoo, Google News,
ForexFactory, FRED, CFTC sont gratuits).

### Obtenir une clé Anthropic

→ https://console.anthropic.com/settings/keys

Modèle utilisé : **`claude-sonnet-4-6`** (avec prompt caching).

### Vérifier l'install

```bash
npm run build         # build prod, doit terminer sans erreur
```

---

## 15. Coût d'exploitation

| Poste | Source | Plan | Coût / mois |
|-------|--------|------|-------------|
| Hébergement | Vercel | Hobby (gratuit) | **$0** |
| Prix spot | gold-api.com + Yahoo | Public, gratuit | $0 |
| Macro & technique | Yahoo + FRED + CFTC | Public, gratuit | $0 |
| News | Google News RSS | Public, gratuit | $0 |
| Calendrier | ForexFactory | Public, gratuit | $0 |
| **Anthropic API** | claude-sonnet-4-6 | Pay-per-token | **~$13** _(50 calls/jour)_ |
| | | | **~$5** _(20 calls/jour)_ |

**Pas de clé Anthropic** = coût 0 €. Le copilote tombe sur les mocks
déterministes qui sont déjà une baseline solide grâce à Phase 12.8.

### Fenêtre Vercel Hobby
- 100 GB-h de compute / mois (largement suffisant pour 1 user)
- 100 GB de bande passante / mois
- Cron jobs : **1 / jour max** (limite respectée — voir [§5.3](#53-cron-jobs-vercel-verceljson))
- Pas de fonctions edge (pas nécessaire ici)

---

## 16. Déploiement Vercel

### 16.1 Premier déploiement (web)

1. Aller sur https://vercel.com/new
2. Importer `LouisAvisse/NUGX`
3. Ajouter `ANTHROPIC_API_KEY` aux variables d'env (optionnel)
4. Cliquer **Deploy**

Vercel détecte Next.js automatiquement, lit `vercel.json`, configure
les cron jobs. URL live en ~60 s.

### 16.2 Premier déploiement (CLI)

```bash
npm i -g vercel
vercel login
vercel link             # link folder to project
vercel env add ANTHROPIC_API_KEY production
vercel --prod
```

### 16.3 Re-déploiement

Tout `git push origin main` re-déploie automatiquement (si la
connexion GitHub est faite). Sinon, `vercel --prod` depuis le folder.

### 16.4 Vérifier qu'un deploy est à jour

```bash
curl <deployment>/api/macro
# doit renvoyer JSON avec realYield10y / breakeven10y
# si 404 → build pre-Phase-12.2

curl <deployment>/manifest.webmanifest
# doit renvoyer le manifest PWA
# si 404 → build pre-Phase-12.7
```

---

## 17. Limites connues · roadmap

### 17.1 Limites connues

| Surface | Limite | Pourquoi |
|---------|--------|----------|
| **Bid/ask spread** | Non surfacé | Aucune source gratuite ne le publie pour XAUUSD ; nécessite OANDA, Polygon ou Tiingo Pro |
| **Real yields dans le prompt** | `/api/analyze` ne consomme pas encore les données `/api/macro` | Phase 12.2 ship la donnée, pas encore l'intégration prompt — Phase 12.12 prévue |
| **52-semaines H/L** | Placeholders fixes dans BottomBar | Pas de source 52-w dans gold-api ; à câbler via Yahoo `range=1y` |
| **ForexFactory weekend** | Évents tous passés samedi-dimanche | ForexFactory ne publie qu'un fichier hebdo (`thisweek.json`), `nextweek.json` 404 |
| **Pattern markers** | Posés sur la dernière bougie quel que soit le candle réel | Patterns ne se déclenchent que sur les 3 dernières bougies, erreur visuelle ≤ 2 bougies |
| **A11Y** | Tooltips au hover seulement, pas de focus-trap modals, signal couleur uniquement | Reporté à un sprint dédié |
| **Vercel Hobby cron** | 1×/jour max — `/api/macro` ne se rafraîchit qu'à 12:30 UTC | Plan Pro Vercel le débloque ; alternative : pollings client plus agressifs |
| **Push notifications** | Pas implémentées (web-push nécessite VAPID + état serveur) | Notifications navigateur natives (foreground only) en remplacement |

### 17.2 Roadmap prioritisée

#### **Phase 12.12** — _High ROI, free, ~50 lignes_
Étendre `AnalysisRequest` + le user-message builder pour piper les
real yields (DFII10/T10YIE) et le COT (Managed Money net + percentile)
dans le prompt Claude. Aujourd'hui la donnée existe sur le dashboard
mais pas dans le contexte du copilote. C'est le single-biggest-win
restant sur la qualité d'analyse.

#### **Phase 13** — _Distribution + retention_
- Push notifications avec VAPID self-hosted (free, mais nécessite
  une route `/api/push/subscribe` et état serveur)
- Webhooks Telegram / Discord pour les alertes
- Export PDF du briefing matinal

#### **Phase 14** — _Advanced backtest_
- Walk-forward backtest mode (étend la harness existante)
- Monte Carlo bootstrap des R-multiples historiques (estimation
  probabilité de drawdown)

#### **Phase 15** — _Multi-user / SaaS_ (uniquement si pivot)
- Auth via Clerk (Marketplace Vercel)
- Postgres pour persistance per-user (Neon via Marketplace)
- Vercel KV pour rate-limit
- Pricing tiers : Free / Pro $19 / Pro+ $49

### 17.3 Audit security status

| Finding | Sévérité | Statut |
|---------|----------|--------|
| H1 — Next.js DoS (GHSA-q4gf-8mx6-v5v3) | HIGH | ✅ Patché (Next 15.5.15) |
| M1 — URL scheme validation | MEDIUM | ✅ Validé `^https?://` côté route + click |
| M2 — Headlines injection | MEDIUM | ✅ Wrap `<headlines>` + sanitize |
| M3 — Calendar events injection | MEDIUM | ✅ Wrap `<calendar>` + sanitize |
| M4 — JSON code-fence drift | MEDIUM | ✅ Strip avant `JSON.parse` |
| L-class (10 findings) | LOW | ✅ Tous patchés |

---

## Annexe A — Modules clés du code

```
app/
├── api/
│   ├── price/route.ts        # gold-api + Yahoo XAU=X fallback + GC=F OHLC
│   ├── signals/route.ts      # Yahoo: DXY US10Y VIX JPY CHF EUR XAG SPX OIL BTC
│   ├── macro/route.ts        # 🆕 FRED real yields + breakeven
│   ├── cot/route.ts          # 🆕 CFTC Managed Money positioning
│   ├── technicals/route.ts   # Yahoo GC=F multi-TF + indicateurs
│   ├── news/route.ts         # Google News RSS + tagging
│   ├── calendar/route.ts     # ForexFactory + clearToTrade gate
│   ├── analyze/route.ts      # Claude Marcus Reid + déterministe + isActionable
│   ├── briefing/route.ts     # Claude London open briefing
│   ├── replay/route.ts       # Path replay 5min pour outcome tracking
│   └── backtest/route.ts     # Replay agrégé sur fenêtre historique
├── layout.tsx                # PWA meta + service worker register
├── manifest.ts               # 🆕 PWA manifest
└── page.tsx                  # Layout 3-cols + raccourcis + état global

lib/
├── deterministicClassifier.ts  # 🆕 Pure-TS signal classification
├── deterministicLevels.ts      # 🆕 Pure-TS level proposer
├── scoring.ts                  # Weighted confluence + ACTIONABLE_FLOOR/LEAD
├── pivots.ts                   # 🆕 Classical + Camarilla pivots
├── vwap.ts                     # 🆕 Anchored VWAP (London/NY)
├── atrPercentile.ts            # 🆕 Volatility regime LOW/NORMAL/HIGH/EXTREME
├── positionSizing.ts           # 🆕 Account × risk → lots
├── orderClipboard.ts           # 🆕 MT5 / cTrader / TradingView / Plain formatters
├── customAlerts.ts             # 🆕 ABOVE/BELOW/TOUCH price triggers
├── notifications.ts            # 🆕 window.Notification wrapper
├── performanceAnalytics.ts     # 🆕 Expectancy / PF / R-mults / DD / Sharpe
├── historyExport.ts            # 🆕 CSV exports + downloadAsFile
├── macroFred.ts                # 🆕 FRED CSV client
├── technicals.ts               # EMA/RSI/MACD/ATR/BB compute
├── patterns.ts                 # Candlestick + structure detection
├── setups.ts                   # Named setup detection
├── tiltDetector.ts             # Series-of-losses detection
├── alerts.ts                   # Invalidation alerts
├── session.ts                  # UTC time → session classification
└── priceFrame.ts               # Basis correction futures→spot

components/
├── PriceBar.tsx                # Top bar
├── SignalsPanel.tsx            # Macro + technique strip
├── MacroExtrasRow.tsx          # 🆕 MACRO+ strip (real yields, GSR, ATR, COT)
├── TradingViewChart.tsx        # Lightweight Charts + AI lines + LIVE line 🆕
├── NewsFeed.tsx                # RSS + filtres + sentiment ratio
├── CalendarPanel.tsx           # ForexFactory + countdown + DÉGAGÉ/BLOQUÉ
├── AnalysisPanel.tsx           # Copilote Marcus Reid (calibration retiré)
├── PositionSizingCard.tsx      # 🆕 Lot calculator
├── CopyOrderButton.tsx         # 🆕 Order ticket clipboard
├── PerformanceSummaryCard.tsx  # 🆕 Expectancy / PF / etc.
├── JournalPanel.tsx            # Trade journal + MEMORY tab
├── BriefingModal.tsx           # London open briefing
├── AlertBanner.tsx             # Invalidation banners
├── BottomBar.tsx               # OHLC stats footer
└── Tooltip.tsx                 # Reusable hover tooltip
```

---

## Annexe B — Changelog v2

| Commit | Phase | Sujet |
|--------|-------|-------|
| `d148cca` | 12.1 | Modernize analyzer: Sonnet 4.6 + prompt caching + weighted-threshold reconciliation |
| `010f106` | 12.2 | Free macro depth: real yields, COT, cross-asset tickers |
| `b8b3a0c` | 12.3 | Technical depth: pivots, anchored VWAP, ATR regime, real-time price line |
| `683e413` | 12.4 | Risk & execution UX: position sizing, order ticket, custom alerts, browser notifications |
| `f9298b9` | 12.5 | Performance analytics depth: expectancy, profit factor, R-multiples, drawdown, exports |
| `3ce6987` | 12.6 | UI surfacing: macro-extras strip + performance summary card |
| `b2227ce` | 12.7 | PWA: installable shell, offline service worker |
| `fe6a376` | 12.8 | Deterministic decomposition: pre-classify signals + pre-compute levels |
| `9a35b59` | 12.9 | Multi-source price: gold-api primary + Yahoo XAU=X fallback |
| `1845133` | 12.10 | Vercel deploy: cron jobs + narrowed COT payload |
| `a39c2a3` | 12.10 | Reduce macro cron to daily for Vercel Hobby plan |
| `c0ba261` | 12.11 | Remove calibration feature end-to-end |

---

_Fin de la documentation produit v2._
