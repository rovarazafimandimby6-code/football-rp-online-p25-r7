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
- En cas de déconnexion, l'IA prend temporairement le contrôle de l'avatar, puis rend le contrôle au retour du joueur.

## Fondations techniques ajoutées
Le module `src/rotation-rules.js` formalise les limites de feuille de match, la validation des échanges, l'absence de quota et le délai de retour. Les tests couvrent les règles de base et l'échange de joueurs en conservant le slot tactique.

## Intégration restante
Cette étape ne prétend pas encore livrer le mode banc complet. Il reste à relier ces règles :
1. au modèle autoritaire du serveur multijoueur (joueurs actifs et réserves humains distincts) ;
2. aux actions de demande/validation de remplacement et à leur synchronisation réseau ;
3. à la scène 3D du banc, à la caméra spectateur et aux commandes tactiles conditionnelles ;
4. à la gestion du contrôle IA temporaire lors d'une déconnexion et au retour du contrôle humain ;
5. aux statistiques individuelles, minutes jouées et historique des rotations.
