# Audit P27 — Monde des 156 clubs et divisions

Date de vérification : 24 novembre 2026  
Branche : `p27-dev`  
Commit code audité : `9a4790148f5480e5b21669ff37d349bd49367d60`  
Workflow de référence : [GitHub Actions 45404323312](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45404323312)

## Résultat de l'audit

Le catalogue serveur contient 156 clubs fictifs, répartis exactement selon la pyramide P27 :

| Division | Nom | Clubs | Conférences |
|---|---|---:|---|
| D1 | Premier League | 16 | Nationale |
| D2 | Ligue 2 | 20 | Nationale |
| D3 | National League | 24 | Nationale |
| D4 | Challenger League | 32 | Nord 16, Sud 16 |
| D5 | Regional League | 64 | Nord 16, Sud 16, Est 16, Ouest 16 |
| **Total** | | **156** | **9 groupes de championnat** |

Les 140 clubs d'expansion complètent les 16 clubs fondateurs. Les identifiants et noms sont uniques. Chaque club possède une localisation canonique, un stade, une identité chromatique, un motif de maillot, une note sportive et un budget. Les profils runtime, le recrutement et le lore sont contrôlés séparément.

## Contrôles automatisés

- Identité : identifiants, noms et stades dupliqués.
- Localisation : ville, pays et code pays canonique.
- Divisions : effectifs exacts et notes dans les fourchettes prévues.
- Conférences : affectation explicite prioritaire ; géographie vérifiée sans affectation explicite pour les clubs D4/D5.
- Identité visuelle : trois couleurs hexadécimales distinctes et motif reconnu.
- Effectifs : capacité maximale de 12, minimum initial de 8, maximum de 7 joueurs humains, types de joueurs et numéros de maillot uniques.
- Gouvernance : politique d'admission valide, clubs réservés au système et profils de recrutement cohérents.
- Profils : caractéristiques, stratégie, recrutement et lore ; aucune rivalité automatique.

Les calendriers sont adaptés au niveau : D1 (16 clubs), D2 (20) et D3 (24) jouent en aller-retour ; D4 (deux conférences de 16) et D5 (quatre conférences de 16) jouent en aller simple. Cela représente 1 172 rencontres en D1-D3 et 720 en D4-D5, soit 1 892 rencontres de championnat. Les audits vérifient les deux manches inversées en D1-D3, chaque adversaire rencontré une fois en D4-D5, les journées sans doublon et l'équilibre domicile/extérieur. La Coupe des Clubs reste indépendante : élimination directe, 156 participants et 155 rencontres. Le tableau est structuré en 8 tours : 28 barrages préliminaires pour 56 clubs, 100 exemptions au premier tour principal, puis 64, 32, 16, 8, 4, 2 et 1 rencontre. Un audit dédié vérifie l'unicité des 156 entrants, les 155 rencontres, les 8 tours, les participants de chaque match et la cohérence des états de résultat/rejouabilité. Le parcours complet jusqu'au trophée est vérifié par une simulation automatisée des 155 rencontres, avec contrôle du champion et de l'attribution du trophée. Un test séparé couvre les matchs nuls et les reprises sans progression prématurée.

## API publique du catalogue

- `GET /api/league-structure` : divisions, conférences, effectifs courants et indicateur `complete`.
- `GET /api/clubs` : catalogue paginé ; filtres `division`, `conference`, recherche `q`, pagination `limit` et `offset`.
- `GET /api/clubs/:id` : fiche publique d'un club.

Les réponses publiques ne contiennent ni effectifs détaillés, ni contrats privés. Les listes et fiches lisent les affectations de la saison active ; les changements de division sont donc reflétés après une transition de saison. Les équipes de match reprennent également la division et la conférence courantes.

Le catalogue public expose également `managementType` (`human` ou `system`) sans exposer l'identifiant du gestionnaire. L'interface applique les marqueurs discrets approuvés : point vert pour un club dirigé par un joueur, point rouge pour un club dirigé par le système. Le statut d'admission des joueurs reste une information distincte de la direction du club.

## Intégration dans l'interface du jeu

- L'écran **Clubs** charge les 156 fiches publiques en deux pages, contrôle l'unicité et la complétude, puis affiche les cinq divisions et les conférences.
- Recherche, filtres par division, conférence et pays, ainsi que tri des clubs.
- Les fiches conservent l'accès à l'effectif local sans publier les contrats privés.
- Si le serveur est indisponible, l'écran conserve le catalogue local et signale clairement que les affectations peuvent être anciennes.
- L'écran **Compétitions** charge les neuf groupes, classements, calendriers, résultats terminés et aperçu de la Coupe des Clubs depuis `GET /api/competitions`.
- Le rendu des mouvements de fin de saison est étiqueté comme proposition non approuvée.
- L'API de snapshot expose `cupAudit`, qui contrôle le tableau de Coupe à chaque lecture des compétitions.
- Les libellés visibles utilisent « Joueur du système » et « Club dirigé par le système » ; l'abréviation « IA » a été retirée de l'interface principale.

## Validation CI

- **531 tests réussis**
- **0 échec**
- Contrôle de syntaxe JavaScript exécuté avec succès
- Le workflow CI du commit audité est vert : [45404323312](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45404323312)

## Décisions qui restent à approuver

Ces éléments ne sont pas verrouillés par cet audit :

1. Le barème de promotions/relégations demeure une proposition de politique. L'aperçu calcule les mouvements et la transition valide les capacités, mais le barème n'est pas déclaré définitivement approuvé.
2. Une vérification visuelle et fonctionnelle sur appareil Android réel reste à effectuer.

## Conclusion

Le **catalogue de 156 clubs, la structure des cinq divisions, les neuf groupes, l'affectation géographique, les calendriers, les contrôles d'intégrité, l'API publique et les écrans Clubs/Compétitions** sont intégrés et validés automatiquement sur `p27-dev`.

Cet audit certifie le périmètre données/serveur décrit ci-dessus. Il ne certifie pas l'ensemble du jeu P27, l'expérience graphique mobile, les performances Android ni les décisions sportives qui restent à approuver.
