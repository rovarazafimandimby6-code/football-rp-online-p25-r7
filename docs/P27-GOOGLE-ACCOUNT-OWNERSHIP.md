# P27 — Profil joueur local, identité Google et synchronisation cloud

## Décision produit fondamentale
**Le compte joueur cloud est facultatif. Jouer ne nécessite ni compte Google, ni adresse e-mail, ni nom d'utilisateur, ni mot de passe.**

P27 distingue deux niveaux :
1. **Profil joueur local** : créé dans le jeu, y compris hors ligne. Il permet de commencer une carrière sans inscription. Il est conservé sur l'appareil et ne peut pas être récupéré après destruction des données locales.
2. **Compte joueur P27 synchronisé** : association facultative du profil existant à un compte Google. Le serveur crée/relie une identité P27 et synchronise automatiquement la carrière. Google sert à identifier le joueur ; aucun mot de passe P27 n'est demandé ou stocké dans l'expérience joueur.

L'association Google est recommandée, jamais obligatoire. Ne jamais présenter le profil local comme sauvegardé dans le cloud.

## Identifiant joueur FRP

- À la création locale du profil, le jeu génère un identifiant lisible au format `FRP-675757` (préfixe `FRP-` suivi de six chiffres).
- Cet identifiant est indépendant du nom affiché, du club et du compte Google.
- Il est conservé dans les données locales et présenté comme identifiant du joueur, pas comme un mot de passe ni un secret d'authentification.
- La génération locale ne peut pas garantir à elle seule l'unicité mondiale. Avant d'exposer cet identifiant comme définitivement réservé sur toute la plateforme, le serveur devra effectuer une réservation atomique dans un registre central ; les collisions devront être rejetées et un nouvel identifiant attribué sans toucher aux données de carrière.
- Une clé locale UUID distincte rend les réservations serveur idempotentes. Le serveur crée aussi un identifiant technique de compte P27 (UUID sans mot de passe) et réserve le numéro FRP dans le registre central ; le client remplace le numéro provisoire par le numéro confirmé. Cet accountId servira de clé propriétaire des stores serveur et de la liaison Google. Le registre est inclus dans les sauvegardes vérifiées. Le registre JSON actuel convient à une instance unique ; une base transactionnelle partagée reste nécessaire avant une architecture multi-instance.

## Parcours sans Google
- Le joueur choisit « Jouer » ou « Créer mon joueur ».
- Il choisit son nom de footballeur et commence immédiatement.
- Aucun formulaire de compte, mot de passe, e-mail ou vérification n'est requis.
- Le profil et la carrière locale sont enregistrés automatiquement sur l'appareil.
- L'interface indique « Synchronisation non activée sur cet appareil ».

## Association facultative plus tard
- Depuis les paramètres ou l'écran carrière, le joueur choisit « Protéger ma carrière avec Google ».
- Le flux Google officiel authentifie le compte ; P27 ne demande jamais le mot de passe Google dans ses propres écrans.
- Le serveur valide le jeton OpenID Connect : signature, issuer, audience, expiration, nonce et protections anti-rejeu.
- Le claim stable sub identifie le compte fournisseur ; l'adresse e-mail n'est jamais la clé de propriété.
- La carrière locale existante est importée/associée au compte P27 après contrôle d'intégrité et confirmation. Une carrière cloud existante ne doit jamais être remplacée silencieusement.
- Après association, la synchronisation cloud démarre automatiquement.

## Réinstallation et changement de téléphone
- Le joueur choisit « Continuer avec Google » et sélectionne le compte associé.
- Le serveur retrouve le compte joueur P27 et renvoie le dernier état confirmé.
- La carrière revient au dernier point effectivement synchronisé.
- Sans association Google préalable, une copie locale détruite par formatage/désinstallation ne peut pas être récupérée.

## Invariants Google et propriété
- Un compte Google actif ne peut être associé qu'à un seul compte joueur P27.
- Un compte joueur P27 n'a qu'un seul compte Google actif à la fois.
- Le joueur peut changer le compte Google lié, y compris pour transmettre volontairement sa carrière.
- Le changement exige une session valide, la réauthentification du Google actuel, l'authentification du nouveau Google et une confirmation explicite.
- Le nouveau Google doit être libre ; aucun écrasement ni fusion de carrière.
- Le transfert change uniquement le propriétaire d'accès, pas l'identifiant joueur ni les données.
- La transaction est atomique ; en cas d'échec, l'ancien lien reste valide.
- Après transfert, les anciennes sessions sont révoquées et le nouvel accès est réémis.
- La récupération après perte de l'ancien Google nécessite une procédure distincte et sécurisée.

