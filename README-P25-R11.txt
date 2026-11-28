FOOTBALL RP ONLINE — P25 R11

R11 apporte une couche de synchronisation client 3D pour les salons autoritaires existants.

- OnlineMatchBridge associe les joueurs serveur aux avatars locaux par équipe et emplacement.
- Le joueur humain est attaché à son propre avatar identifié par playerId ; aucune sélection automatique d'un autre joueur n'est effectuée.
- Les snapshots autoritaires synchronisent positions, orientation, vitesses, possession et ballon.
- Les avatars distants utilisent SnapshotBuffer pour lisser les déplacements et rejeter les séquences obsolètes.
- Les commandes de déplacement et sprint sont transmises à cadence bornée ; les actions passent par les validations du serveur.
- Les événements de but, passe, tir et tacle déclenchent les transitions d'animation correspondantes.
- La couche est injectable et isolée : elle ne remplace pas la simulation locale tant qu'un parcours de salon en ligne complet n'est pas activé.

Validation : voir AUDIT-P25-R11.txt.
Limites : pas encore de parcours utilisateur de création/recherche/rejoindre salon dans le menu ; pas de test E2E sur deux appareils Android ni de validation réseau réel.
