# Audit P27 — Monde des 156 clubs et divisions

Date de vérification : 24 novembre 2026  
Branche : `p27-dev`  
Commit audité : `aadf115011a8219461bd290f27294346db065c3c`  
Workflow de référence : [GitHub Actions 45416868837](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45416868837)

## Résultat de l'audit

Le catalogue serveur contient 156 clubs fictifs, répartis exactement selon la pyramide P27 :

| Division | Nom | Clubs | Conférences |
|---|---|---:|---|
| D1 | Premier League | 16 | Nationale |
| D2 | Ligue 2 | 20 | Nationale |
| D3 | National League | 24 | Nationale |
| D4 | Challenger League | 32 | A 16, B 16 |
| D5 | Regional League | 64 | A 16, B 16, C 16, D 16 |
| **Total** | | **156** | **9 groupes de championnat** |

Les 140 clubs d'expansion complètent les 16 clubs fondateurs. Les identifiants et noms sont uniques. Chaque club possède une localisation canonique, un stade, une identité chromatique, un motif de maillot, une note sportive et un budget. Les profils runtime, le recrutement et le lore sont contrôlés séparément.

## Contrôles automatisés

- Identité : identifiants, noms et stades dupliqués.
- Localisation : ville, pays et code pays canonique.
- Divisions : effectifs exacts et notes dans les fourchettes prévues.
- Conférences : affectation explicite obligatoire ; les villes restent descriptives et ne déterminent jamais le groupe. Aucune latitude, longitude ou déduction géographique n'est utilisée.
- Identité visuelle : trois couleurs hexadécimales distinctes et motif reconnu.
- Effectifs : capacité maximale de 12, minimum initial de 8, maximum de 7 joueurs humains, types de joueurs et numéros de maillot uniques.
- Gouvernance : politique d'admission valide, clubs réservés au système et profils de recrutement cohérents.
- Profils : caractéristiques, stratégie, recrutement et lore ; aucune rivalité automatique.

Les calendriers sont adaptés au niveau : D1 (16 clubs), D2 (20) et D3 (24) jouent en aller-retour ; D4 (conférences A et B de 16) et D5 (conférences A, B, C et D de 16) jouent en aller simple. Cela représente 1 172 rencontres en D1-D3 et 720 en D4-D5, soit 1 892 rencontres de championnat. Les audits vérifient les deux manches inversées en D1-D3, chaque adversaire rencontré une fois en D4-D5, les journées sans doublon et l'équilibre domicile/extérieur. La Coupe des Clubs reste indépendante : élimination directe, 156 participants et 155 rencontres. Le tableau est structuré en 8 tours : 28 barrages préliminaires pour 56 clubs, 100 exemptions au premier tour principal, puis 64, 32, 16, 8, 4, 2 et 1 rencontre. Un audit dédié vérifie l'unicité des 156 entrants, les 155 rencontres, les 8 tours, les participants de chaque match et la cohérence des états de résultat/rejouabilité. Le parcours complet jusqu'au trophée est vérifié par une simulation automatisée des 155 rencontres, avec contrôle du champion et de l'attribution du trophée. Un test séparé couvre les matchs nuls et les reprises sans progression prématurée.

## API publique du catalogue

- `GET /api/league-structure` : divisions, conférences, effectifs courants et indicateur `complete`.
- `GET /api/clubs` : catalogue paginé ; filtres `division`, `conference`, recherche `q`, pagination `limit` et `offset`.
- `GET /api/clubs/:id` : fiche publique d'un club.

Les réponses publiques ne contiennent ni effectifs détaillés, ni contrats privés. Les listes et fiches lisent les affectations explicites de la saison active ; les changements de division et de conférence sont reflétés après une transition de saison. Les villes et pays restent des données descriptives.

Le catalogue public expose également `managementType` (`human` ou `system`) sans exposer l'identifiant du gestionnaire. L'interface applique les marqueurs discrets approuvés : point vert pour un club dirigé par un joueur, point rouge pour un club dirigé par le système. Le statut d'admission des joueurs reste une information distincte de la direction du club.

## Intégration dans l'interface du jeu

