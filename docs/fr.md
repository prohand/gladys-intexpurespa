# Intex PureSpa — intégration Gladys

Pilotez votre **spa Intex PureSpa** (modèles Wi-Fi) depuis Gladys :
alimentation, chauffage, filtration, bulles, jets, traitement au sel,
température de consigne, et lisez la température de l'eau et les codes
d'erreur du panneau de commande.

L'intégration dialogue **directement** avec le module Wi-Fi du spa sur votre
réseau local (port TCP 8990). Pas de compte Intex, pas de cloud : elle marche
même sans Internet.

## Spas compatibles

Les modèles Intex PureSpa avec Wi-Fi intégré, pilotés par l'application
**Intex** (anciennement « Intex Spa ») :

- modèles PureSpa Bubble avec contrôle Wi-Fi ;
- modèles PureSpa Jet & Bubble avec contrôle Wi-Fi — cochez _Mon spa a des
  jets hydromassants_ ;
- modèles avec électrolyseur au sel intégré — cochez _Mon spa a un traitement
  au sel_.

Les spas sans Wi-Fi ne sont pas pris en charge.

## Avant de commencer

1. Connectez le spa à votre Wi-Fi avec l'application Intex, comme l'explique
   la notice.
2. Dans votre box, donnez au spa une **adresse IP fixe** (réservation DHCP).
   L'intégration trouve le spa par cette adresse.
3. Gladys doit être sur le même réseau que le spa (ou pouvoir le joindre sur
   le port TCP 8990). Gladys **5.3** ou plus récent est requis.

## Configuration

Dans Gladys : **Intégrations → Intex PureSpa → Configuration**.

| Champ                              | À saisir                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| Adresse du spa                     | L'adresse IP du spa, ex. `192.168.1.50`.                                      |
| Port TCP                           | Laissez `8990`.                                                               |
| Mon spa a des jets hydromassants   | À cocher sur les modèles Jet & Bubble : ajoute un interrupteur _Jets_.        |
| Mon spa a un traitement au sel     | À cocher sur les modèles au sel : ajoute un interrupteur _Traitement au sel_. |
| Intervalle de rafraîchissement (s) | Fréquence de lecture du spa. 60 s par défaut, 30 s minimum.                   |

Enregistrez, puis cliquez sur **Tester la connexion** : la réponse affiche la
température de l'eau, la consigne et l'état du chauffage lus sur le spa.

Ouvrez ensuite l'onglet **Découverte** et ajoutez l'appareil _Intex PureSpa_.

## L'appareil

| Fonction                | Type                   | Remarques                                           |
| ----------------------- | ---------------------- | --------------------------------------------------- |
| Power (alimentation)    | Interrupteur           | Allume ou éteint tout le spa.                       |
| Filtration              | Interrupteur           | La pompe.                                           |
| Heater (chauffage)      | Interrupteur           | L'allumer démarre aussi la filtration.              |
| Bubbles (bulles)        | Interrupteur           |                                                     |
| Jets                    | Interrupteur           | Seulement avec _Mon spa a des jets hydromassants_.  |
| Salt sanitizer (sel)    | Interrupteur           | Seulement avec _Mon spa a un traitement au sel_.    |
| Water temperature (eau) | Capteur de température | Non publiée tant que le panneau affiche une erreur. |
| Target temperature      | Consigne de thermostat | 10–40 °C (ou 50–104 °F).                            |
| Error code              | Texte                  | `OK`, ou le code du panneau (`E81`, `E90`...).      |

Allumer une fonction alors que le spa est éteint allume d'abord le spa, comme
le fait le panneau de commande.

Le spa travaille en Celsius ou en Fahrenheit selon le réglage de son panneau :
l'intégration le détecte et les températures suivent.

## Widget du tableau de bord

Ajoutez le widget **Spa Intex** à un tableau de bord. Il affiche :

- la température de l'eau et la consigne, en direct ;
- l'état de chaque fonction, la connexion et le code d'erreur ;
- des boutons : chauffage, bulles, filtration marche/arrêt, et **Régler la
  consigne**, qui ouvre un petit formulaire.

## Scènes

### Déclencheurs

- **Erreur du spa détectée** — le panneau affiche un code d'erreur. Le code
  est disponible dans `{{triggerEvent.data.code}}`.
- **Température de l'eau atteinte** — le chauffage a amené l'eau à la
  température de consigne (`temperature`, `target`).
- **Le spa ne répond plus** — le spa répondait, puis s'est tu (coupure de
  courant, Wi-Fi perdu...).

Pour agir sur un seuil (eau sous 30 °C...), utilisez le déclencheur standard
« état d'un appareil » sur la fonction _Water temperature_.

### Actions

- **Chauffer le spa à** — règle la consigne et allume le chauffage (décochez
  _Allumer le chauffage_ pour ne changer que la consigne). Sorties :
  température de l'eau, consigne, chauffage, code d'erreur.
- **Lire l'état du spa** — lit le spa maintenant. Sorties : températures,
  alimentation, chauffage, filtration, bulles, code d'erreur.

Exemple : « Tous les vendredis à 14 h, chauffer le spa à 38 °C », puis
« Quand la température de l'eau est atteinte, m'envoyer un message ».

## Bon à savoir

- Le module Wi-Fi du spa est lent et ne sert **qu'un client à la fois**.
  L'intégration garde une seule connexion ouverte et n'envoie qu'une requête
  à la fois. L'application Intex peut répondre plus lentement pendant que
  Gladys est connecté.
- Pour la signification d'un code d'erreur (E81, E90...), voir la notice de
  votre spa : l'intégration transmet le code affiché par le panneau.
- L'intégration n'enregistre rien sur le disque.

## Dépannage

- **« Le spa ne répond pas »** : vérifiez que le spa est alimenté, que son
  voyant Wi-Fi est allumé, et que l'adresse est la bonne (essayez un `ping`
  depuis la machine Gladys). Si l'adresse a changé, faites une réservation
  DHCP.
- **Le badge de l'appareil est rouge (« injoignable »)** : mêmes
  vérifications. Le badge redevient « local » dès que le spa répond.
- **Un interrupteur revient à son ancien état** : le panneau a refusé l'ordre
  (le chauffage pendant un défaut, par exemple). Regardez le code d'erreur.
- **Logs détaillés** : dans Gladys, ouvrez les logs de l'intégration dans
  **Paramètres → Système**.
