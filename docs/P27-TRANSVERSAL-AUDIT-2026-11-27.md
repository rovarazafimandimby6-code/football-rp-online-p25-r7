# Audit transversal P27 — 27 novembre 2026

## Périmètre

Audit du code de la branche `p27-dls26-global-adaptation` : navigation et shell, carrière/progression, récompenses, compétitions/résultats, économie/boutiques et persistance. Contrôles réalisés par lecture ciblée du code, vérification des tests existants, ajout de tests de non-régression et CI GitHub.

Cet audit ne vaut pas validation visuelle sur appareil Android. L'APK, le déploiement distant Cloudflare/D1 et la fusion de la PR restent hors périmètre.

## Résultats

### 1. Progression et récompenses — correctif appliqué

Défauts identifiés :
- `PlayerProfileStore.save()` remplaçait l'état en mémoire avant de savoir si l'écriture locale avait réussi.
- `grantMatchRewards()` pouvait annoncer une attribution réussie alors que la sauvegarde avait échoué.
- Le callback de fin de match pouvait inscrire l'identifiant d'un match dans le profil même si l'écriture de la récompense dans la carrière avait échoué.
- Une récompense conservée dans le journal carrière, mais pas encore recopiée dans le profil, n'était pas automatiquement réconciliée au démarrage.

Corrections :
- La sauvegarde du profil est maintenant atomique côté mémoire : le nouvel état n'est adopté qu'après écriture réussie.
- Les opérations d'entraînement et de pratique renvoient explicitement `persistence-failed` si l'écriture échoue.
- Le profil ne reçoit une récompense que si le journal carrière l'a d'abord persistée.
- Les récompenses carrière absentes du registre du profil sont réconciliées au démarrage, avec idempotence par identifiant de match.

Tests ajoutés : panne de stockage, absence de faux crédit, reprise après panne, absence de double crédit et refus d'un reward dont l'enregistrement carrière a échoué.

### 2. Compétitions, classements et archives — contrôles satisfaisants

Les règles et audits présents vérifient :
- 156 clubs répartis dans cinq divisions et neuf groupes ;
- calendriers de ligue et intégrité des rencontres ;
- 1 892 rencontres de ligue dans le calendrier de référence ;
- tableaux, participants, résultats et trophées cohérents ;
- promotions/relégations conformes à l'aperçu approuvé ;
- transition atomique de saison et conservation des archives.

Les tests de renouvellement couvrent trois transitions de saison, les capacités des groupes, les archives et le rollback après panne de persistance.

### 3. Résultats et historique — contrôles satisfaisants

Le dépôt des résultats :
- accepte uniquement les rapports terminés (`fulltime`) ;
- valide les scores et horodatages ;
- remplace un résultat du même salon au lieu d'en créer un doublon ;
- écrit par fichier temporaire puis renommage atomique ;
- borne les archives et la pagination.

### 4. Économie et boutiques — contrôles satisfaisants

Les transactions d'achat et de revente s'appuient sur des journaux persistants et des identifiants idempotents. Les reprises après interruption ne doivent pas débiter ou créditer deux fois.

Règles de revente vérifiées dans le catalogue :
- joueur standard : 50 % ;
- joueur rare : 55 % ;
- joueur premium : 60 % ;
- cosmétique de club : 50 % ;
- extensions de capacité du stade : non revendables.

Les tests couvrent notamment les reprises après interruption, les achats, les reventes, les permissions du propriétaire et les promotions calculées côté serveur.

### 5. Interface et navigation — cohérence source vérifiée

Le shell et le hub présents dans la branche correspondent à la structure retenue :
- en-tête paysage compact de 25 px ;
- accès Paramètres, progression/niveau et pièces ;
- retour contextuel uniquement dans les sous-écrans ;
- hub en grille de trois colonnes et trois rangées ;
- carrière et match amical prioritaires ;
- accès secondaires vers Mon joueur, Compétitions, Mercato, Classements, Club RP et Résultats ;
- pas de barre de navigation persistante en bas.

La lecture du code ne remplace pas un contrôle tactile et visuel sur le téléphone.

## Validation automatisée

CI GitHub du commit `a86cef8a847a4fb4cd5f79c1e859abad1b508456` :
- 1 213 tests réussis ;
- 0 échec ;
- build web réussi ;
- migrations D1 appliquées sur l'émulateur local ;
- syntaxe du Worker Cloudflare et du dépôt carrière D1 vérifiée.

Exécution : https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/46021316370

## Limites restantes

- Contrôle visuel/tactile Android non réalisé : APK volontairement en pause.
- Déploiement distant et migration de production D1 non réalisés.
- La négociation du Mercato entre clubs reste une simulation locale du prototype.
- La validation automatisée ne garantit pas encore la qualité perçue des visuels ni les performances sur le ZTE Blade A33+.

La PR #7 reste ouverte en brouillon. Aucun merge n'a été effectué.


### 6. Compte, synchronisation et backend Cloudflare — migration incomplète

Contrôles satisfaisants côté client :
- sessions Bearer et reprise de session par cookie ;
- file locale persistante avec identifiants d'opération et accusés de réception serveur ;
- refus de synchroniser lorsque l'identité locale ne correspond pas au compte connecté ;
- écritures D1 du profil avec contrôle de révision pour éviter les mises à jour concurrentes ;
- aperçu et confirmation explicite avant restauration d'un snapshot de compte.

Blocage relevé :
- le Worker Cloudflare n'expose qu'une partie des routes présentes dans le serveur Node P27 ;
- plusieurs parcours complets ne sont pas encore migrés, notamment l'inscription/connexion classique, les salons, les compétitions, les contrats/transferts, les résultats et les Clubs RP ;
- les routes non migrées aboutissent à la réponse `501 CLOUDFLARE_API_NOT_MIGRATED`.

Conséquence : le serveur Node et les tests locaux ne prouvent pas que l'ensemble du jeu peut fonctionner derrière le Worker Cloudflare. Le déploiement distant doit rester bloqué jusqu'à migration et tests d'intégration de toutes les routes nécessaires. Aucun déploiement n'a été tenté dans cet audit.
