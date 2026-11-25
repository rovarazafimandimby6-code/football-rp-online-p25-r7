# P27 — Identité Google, propriété du compte joueur et synchronisation

## Décision produit

Le joueur ne gère aucune sauvegarde manuelle. Il associe son compte joueur P27 à un compte Google ; les changements persistants sont synchronisés automatiquement dès qu'une connexion est disponible.

**Invariant : un compte Google actif = un compte joueur P27 ; un compte joueur P27 = un seul compte Google actif à la fois.**

Le compte joueur interne P27 est l'identité durable. Google est le moyen d'authentification et de récupération, pas la base de données de carrière.

## Connexion et première création

1. Le client lance le flux Google officiel.
2. Le serveur vérifie le jeton OpenID Connect : signature, issuer, audience autorisée, expiration, nonce et protections anti-rejeu.
3. Le serveur utilise le claim stable 'sub' comme identifiant fournisseur. L'adresse e-mail sert uniquement à l'affichage ou à l'information ; elle n'est jamais la clé de propriété.
4. Si (provider=google, subject=sub) est déjà associé, le serveur ouvre le compte joueur existant et restitue son état synchronisé.
5. Si aucun lien n'existe, le serveur propose une création de compte joueur. Une association unique est créée ; les doubles créations concurrentes sont bloquées par une contrainte d'unicité en base.

Ne jamais accepter un identifiant Google, un e-mail ou un profil transmis par le client comme preuve d'authentification.

## Changement de compte Google et transmission volontaire

Le joueur peut remplacer son compte Google, y compris pour donner/transmettre sa carrière à une autre personne.

Préconditions :
- session P27 valide et réauthentification récente de l'identité Google actuellement liée ;
- authentification réussie du nouveau compte Google ;
- confirmation explicite du transfert et avertissement que l'ancien compte Google perdra l'accès à cette carrière ;
- le nouveau compte Google n'est lié à aucun autre compte joueur.

Transaction atomique :
1. verrouiller le compte joueur et les deux identités Google concernées ;
2. vérifier une dernière fois l'unicité de l'identité destinataire ;
3. remplacer l'association actuelle par la nouvelle association dans une transaction unique ;
4. enregistrer un événement d'audit sans conserver de jeton Google ;
5. révoquer toutes les sessions P27 existantes liées au compte joueur ;
6. émettre une nouvelle session après transfert pour le nouveau propriétaire.

Si la transaction échoue, l'ancienne association et toutes les données restent intactes. Les appels répétés avec la même clé d'idempotence ne doivent pas effectuer deux transferts.

L'ancien compte Google est libéré et ne peut plus ouvrir cette carrière. Le transfert ne copie, ne réinitialise et ne fusionne aucune donnée : il change uniquement l'identité Google autorisée à accéder au même identifiant joueur P27.

## Unicité et prévention des conflits

- Contrainte unique en base sur (provider, subject).
- Contrainte unique sur l'identité Google active de chaque compte joueur.
- Les opérations de création et de transfert doivent être transactionnelles, y compris lorsque deux téléphones font la demande simultanément.
- Un Google déjà lié à un autre joueur reçoit une erreur contrôlée ; aucune fusion automatique de carrières.
- Une nouvelle connexion Google déjà liée restaure le joueur existant ; elle ne crée jamais silencieusement une seconde carrière.
- Les sessions sont indépendantes de l'adresse e-mail et peuvent être révoquées par compte joueur.

## Synchronisation automatique

Le serveur est la source de vérité pour la carrière, le profil, les attributs, la progression, les contrats, le club, les transferts, les statistiques, les récompenses et l'historique.

- Chaque mutation reçoit un identifiant d'opération unique et une version serveur.
- Le client n'affiche « synchronisé » qu'après accusé de réception serveur.
- En réseau absent, les opérations admissibles sont conservées dans une file locale chiffrée et marquées « en attente » ; elles ne sont pas présentées comme sauvegardées dans le cloud.
- Au retour du réseau, la file est rejouée dans l'ordre avec idempotence.
- Le serveur valide les règles métier et arbitre les conflits ; un ancien appareil ne peut pas écraser une version serveur plus récente par un envoi aveugle.
- Les opérations critiques (résultat de match, progression, contrats, transferts) doivent être persistées côté serveur dans le même flux transactionnel que leur confirmation.
- Une restauration sur nouvel appareil télécharge le dernier état confirmé du serveur.

## Sécurité et récupération

- Ne jamais journaliser les jetons d'accès Google, les jetons P27 ou les secrets.
- Révoquer toutes les sessions après changement de propriétaire ; notifier l'ancien compte si un canal de notification vérifié est disponible.
- Prévoir un délai/contrôle renforcé pour les changements sensibles, sans bloquer le transfert volontaire légitime.
- La perte d'accès à l'ancien Google suit une procédure de récupération distincte, avec preuves et contrôle anti-usurpation. La connaissance du pseudo, de l'e-mail ou d'informations publiques ne suffit pas.
- Conserver un journal d'audit minimal : identifiant interne, date, type d'opération, résultat, identifiants d'événement ; jamais les jetons.
- Les sauvegardes serveur doivent être chiffrées, vérifiées et stockées hors du volume principal ; restaurations périodiquement testées.

## Critères d'acceptation

1. Un compte Google crée ou retrouve exactement un compte joueur P27.
2. Deux créations simultanées avec le même Google ne créent pas deux carrières.
3. Un Google lié à un joueur ne peut pas se connecter à un autre joueur.
4. Le changement Google conserve strictement le même identifiant P27 et toutes ses données.
5. Après transfert, l'ancien Google et les anciennes sessions ne peuvent plus accéder au joueur.
6. Une erreur au milieu du transfert laisse l'ancien lien valide et aucune donnée perdue.
7. Deux appareils connectés voient la dernière version confirmée ; un appareil ancien ne peut pas écraser une version plus récente.
8. Une opération hors ligne est indiquée en attente et n'est considérée synchronisée qu'après confirmation serveur.
9. Après formatage/réinstallation, la connexion au Google lié restaure le dernier état serveur confirmé.
10. Les tests couvrent serveur redémarré, double requête, concurrence, jeton Google invalide/expiré, audience incorrecte, rejeu, révocation, sauvegarde et restauration.

## État actuel et limites

Le dépôt possède déjà des comptes locaux P27 avec mot de passe, sessions serveur, profils/progression/carrières persistants et sauvegardes automatiques locales de plusieurs stores. Un test multi-appareils simule deux connexions au même compte local.

Cela ne prouve pas encore :
- une authentification Google OAuth/OIDC réelle ;
- une liaison Google unique ou un transfert de propriété ;
- une synchronisation Android en conditions réelles ;
- une sauvegarde hors site sur stockage durable ;
- une restauration complète testée des six stores ;
- la récupération après perte du compte Google.

Ne pas présenter le système Google comme implémenté ou prêt avant ces validations. Les identifiants OAuth, les URI de redirection, le fournisseur d'hébergement et son stockage durable doivent être configurés avant la recette réelle.
