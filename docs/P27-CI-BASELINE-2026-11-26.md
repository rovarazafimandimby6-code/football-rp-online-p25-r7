# P27 — état de contrôle CI (26 novembre 2026)

Commit contrôlé avant cette note : `da5635c3275611014fdafc28dd3164f13f07b53c`.

Le workflow `P27 CI` a exécuté 1 027 tests : **1 022 réussis, 5 en échec**. Les cinq échecs rapportés sont à traiter séparément; ne pas les masquer ni les présenter comme des tests de calendrier :

1. `tests/p27-dls26-hub.test.mjs` — l'ancien test attend encore la fonction `loadRpClubPage()` alors que le hub a été réorganisé.
2. `tests/p27-room-api-auth.test.mjs` — assertion de statut HTTP `200` contre `204` pour une réponse de route.
3. `tests/p27-rp-club-api.test.mjs` — assertion `403` contre `409` sur une requête Club RP invalide.
4. `tests/p27-rp-club-match-service.test.mjs` — fixture du service ne fournit pas `clubStore.canLead()`.
5. Le même fichier — la fixture attend une erreur de fenêtre horaire, mais la permission de responsable est vérifiée en premier.

Ces résultats constituent un **CI rouge**, pas une validation complète. Le calendrier D1 possède ses tests ciblés, mais la confirmation de leur réussite doit venir d'un run postérieur au dernier commit. Priorité : corriger les fixtures/contrats en cohérence avec le comportement réel, puis relancer le workflow entier.