- L'écran **Clubs** charge les 156 fiches publiques en deux pages, contrôle l'unicité et la complétude, puis affiche les cinq divisions et les conférences.
- Recherche, filtres par division, conférence et pays, ainsi que tri des clubs.
- Les fiches conservent l'accès à l'effectif local sans publier les contrats privés.
- Si le serveur est indisponible, l'écran conserve le catalogue local et signale clairement que les affectations peuvent être anciennes.
- L'écran **Compétitions** charge les neuf groupes, classements, calendriers, résultats, huit tableaux de barrages de promotion et aperçu de la Coupe des Clubs depuis `GET /api/competitions`.
- L'écran présente les demi-finales, finales, scores, reprises après nul, qualifiés et mouvements validés.
- L'API de snapshot expose `cupAudit`, qui contrôle le tableau de Coupe à chaque lecture des compétitions.
- Les libellés visibles utilisent « Joueur du système » et « Club dirigé par le système » ; l'abréviation « IA » a été retirée de l'interface principale.

## Barème approuvé de fin de saison

Le barème P27 est désormais intégré et déclaré approuvé. Il conserve les capacités fixes des divisions et produit exactement 20 promotions et 20 relégations (40 mouvements de clubs) :

| Division de départ | Promotions | Relégations |
|---|---:|---:|
| D1 | 0 | 4 |
| D2 | 4 | 4 |
| D3 | 4 | 4 |
| D4 | 4 (2 par conférence) | 8 (4 par conférence) |
| D5 | 8 (2 par conférence) | 0 |

- D2 et D3 : trois promotions directes, puis un barrage entre les places 4 à 7 (4e contre 7e, 5e contre 6e, puis finale).
- D4 A et B : une montée directe par conférence, puis un barrage entre les places 2 à 5 pour la seconde montée.
- D5 A, B, C et D : une montée directe par conférence, puis un barrage entre les places 2 à 5 pour la seconde montée.
- Les relégations sont directes.
- Un match nul en barrage impose une reprise ; aucun club n'est promu avant d'avoir gagné la finale.
- D5 A et B alimentent D4 A ; D5 C et D alimentent D4 B.
- Les quatre relégués de D3 sont répartis à raison de deux vers D4 A et deux vers D4 B.
- Les quatre relégués de chaque groupe D4 sont répartis deux par deux vers les deux groupes D5 correspondants : A vers A/B et B vers C/D.

Le moteur conserve les résultats et archives des barrages, vérifie les listes de mouvements par rapport à l'aperçu approuvé, refuse les transitions prématurées et contrôle les capacités des neuf groupes. Un test automatise trois renouvellements consécutifs, avec rechargement du stockage et contrôle des 156 identifiants, des divisions, des conférences, des calendriers et de la Coupe.


## Administration sécurisée du renouvellement de saison

- Le renouvellement serveur est exposé par `POST /api/admin/competitions/season/finalize`.
- L'accès exige `Authorization: Bearer <P27_ADMIN_TOKEN>`. Le secret doit contenir au moins 32 octets ; sa comparaison utilise `timingSafeEqual`.
- Si le secret n'est pas configuré ou trop court, l'endpoint répond `503 ADMIN_TOKEN_NOT_CONFIGURED`. Un jeton incorrect reçoit `401 ADMIN_UNAUTHORIZED`.
- Le client ne fournit jamais le barème des mouvements : le serveur calcule lui-même l'aperçu approuvé, puis transmet ces mouvements à `finalizeSeason`. Les saisons incomplètes ou les barrages non terminés sont refusés.
- Configurer `P27_ADMIN_TOKEN` uniquement dans les variables d'environnement du serveur d'hébergement. Ne jamais le committer, le placer dans le code client ou l'exposer dans une réponse API.
- Exemple de corps JSON : `{"nextSeasonId":"2027-28"}`.

Le circuit de fin de match officiel a également été durci : un résultat de salle n'est désormais marqué comme finalisé qu'après acceptation du résultat dans le moteur de compétition et persistance de l'archive du match. Si l'une de ces écritures échoue temporairement, la salle conserve l'état `fulltime` sans résultat finalisé ; les ticks suivants retentent l'opération, y compris après une déconnexion des joueurs. La répétition d'une écriture de compétition utilise l'idempotence du même identifiant de salle et ne double pas le classement. Un test couvre l'échec du moteur, l'échec de l'archive, puis la réussite sans double comptabilisation.