## Synchronisation automatique
- Aucun bouton de sauvegarde manuelle : toute progression admissible est synchronisée automatiquement dès qu'Internet est disponible.
- Le serveur est la source de vérité pour la carrière cloud.
- Chaque mutation possède un identifiant d'opération et une version serveur ; le client confirme la synchronisation uniquement après accusé de réception.
- Hors ligne, les modifications restent locales/en attente et sont envoyées dans l'ordre au retour du réseau avec idempotence.
- Le serveur arbitre les conflits ; un ancien appareil ne peut pas écraser une version plus récente.
- Le joueur continue à jouer pendant une panne réseau. L'interface distingue « local », « synchronisation en attente » et « synchronisé ».
- Les sauvegardes serveur sont automatiques et vérifiées ; elles doivent être externalisées sur un stockage durable avant la production.

## Règles d'expérience et de sécurité
- Aucun mot de passe P27 dans le parcours joueur ; les anciens écrans register/login username/password ne sont pas le parcours cible.
- Ne jamais demander le mot de passe Google dans un formulaire P27 : utiliser le flux Google natif.
- Le joueur peut jouer même si Google Play Services ou le réseau ne sont pas disponibles.
- Ne jamais annoncer « sauvegardé dans le cloud » avant confirmation serveur.
- La suppression des données locales peut effacer le profil non associé ; avertissement clair avant une suppression volontaire.
- Les jetons Google/P27 ne sont jamais journalisés.

## Préparation de la configuration Google

Le serveur expose désormais un état non bloquant de configuration Google dans `/readyz`. Les variables attendues sont :
- `GOOGLE_CLIENT_ID` : identifiant OAuth de type Web client Google ;
- `GOOGLE_CLIENT_SECRET` : secret OAuth, conservé uniquement dans l'environnement serveur ;
- `GOOGLE_REDIRECT_URI` : URI de callback HTTPS (HTTP accepté uniquement sur localhost en développement).

Aucune valeur secrète ne doit être commitée dans Git ni renvoyée par `/readyz`. Une configuration complète indique seulement que les paramètres sont présents ; elle ne signifie pas que le flux OIDC est déjà opérationnel. Le module `GoogleOidcTransactionStore` prépare les transactions à usage unique liées à la session du navigateur, avec `state`, `nonce`, PKCE S256, expiration et consommation unique. L'échange du code, la validation cryptographique du jeton Google et le callback ne sont pas encore branchés.

## État technique et limites
Le dépôt contient des comptes serveur historiques avec mot de passe et sessions. Ils ne doivent pas être présentés comme le parcours cible du joueur. Le module LocalPlayerProfile ajoute une fondation de profil local sans mot de passe et génère désormais un identifiant lisible au format FRP- suivi de six chiffres. Cet identifiant est local tant qu'un registre serveur ne l'a pas réservé. L'interface du menu présente maintenant l'état du profil local et une carte de protection Google dans « Mon footballeur », « Profil et synchronisation » et les paramètres. Le bouton Google reste volontairement désactivé tant que le flux OAuth réel n'est pas intégré ; aucun écran de mot de passe n'est proposé dans le parcours visible du compte joueur.

Les stores serveur existent pour profil, progression, carrière, transferts, effectifs et sauvegardes locales périodiques. Cela ne prouve pas une sauvegarde cloud hors site, une authentification Google réelle, ni une synchronisation Android réelle.

Ne pas déclarer la fonctionnalité complète avant :
- intégration complète du profil local au cycle de vie de la carrière et aux sauvegardes de tous les systèmes de jeu ;
- authentification Google OIDC réelle et configuration des identifiants ;
- import/association d'une carrière locale sans perte ;
- synchronisation automatique testée sur deux appareils ;
- stockage serveur durable et sauvegardes externes avec restauration validée ;
- tests Android de réinstallation et de changement de téléphone.
