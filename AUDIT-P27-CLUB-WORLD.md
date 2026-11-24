# Audit P27 — Monde des 156 clubs et divisions

Date de vérification : 24 novembre 2026  
Branche : `p27-dev`  
Commit audité : `f43eed2632f5e8887919fdf1d06da3d23c9ff517`  
Workflow : [GitHub Actions 45395141760](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45395141760)

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

Le calendrier des neuf groupes est audité : 1 306 rencontres de championnat en aller simple, chaque club rencontre chaque adversaire une fois et l'écart domicile/extérieur est au plus égal à un match. La Coupe des Clubs réunit les 156 clubs dans un tableau de 155 rencontres.

## API publique du catalogue

- `GET /api/league-structure` : divisions, conférences, effectifs courants et indicateur `complete`.
- `GET /api/clubs` : catalogue paginé ; filtres `division`, `conference`, recherche `q`, pagination `limit` et `offset`.
- `GET /api/clubs/:id` : fiche publique d'un club.

Les réponses publiques ne contiennent ni effectifs détaillés, ni contrats privés. Les listes et fiches lisent les affectations de la saison active ; les changements de division sont donc reflétés après une transition de saison. Les équipes de match reprennent également la division et la conférence courantes.

## Validation CI

- **512 tests réussis**
- **0 échec**
- Contrôle de syntaxe JavaScript exécuté avec succès
- Run : [45395141760](https://github.com/rovarazafimandimby6-code/football-rp-online-p25-r7/actions/runs/45395141760)

## Décisions qui restent à approuver

Ces éléments ne sont pas verrouillés par cet audit :

1. Le barème de promotions/relégations demeure une proposition de politique. L'aperçu calcule les mouvements et la transition valide les capacités, mais le barème n'est pas déclaré définitivement approuvé.
2. Le calendrier actuel est en aller simple. Le passage à un aller-retour doublerait le nombre de rencontres de championnat ; il n'a pas été activé sans décision explicite.
3. L'API du catalogue est intégrée et testée. Une page graphique dédiée au catalogue des clubs dans l'interface du jeu et une validation visuelle sur appareil Android ne sont pas couvertes par cette validation serveur.

## Conclusion

Le **catalogue de 156 clubs, la structure des cinq divisions, les neuf groupes, l'affectation géographique, les calendriers, les contrôles d'intégrité et l'API publique** sont intégrés et validés automatiquement sur `p27-dev`.

Cet audit certifie le périmètre données/serveur décrit ci-dessus. Il ne certifie pas l'ensemble du jeu P27, l'expérience graphique mobile, les performances Android ni les décisions sportives qui restent à approuver.
