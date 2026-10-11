# Paiement Maketou et codes d'accès

## Parcours
1. `/offre` → `startCheckout` crée un paiement `pending` puis un panier Maketou (notre `paymentId` est passé en `meta`).
2. Le membre paie sur Maketou, puis revient sur `/paiement/retour?payment=…`.
3. Maketou appelle `POST /api/public/hooks/maketou?token=…`. Le serveur relit le panier auprès de l'API Maketou, contrôle le montant, marque le paiement `success` et ouvre l'accès (`activateClubAccess`). Le traitement est idempotent.
4. Filets de sécurité : la page de retour relit l'état chez Maketou ; le cron quotidien (`reminders`) rapproche les paiements en attente de moins de 48 h ; l'admin a un bouton « Vérifier chez Maketou ».

## Variables d'environnement
| Variable | Rôle |
|---|---|
| `MAKETOU_API_KEY` | Clé API (dashboard Maketou → Autres → Clés API) |
| `MAKETOU_PRODUCT_CLUB_MONTHLY` / `MAKETOU_PRODUCT_CLUB_QUARTERLY` | Identifiants des produits Maketou |
| `MAKETOU_PRODUCT_ENG_SINGLE`, `_THREE_WINDOWS`, `_ALL_WINDOWS`, `_CONCIERGE` | Accompagnement payé en une fois (prix = total) |
| `MAKETOU_PRODUCT_ENG_SINGLE_HALF`, `_THREE_WINDOWS_HALF`, `_ALL_WINDOWS_HALF`, `_CONCIERGE_HALF` | Accompagnement en 2 fois (prix = une tranche) |
| `MAKETOU_WEBHOOK_SECRET` | Jeton ajouté à l'URL du webhook (`?token=`) |
| `APP_URL` | URL publique du site (sinon déduite de la requête) |
| `MAKETOU_BASE_URL`, `MAKETOU_CHECKOUT_PATH`, `MAKETOU_CART_PATH` | Facultatif : chemins de l'API si différents des valeurs par défaut |

## À confirmer avec la documentation Maketou
Tout ce qui dépend du format Maketou est isolé dans `src/lib/maketou.server.ts` :
- endpoint et champs de création de panier (`productDocumentId`, `redirectURL`, `meta`) ;
- endpoint de lecture d'un panier et libellés de statut ;
- format du webhook. La lecture est tolérante (plusieurs enveloppes et noms de champs acceptés) ; ajuster `parseCart` si besoin.

## Codes d'accès
- Générés dans `/admin` par lots (durée, utilisations, expiration, libellé), téléchargés en CSV.
- 16 caractères, alphabet sans O/0/I/1, affichés `XXXX-XXXX-XXXX-XXXX`.
- Consommation atomique en base (`redeem_access_code`), 5 échecs maximum par heure et par membre.

## Accompagnement en 2 tranches
- 1re tranche à la commande, 2e à J+30. L'engagement passe « actif » dès la 1re tranche.
- Le crédit Club est déduit de la 1re tranche : le montant réduit est envoyé à Maketou (`amount`). Si Maketou facture quand même le prix du produit, le paiement est accepté et la différence apparaît dans l'admin, rubrique « Crédits à rembourser ».
- Relances de 2e tranche à J-5, J-1, J0 et J+3. Le passage du dossier en « déposé » est bloqué tant que le solde n'est pas réglé.

## Tâches planifiées
| Route | Fréquence | Rôle |
|---|---|---|
| `POST /api/public/hooks/reminders` | quotidienne | Met en file toutes les relances (abonnement, 2e tranche, engagement, inactivité, recommandateurs) et rapproche les paiements en attente |
| `POST /api/public/hooks/bourse-alerts` | quotidienne | Alertes de bourses compatibles |
| `POST /api/public/hooks/dispatch` | horaire | Envoie les messages dus, entre 8 h et 20 h dans le fuseau de chaque membre |

Toutes demandent l'en-tête `Authorization: Bearer <jeton cron>`.
