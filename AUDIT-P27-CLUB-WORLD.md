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
