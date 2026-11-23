FOOTBALL RP ONLINE — P25 R12

R12 ajoute un premier parcours multijoueur utilisable depuis le menu :
- créer un salon et obtenir un code ;
- consulter les salons actifs et leurs effectifs humains ;
- rejoindre par code ou depuis la liste ;
- synchroniser le nom affiché du joueur ;
- lancer le moteur 3D avec OnlineMatchBridge ;
- appliquer les snapshots autoritaires au ballon et aux avatars ;
- transmettre les commandes du seul avatar humain ;
- laisser le serveur gérer les bots, la simulation, le score et le chronomètre ;
- éviter une seconde simulation IA/physique locale pendant un match en ligne ;
- heartbeat périodique et libération de la session en quittant le match.

Le mode local et la carrière locale restent disponibles indépendamment du multijoueur.

Démarrage serveur : npm start (PORT configurable, 8080 par défaut).
Le client utilise la même origine HTTP que le site ; héberger uniquement les fichiers statiques ne suffit pas, le serveur Node doit être déployé.

Limites : salons en mémoire, pas de persistance ni de reconnexion automatique après expiration. Le parcours doit encore être validé sur deux appareils Android réels.
Voir AUDIT-P25-R12.txt pour le détail des tests et limites.
