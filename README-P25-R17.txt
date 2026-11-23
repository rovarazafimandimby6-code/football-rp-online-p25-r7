FOOTBALL RP ONLINE P25 R17
Version 25.17.0

Cette livraison est reconstruite à partir de l'archive vérifiable P25 R14 récupérée dans la Bibliothèque. Les annonces R15/R16 faites dans des échanges précédents n'étaient pas archivées et leurs ZIP n'étaient pas disponibles dans l'espace de travail ; les fonctions décrites alors ne sont donc pas supposées présentes dans cette base. R17 intègre et teste les améliorations ci-dessous directement sur R14.

NOUVEAUTÉS R17
- Comptabilisation serveur des passes, tirs et tacles uniquement lorsqu'une action est acceptée.
- Agrégation des statistiques par équipe.
- Résultat de match final immuable, avec score, issue (victoire/nul), durée, date de finalisation et statistiques des joueurs.
- Événement réseau fulltime et résultat inclus dans l'état public.
- Endpoint GET /api/rooms/:id/result, disponible uniquement après le coup de sifflet final.
- Contrôle des cas résultat prématuré, salon inconnu et statistiques non gonflées par les actions refusées.

PRÉSERVATION
- Un humain contrôle uniquement son propre avatar.
- Les bots restent contrôlés par le serveur.
- Les équipes restent limitées à cinq joueurs.
- La mi-temps et l'inversion des côtés R14 sont conservées.

LIMITES
- Les buts sont enregistrés au niveau du score d'équipe ; l'attribution individuelle du buteur et de la passe décisive n'est pas encore fiable car la simulation ne conserve pas encore l'identité du dernier toucher sur toutes les trajectoires.
- Les statistiques avancées (passes réussies, interceptions, arrêts, possession individuelle) ne sont pas encore implémentées.
- Les salons et résultats restent en mémoire vive et ne survivent pas au redémarrage du processus.
- Aucun test physique sur deux appareils Android ni mesure FPS WebGL n'a été effectué.
