FOOTBALL RP ONLINE P25 — R14
Version 25.14.0

R14 consolide le déroulement des matchs en ligne avec une vraie phase de mi-temps autoritaire. À la fin de la première période, le serveur fige les entrées et les vitesses, immobilise le ballon, publie l'événement de mi-temps et bloque les commandes de jeu. Après cinq secondes, il inverse les côtés et les directions d'attaque, replace les joueurs, remet le ballon au centre et lance automatiquement la seconde période. Le temps réglementaire est calculé sans compter la pause.

Le client 3D en ligne reconnaît désormais la phase « halftime », affiche un écran de mi-temps, puis le retire à la reprise automatique. Les joueurs humains conservent le contrôle exclusif de leur propre avatar ; la simulation reste autoritaire côté serveur.

Autres sécurités : reprise de période même si un tick serveur est retardé au-delà de la pause ; tests de durée réglementaire avec pause ; test du blocage des inputs pendant la mi-temps.

Lancement : npm install && npm start
Tests : npm test

Limites connues : salons et sessions restent en mémoire volatile et ne survivent pas au redémarrage du processus. Les tests automatisés ne remplacent pas un essai réel sur deux appareils Android ni une validation de performances WebGL sur téléphone.
