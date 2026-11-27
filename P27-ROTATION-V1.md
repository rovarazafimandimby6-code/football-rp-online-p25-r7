# Football RP Online P27 — règles de rotation V1

## Règles produit validées
- Format : 5 joueurs par équipe sur le terrain.
- Feuille de match : 3 à 7 remplaçants supplémentaires par équipe.
- Effectif convoqué : 8 à 12 joueurs par équipe.
- Changements illimités ; aucun compteur de quota de substitutions.
- Un joueur remplacé peut revenir, après 10 minutes de temps de match depuis sa sortie.
- Les remplacements se font pendant un arrêt de jeu.
- Les postes ne sont pas verrouillés : un joueur peut entrer à un autre poste, y compris le gardien si la composition est réorganisée.
- Le joueur humain sur le banc reste dans la rencontre en mode observation ; les commandes de jeu doivent être masquées jusqu'à son entrée effective.
- À son entrée, le contrôle et les commandes tactiles sont transférés vers son avatar ; à sa sortie, retour en observation depuis le banc.
- En cas de déconnexion, l'IA prend temporairement le contrôle du même avatar et rend le contrôle au retour du joueur.
- Le niveau de jeu de cette IA de remplacement est plafonné à une performance moyenne : elle doit rester fonctionnelle et cohérente sans surperformer comme une IA experte ni pénaliser volontairement l'équipe.
- Tant que l'IA contrôle l'avatar, un indicateur discret « Contrôlé par l’IA » apparaît près du nom du joueur ; il disparaît dès que le contrôle humain est rétabli.
- La prise en charge IA ne change ni l'identité, ni le poste courant, ni les statistiques déjà acquises par l'avatar.

## Fondations techniques ajoutées
Le module `src/rotation-rules.js` formalise les limites de feuille de match, la validation des échanges, l'absence de quota et le délai de retour. Les tests couvrent les règles de base et l'échange de joueurs en conservant le slot tactique.

## Intégration et état d'avancement
La prise en charge IA d'un avatar déconnecté est désormais intégrée au serveur autoritaire : l'avatar reste dans la simulation, garde son identifiant et la possession du ballon, et peut être repris par le même jeton jusqu'à la fin du match. L'IA de remplacement utilise une vitesse réduite, ne sprinte pas automatiquement et son statut est diffusé dans les snapshots ; l'interface affiche « · IA » avec l'intitulé accessible « Contrôlé par l’IA · niveau moyen ».

Le mode banc est intégré au serveur et au client : chaque équipe dispose de cinq titulaires et de sept réservistes par défaut ; jusqu'à sept humains peuvent occuper les douze places d'un club. Les humains supplémentaires arrivent sur le banc, peuvent demander à entrer et, une fois titulaires, peuvent demander à sortir eux-mêmes en remplaçant un bot. Le serveur n'autorise jamais un joueur à sortir un autre humain sans son consentement. Les demandes sont traitées aux arrêts de jeu ; un joueur précédemment sorti ne peut revenir qu'après dix minutes de temps de match. La caméra spectateur et le verrouillage des commandes sont reliés à l'état `isOnPitch`. Les minutes jouées et les statistiques restent attachées à l'identité du joueur.

Points restant à finaliser :
1. améliorer la présentation 3D du banc (bancs physiques, alignement, animations d'attente et transitions) ;
2. gérer le cas où aucun bot/IA remplaçable n'est disponible, avec retour d'état explicite au joueur ;
3. valider visuellement la caméra spectateur et les transitions sur Android ;
4. compléter l'historique visuel des rotations et l'affichage des minutes jouées.
