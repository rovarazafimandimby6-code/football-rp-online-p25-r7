FOOTBALL RP ONLINE — P24 (BASE DE TRAVAIL RÉCUPÉRÉE)

Base récupérée : football-rp-online-p23(20261122-085411).zip
Version de travail : 24.0.0

P24 — CHANTIERS AJOUTÉS DANS CETTE CONSOLIDATION
1. Effectifs de salon complétés par des bots serveur :
   - Dès la première arrivée humaine, le serveur remplit chaque équipe jusqu'à trois joueurs.
   - Les bots occupent les places de réserve et jouent sous contrôle serveur.
   - Les arrivées humaines remplacent les bots de leur équipe, sans dépasser cinq joueurs par équipe.
   - Les bots poursuivent le ballon, se replacent en soutien, tentent des tirs et des tacles selon la situation.
   - Un bot n'a aucun jeton et ne peut pas être authentifié comme joueur humain.
2. Synchronisation incrémentale :
   - Identifiants croissants pour les événements du match.
   - Endpoint GET /api/rooms/:id?sinceSequence=N&afterEventId=M.
   - Réponse HTTP 204 lorsque le snapshot n'a pas changé, afin d'éviter de renvoyer inutilement tout l'état.
   - Le client pollState retourne les nouveaux événements et le curseur associé.
3. Restauration de session :
   - Le client peut sauvegarder et restaurer roomId, token et playerId dans sessionStorage (ou un stockage injecté pour les tests).
   - La session est supprimée lors d'un leave réussi.

LIMITES À NE PAS MASQUER
- La base récupérée est P23, pas une archive P24 contenant les modifications du précédent fil. Les travaux P24 décrits dans le compte rendu (raccordement complet de la scène 3D, avatars distants, HUD/commandes, synchronisation carrière) ne sont pas présents dans cette archive source et ne sont pas revendiqués comme terminés ici.
- Le pont réseau vers le rendu 3D et la validation visuelle restent à achever/vérifier.
- Les bots serveur sont une IA de remplissage fonctionnelle, pas une IA tactique de niveau professionnel.
- Le polling réduit le trafic en cas d'absence de changement, mais reste du polling HTTP ; ce n'est pas du WebSocket.
- Les tests automatisés ne remplacent pas les essais multi-appareils et Android physique.

LANCEMENT
  npm test
  npm start

Le serveur écoute sur PORT ou 8080.

P25 — approfondissement visuel des joueurs en match
- Visages : blanc des yeux séparé des pupilles pour une lecture faciale plus nette.
- Tenues : coutures de maillot, bandes de chaussettes et lacets de chaussures.
- Mains : doigts et pouces simplifiés, avec matériau de gants conservé pour les gardiens.
- Animation : delta de frame borné (0 à 50 ms) et horloge de secours lorsque performance.now n'est pas disponible.
- Ces ajouts restent des détails procéduraux légers ; ils ne remplacent pas des modèles sous licence/GLB, textures PBR ou animations mocap.
