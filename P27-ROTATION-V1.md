# Football RP Online P27 — règles de rotation V1

## Règles produit validées
- Format : 5 joueurs par équipe sur le terrain.
- Feuille de match : 2 à 5 remplaçants supplémentaires par équipe.
- Effectif convoqué : 7 à 10 joueurs par équipe.
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

Le mode banc complet n'est pas encore livré. Il reste à relier ces règles :
1. au modèle autoritaire du serveur multijoueur (joueurs actifs et réserves humains distincts) ;
2. aux actions de demande/validation de remplacement et à leur synchronisation réseau ;
3. à la scène 3D du banc, à la caméra spectateur et aux commandes tactiles conditionnelles ;
4. à la gestion du contrôle IA temporaire lors d'une déconnexion et au retour du contrôle humain ; (socle serveur et indication de statut déjà intégrés, scénarios avancés à compléter)
5. aux statistiques individuelles, minutes jouées et historique des rotations.