## Validation CI

- **545 tests réussis, 0 échec** sur le commit `aadf115011a8219461bd290f27294346db065c3c`.
- Contrôle syntaxique JavaScript réussi sur tous les fichiers `src`, `server` et `tests`.
- Workflow GitHub Actions terminé avec succès : [P27 validation — run 45416868837](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45416868837).
- Le test de reprise vérifie maintenant aussi qu'une salle en attente de sauvegarde n'est pas supprimée par le délai d'expiration normal, même si tous ses joueurs sont déconnectés.

## Vérification restante

Une vérification visuelle et fonctionnelle sur appareil Android réel reste à effectuer.

## Conclusion

Le **catalogue de 156 clubs, la structure des cinq divisions, les neuf groupes, les affectations explicites A/B/C/D, les calendriers, les contrôles d'intégrité, l'API publique et les écrans Clubs/Compétitions** sont intégrés et validés automatiquement sur `p27-dev`.

Cet audit certifie le périmètre données/serveur décrit ci-dessus. Il ne certifie pas l'ensemble du jeu P27, l'expérience graphique mobile, les performances Android ni les décisions sportives qui restent à approuver.


## Correctif de cohérence des adhésions Club RP — 26/11/2026

- L'acceptation d'une demande d'adhésion supprime désormais toute invitation encore en attente pour le même compte dans ce Club RP.
- L'acceptation d'une invitation supprime désormais toute demande d'adhésion encore en attente pour le même compte dans ce Club RP.
- Cela évite qu'un membre déjà intégré reste affiché dans les files de recrutement avec une demande ou une invitation devenue obsolète.
- Les tests unitaires couvrent les deux chemins d'entrée concurrents (demande puis invitation, invitation puis demande).
- Les modifications et tests ont été enregistrés sur `p27-dls26-global-adaptation`. L'exécution de la suite reste à confirmer par CI ; aucune réussite de test n'est revendiquée ici.


## Cohérence globale du recrutement Club RP — 26/11/2026

- Lorsqu'un joueur accepte une demande d'adhésion, toutes ses autres demandes et invitations en attente sont supprimées dans les autres Club RP.
- Lorsqu'un joueur accepte une invitation, le même nettoyage global est appliqué.
- Cette règle découle de l'unicité d'appartenance : un compte ne peut être membre que d'un seul Club RP à la fois.
- Un test couvre les deux chemins d'entrée, avec plusieurs clubs, puis recharge le stockage pour vérifier que l'appartenance et le nettoyage persistent.
- Le code et le test sont enregistrés sur `p27-dls26-global-adaptation`. L'exécution CI reste à confirmer ; aucune réussite de test n'est revendiquée.


## Révocation des accès après exclusion ou départ — 26/11/2026

- Contrôle renforcé par tests : après exclusion par le président ou départ volontaire, le compte ne doit plus accéder aux données réservées aux membres (getMemberAccounts) ni publier dans le chat du Club RP.
- Les contrôles serveur s'appuient sur l'appartenance actuelle, et non sur l'ancien statut du compte.
- Le test vérifie également que la révocation reste effective après rechargement du stockage.
- Cette vérification concerne les accès Club RP côté serveur. Elle ne force pas l'interruption d'un match de défi déjà engagé : une admission validée au démarrage du match reste distincte de l'appartenance communautaire pendant le match.
- Test ajouté sur p27-dls26-global-adaptation. Résultat d'exécution à confirmer par CI ; aucune réussite n'est revendiquée.


## Contrôle d'appartenance en temps réel dans les salles de défi — 26/11/2026

