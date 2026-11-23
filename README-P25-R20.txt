FOOTBALL RP ONLINE P25 — R20
Version 25.20.0

R20 consolide R19 et améliore le stockage et la consultation des résultats finalisés.

NOUVEAUTÉS
- Historique serveur paginé : GET /api/results?limit=20&offset=0.
- Réponse : results + pagination (limit, offset, total, hasMore, nextOffset).
- Les paramètres de pagination invalides renvoient HTTP 400 / INVALID_PAGINATION.
- Validation des scores, identifiants de match et horodatages avant écriture.
- Fichiers temporaires d'écriture uniques.

DÉMARRAGE
- npm install (aucune dépendance ajoutée)
- npm test
- npm start

PERSISTANCE
- RESULTS_DIR peut pointer vers un volume persistant.
- Sans volume persistant, les résultats peuvent être perdus au redéploiement selon l'hébergeur.

Voir AUDIT-P25-R20.txt pour les résultats des tests et les limites connues.
