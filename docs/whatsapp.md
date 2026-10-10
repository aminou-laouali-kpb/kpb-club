# WhatsApp (connexion par code, bot, notifications) et SMS de secours

## À faire dès maintenant chez Meta (l'approbation prend plusieurs jours)
Dans WhatsApp Manager → Modèles de messages, créer en **français** :

### `kpb_otp` — catégorie **Authentification**
- Type : code à usage unique, bouton **Copier le code**.
- Texte imposé par Meta : « *{{1}}* est votre code de vérification. »
- Cocher « Ajouter une mention de sécurité » et « Expiration : 10 minutes ».

### `kpb_notification` — catégorie **Utilitaire**
```
*{{1}}*
{{2}}

{{3}}
```
- {{1}} : titre (ex. « Votre abonnement expire dans 7 jours »)
- {{2}} : message court
- {{3}} : lien vers l'application
- Exemple à fournir : « Échéance dans 3 jours » / « Il te reste 3 jours pour : Relevés de notes. » / « https://app.kpb-education.com/candidatures »

## Webhook
- URL : `{APP_URL}/api/public/hooks/whatsapp`
- Jeton de vérification : la valeur de `WHATSAPP_VERIFY_TOKEN`
- Champs à cocher : `messages` (messages reçus et statuts de livraison)

## Variables d'environnement
| Variable | Rôle |
|---|---|
| `WHATSAPP_TOKEN` | Jeton d'accès permanent (utilisateur système) |
| `WHATSAPP_PHONE_NUMBER_ID` | Identifiant du numéro d'envoi |
| `WHATSAPP_VERIFY_TOKEN` | Chaîne libre, recopiée dans la configuration du webhook |
| `WHATSAPP_APP_SECRET` | Secret de l'application Meta (signature des webhooks) |
| `WHATSAPP_TEMPLATE_LANG` | `fr` par défaut |
| `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_NOTIFICATION_TEMPLATE` | Facultatif : autres noms de modèles |
| `OTP_HASH_SECRET` | Chaîne aléatoire longue, pour le hachage des codes |
| `SMS_API_KEY`, `SMS_USERNAME`, `SMS_SENDER_ID` | Africa's Talking, pour le SMS de secours (`SMS_USERNAME=sandbox` pour les essais) |
| `KPB_SUPPORT_EMAIL` | Reçoit les demandes « agent » du bot |

## Fonctionnement
- **Connexion** : le code part sur WhatsApp. Sans confirmation de livraison au bout de 20 s, l'écran l'envoie par SMS. Limites : 5 codes par numéro et par heure, 5 essais par code, validité 10 minutes. Un numéro déjà relié à un compte email ouvre ce compte.
- **Bot** : `statut`, `échéances`, `bourses`, `action`, `aide`, `agent`. Une photo ou un PDF envoyé est rangé dans le coffre-fort (une photo devient un PDF), puis le bot demande le type de pièce. Aucune IA n'est utilisée sur ces pièces, qui peuvent être des pièces d'identité. Une autre question part au coach (membres du Club, 20 par jour).
- **Notifications** : chaque rappel part par email et/ou WhatsApp selon les préférences du membre (rubrique Compte), entre 8 h et 20 h dans son fuseau. Dans les 24 h qui suivent un message du membre, le texte est envoyé directement ; sinon par le modèle `kpb_notification`.