- Ajout d'un test sur la liste de participants enregistrée au moment de l'acceptation du défi.
- Une ancienne invitation à jouer ne suffit pas : l'admission doit également correspondre à l'appartenance Club RP actuelle.
- Le test couvre le départ du club, le changement vers un autre club, le maintien d'un membre valide et le retour dans le bon club.
- Le contrôle est effectué au moment de la demande d'entrée dans la salle. Les joueurs déjà admis peuvent terminer le match en cours ; cette règle évite de perturber une rencontre engagée.
- Test ajouté sur p27-dls26-global-adaptation. Son exécution reste à confirmer par CI.


## Audit des jetons de contrôle des salons — 26/11/2026

- Les jetons de contrôle sont générés avec 24 octets aléatoires et sont exigés pour les commandes de match, la rotation, la reconnexion, le heartbeat et la sortie du salon.
- Les réponses publiques (état complet, delta et liste des salons) doivent exclure les jetons, identifiants de compte, identifiants de carrière privés et données internes de contrôle.
- Les checkpoints privés conservent les jetons afin de restaurer la session du même joueur après un redémarrage. Le stockage est écrit avec les permissions de fichier `0600`.
- Les nouveaux tests couvrent l'absence de secrets dans les vues publiques, le refus d'un jeton invalide sur les opérations de contrôle et la reconnexion valide du même avatar sans doublon.
- Ce commit ajoute des tests de sécurité ; il ne modifie ni le moteur de match, ni le HUD, ni les commandes tactiles. L'exécution de la suite reste à confirmer par CI.


## Audit HTTP et correction du heartbeat — 26/11/2026

- Le parcours HTTP des salons est désormais couvert : création, entrée, état public, commande avec jeton valide/invalide, sortie puis reconnexion.
- Les réponses contenant le jeton de contrôle sont vérifiées avec `Cache-Control: no-store`; l'état public ne doit pas révéler les jetons ni les identifiants de compte ou données internes de commande.
- Défaut corrigé dans `RoomManager.heartbeat` : auparavant, chaque heartbeat appelait `reconnect`, ce qui remettait les commandes de déplacement à zéro même pour un joueur déjà connecté.
- Désormais, une session humaine active actualise sa présence sans modifier son input. Une session réellement passée sous contrôle IA emprunte toujours le chemin de reconnexion et reprend le même avatar.
- Tests ajoutés pour les deux comportements. Aucun changement au moteur de simulation, au HUD ou aux commandes tactiles.
- La suite de tests doit encore être exécutée ; aucun résultat CI n'est disponible au moment de cet audit.

## Nettoyage des salons après déconnexion — 26/11/2026

- Correction d'un cas limite dans l'expiration des salons inactifs : l'horodatage zéro est une valeur valide et ne doit pas être interprété comme une absence de déconnexion.
- Le délai de grâce compare désormais explicitement un horodatage fini avec l'heure courante.
- Un test de régression couvre un salon inactif dont le joueur s'est déconnecté à l'instant zéro.
- La restauration après redémarrage, la reprise du même avatar et la durée restante de mi-temps restent inchangées.
- Aucun changement au moteur de simulation, au HUD ou aux commandes tactiles. L'exécution de la suite reste à confirmer par CI.

## Reprise de la finalisation après coup de sifflet — 26/11/2026

- Un résultat non encore archivé peut désormais conserver un checkpoint `fulltime` dans le stockage privé des salons.
- Si l'enregistrement d'une carrière, de la progression ou de l'archive échoue pendant la finalisation, le serveur conserve le match terminé au lieu de ne garder que l'ancien checkpoint `playing`.
- Au redémarrage, le salon `fulltime` est restauré et la finalisation est retentée. Les écritures carrière/progression sont protégées par leurs identifiants de match traités, et le résultat est archivé avant la suppression du checkpoint.
- Un marqueur empêche de réécrire le même checkpoint à chaque tick pendant une panne de stockage.
- Un test de récupération simule une panne pendant la récompense, redémarre les stores et vérifie l'archivage du score et la progression.
- Aucun changement au moteur de simulation, au HUD ou aux commandes tactiles. Résultats CI et APK non vérifiés.

## Cohérence résultat officiel / classement / carrière / récompenses — 26/11/2026

