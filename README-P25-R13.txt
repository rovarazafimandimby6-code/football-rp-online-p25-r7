FOOTBALL RP ONLINE P25 — R13
Version 25.13.0

R13 consolide la reconnexion réseau des matchs en ligne. En cas de coupure courte, le client tente de restaurer la session existante, reprend la séquence d'inputs attendue par le serveur et continue de contrôler uniquement l'avatar associé au jeton. Les erreurs réseau déclenchent une temporisation exponentielle pour éviter de saturer le serveur sur Android ou réseau instable.

Lancement :
  npm install
  npm start

Tests :
  npm test

Le serveur de match utilise encore une mémoire volatile : les salons ne survivent pas à un redémarrage du processus. Les tests automatisés ne remplacent pas une validation réelle sur deux appareils Android. Voir AUDIT-P25-R13.txt.
