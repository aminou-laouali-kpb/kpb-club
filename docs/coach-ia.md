# Coach IA (Claude API)

## Principe
Le coach **évalue, questionne et signale** ; il ne rédige jamais à la place de l'étudiant.
Une demande « écris-moi… » est refusée avant tout appel à l'API (sans décompte), et le prompt
système l'interdit aussi au modèle.

## Modèles
| Fonction | Modèle | Effort |
|---|---|---|
| Analyse d'essai, revue de CV, questions et bilan d'entretien | `claude-sonnet-5-5` | `medium` |
| Questions-réponses, retour après chaque réponse d'entretien, type de document | `claude-haiku-5-5` | `low` |

Modifiables par `AI_MODEL_STRONG` / `AI_MODEL_FAST`. Sur Claude Sonnet 5.5, le repli automatique en
cas de refus est activé (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`).

## Variables d'environnement
| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Clé de l'API Claude (console Anthropic) — obligatoire |
| `AI_MODEL_STRONG`, `AI_MODEL_FAST` | Facultatif : remplacer les modèles par défaut |

## Quotas mensuels (remis à zéro le 1er, dans le fuseau du membre)
| | Gratuit | Club | Accompagnement |
|---|---|---|---|
| Analyse d'essai | 1 (à vie) | 10 | 30 |
| Revue de CV | 0 | 3 | 10 |
| Entretien (sessions) | 0 | 2 | 6 |
| Questions | 0 | 100 | 300 (20 par jour au plus) |

Un appel en échec (JSON illisible après un nouvel essai, refus, indisponibilité) n'est pas décompté.

## Données
- Les essais et questions sont envoyés sans nom, email ni téléphone.
- Les pièces d'identité ne sont jamais envoyées à l'IA. L'identification du type de document
  ne se fait qu'à la demande de l'étudiant.
- `ai_usage.result` garde les scores, les critères et de courtes citations, pas le texte complet.
- Coût estimé de chaque appel dans `ai_usage.cost_usd` (tarifs dans `src/lib/ai/cost.ts`, à vérifier
  sur la page officielle des prix).

## Base de connaissances (questions-réponses)
La table `knowledge_chunks` est remplie par la migration `0010_knowledge_seed.sql`, générée depuis
le guide. Après une mise à jour du guide ou du catalogue des bourses :

```bash
bun scripts/build-knowledge.ts drizzle/migrations/00NN_knowledge_refresh.sql
```