- Ajout d'un test d'intégration qui interrompt volontairement la finalisation après l'écriture du classement et de la carrière, au moment de la sauvegarde de la récompense.
- Le test redémarre ensuite les quatre stores et le gestionnaire de salons, puis vérifie la reprise du même résultat officiel.
- Il contrôle qu'une seule rencontre est comptabilisée dans le classement, qu'une seule ligne de carrière et ses statistiques sont conservées, qu'une seule récompense est créditée et que le checkpoint du salon est supprimé après archivage.
- Cette couverture s'appuie sur les identifiants de match déjà utilisés pour rendre les écritures carrière et progression idempotentes, ainsi que sur l'identifiant de salon du résultat de compétition.
- Le test a été ajouté mais n'a pas encore été exécuté par une CI disponible. Aucun APK généré.
- Cas cloud « écriture D1 réussie, accusé de réception perdu » : test ajouté. Il simule le commit distant, une coupure réseau avant l'accusé, le redémarrage du serveur P27 et la nouvelle livraison après délai. Le Worker répond ensuite `accepted: true` avec `duplicate: true`; la file locale est acquittée et la ligne distante, la carrière locale et les totaux restent uniques.
- Cette vérification couvre le comportement de livraison au moins une fois (at-least-once) avec déduplication distante par identifiant de match. Elle ne remplace pas une exécution réelle contre un déploiement Cloudflare/D1.

## Progression cloud et protection contre les anciennes sauvegardes — 26/11/2026

- La progression D1 n'accepte pas de remplacement global envoyé par un client : l'API expose la lecture authentifiée et des commandes métier (entraînement/pratique), tandis que les récompenses de match restent réservées à l'autorité de match signée.
- Les mutations utilisent un compare-and-swap SQL sur `revision`; une commande concurrente qui lit une ancienne révision ne peut pas écraser la valeur récente et recommence sur l'état courant.
- Ajout d'un test concurrent exécutant trois pratiques simultanées : les trois commandes sont conservées, les pièces et attributs sont cohérents, et la révision progresse de façon attendue.
- Ajout d'un test HTTP qui tente de restaurer une ancienne progression complète avec une valeur artificiellement élevée : le Worker répond 400 (`INVALID_PROGRESSION_ACTION`) et n'écrit aucune ligne.
- Vérification statique des fichiers et présence des tests sur GitHub effectuées. Pas d'exécution locale ni de CI disponible dans ce contrôle; aucun test de déploiement Cloudflare/D1 et aucun APK généré.


## Profil cloud complet et audit de récupération inter-appareils — 26/11/2026

- Correction du schéma D1 du profil : le pied préféré accepte désormais `left`, `right` et `both`, conformément au profil local P27.
- Les formes de visage (`faceShape`) et des yeux (`eyeShape`) sont désormais normalisées et conservées dans le profil cloud. Les valeurs inconnues retombent sur les valeurs par défaut sûres.
- Le client de synchronisation et la validation du snapshot de récupération transmettent et contrôlent ces trois paramètres au lieu de les supprimer ou de refuser un profil ambidextre.
- Tests ajoutés/renforcés dans `tests/cloudflare-player-profile-repository.test.mjs` et `tests/p27-online-account-profile.test.mjs` pour la normalisation D1, l'upload et la prévisualisation de récupération.
- **Blocage de récupération identifié :** `OnlineAccountClient.getAccountSnapshot()` appelle `GET /api/account/snapshot`, mais aucune route correspondante n'existe actuellement dans `src/cloudflare/worker.js`. Les tests client simulent cette réponse ; ils ne prouvent donc pas que le Worker la fournit. La restauration complète inter-appareils n'est pas encore opérationnelle de bout en bout.
- Le Worker possède actuellement des sources cloud distinctes pour le profil, la progression et la carrière. Les sections `seasonStats` et `contract` requises par le plan de récupération ne disposent pas encore d'une source serveur agrégée vérifiée. Il ne faut pas fabriquer un snapshot complet à partir de valeurs locales ou par défaut.
- Les commits ajoutent la correction et les tests, mais aucun workflow CI n'a été observé pour le dernier commit lors du contrôle. Les tests n'ont pas été exécutés ici ; aucun déploiement Cloudflare ni APK n'est revendiqué.
