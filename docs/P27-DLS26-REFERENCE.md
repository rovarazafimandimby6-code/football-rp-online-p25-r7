# P27 — Référentiel statistique DLS 26

## Décision de conception

Les joueurs fictifs générés par P27 prennent comme base des cartes **normales DLS 26 vérifiées individuellement**, version v13.430 (16 septembre 2026). Le générateur sélectionne un profil selon le rôle et l'archétype, puis ajuste ses caractéristiques au niveau de la division P27.

## Catalogue vérifié embarqué

Le premier catalogue contrôlé contient **21 fiches individuelles** :
- 7 profils d'attaquants : avant-centre rapide, puissant, complet, ailier, finisseur et joueur de pivot
- 5 profils de milieux : organisateur, créateur, récupérateur, relayeur box-to-box et meneur de jeu
- 6 profils de défenseurs : latéral offensif, piston gauche, défenseur central physique, central plus mobile, latéral polyvalent et central technique
- 3 profils de gardiens

Chaque profil conserve une URL de fiche individuelle et une marque de vérification. Les statistiques de terrain sont les valeurs entières affichées sur la carte DLS 26. Pour les gardiens, GKR et GKH remplacent SHO et TAC dans le jeu de référence.

## Données conservées

- Note générale de la carte source, conservée dans `dls26Reference.baseOverall`.
- SPE, ACC, STA, STR, CON, PAS, SHO et TAC (ou GKR/GKH pour les gardiens).
- Taille de référence, avec une variation P27 limitée à ±2 cm.
- Pied préféré lorsqu'il est publié sur la fiche source.
- Type de carte, version, URL et statut de vérification.

## Adaptation P27

- La note finale reste déterminée par les limites de niveau de la division P27.
- L'écart de note est appliqué à 72 % sur les statistiques, puis chaque caractéristique reçoit un ajustement individuel de ±2 points. Cela conserve la signature du profil sans transformer brutalement toutes ses qualités.
- Les six attributs historiques du gameplay sont alimentés par les statistiques de la fiche : vitesse moyenne SPE/ACC, tir, passe, défense/tacle, endurance et contrôle.
- Les statistiques DLS complètes restent disponibles dans `dls26Stats`; la provenance est stockée dans `dls26Reference`.

## Identité fictive

Les noms, nationalités, clubs, numéros, contrats, historique et apparences restent générés par P27. Aucune identité réelle, photo, tenue, emblème ou donnée de club réel n'est copiée. La fiche source sert de modèle statistique et physique, pas de personnage à reproduire.

## Limite actuelle et suite

Les 14 fiches constituent un premier lot vérifié, pas encore l'import exhaustif des milliers de cartes DLS 26. Le format permet d'ajouter d'autres joueurs par lots, avec vérification individuelle de la note, du poste, de la taille, du pied et des huit statistiques avant intégration. Les profils provisoires précédemment utilisés avec des sources génériques d'équipes ont été retirés.

## Sources de référence

- https://sakibpro.com/players/normal/kylian-mbappe/14756/statistics/
- https://sakibpro.com/players/normal/erling-haaland/17196/changelog/
- https://sakibpro.com/players/normal/vinicius-junior/16320/statistics/
- https://sakibpro.com/players/normal/lautaro-martinez/16329/statistics/
- https://sakibpro.com/players/normal/dusan-vlahovic/17816/changelog/
- https://sakibpro.com/players/normal/pedro-gonzalez-lopez/17763/changelog/
- https://sakibpro.com/players/normal/henrikh-mkhitaryan/10806/changelog/
- https://sakibpro.com/players/normal/rodri/16327/statistics/
- https://sakibpro.com/players/normal/achraf-hakimi/15932/statistics/
- https://sakibpro.com/players/normal/federico-dimarco/18130/statistics/
- https://sakibpro.com/players/normal/virgil-van-dijk/7307/statistics/
- https://sakibpro.com/players/normal/nikola-milenkovic/15551/changelog/
- https://sakibpro.com/players/normal/sergino-dest/17190/changelog/
- https://sakibpro.com/players/normal/gianluigi-donnarumma/14078/

- https://sakibpro.com/players/normal/mohamed-salah/12027/statistics/
- https://sakibpro.com/players/normal/harry-kane/10159/statistics/
- https://sakibpro.com/players/normal/jude-bellingham/17799/
- https://sakibpro.com/players/normal/kevin-de-bruyne/7957/changelog/
- https://sakibpro.com/players/normal/william-saliba/17387/statistics/
- https://sakibpro.com/players/normal/alisson/14939/changelog/
- https://sakibpro.com/players/normal/thibaut-courtois/7458/statistics/

SakibPro est une base indépendante et non une source officielle First Touch Games. Les pages de statistiques détaillées permettent de vérifier les données de carte utilisées.
