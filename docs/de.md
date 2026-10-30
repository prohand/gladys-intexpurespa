# Intex PureSpa — Gladys-Integration

Steuere dein **Intex PureSpa** (WLAN-Modelle) aus Gladys: Strom, Heizung,
Filterung, Sprudel, Düsen, Salzdesinfektion, Solltemperatur — und lies die
Wassertemperatur und die Fehlercodes des Bedienfelds.

Die Integration spricht **direkt** mit dem WLAN-Modul des Spas in deinem
lokalen Netzwerk (TCP-Port 8990). Kein Intex-Konto, keine Cloud: Sie
funktioniert auch ohne Internet.

## Kompatible Spas

Intex-PureSpa-Modelle mit eingebautem WLAN, gesteuert über die App **Intex**
(früher „Intex Spa“):

- PureSpa-Bubble-Modelle mit WLAN-Steuerung;
- PureSpa-Jet-&-Bubble-Modelle mit WLAN-Steuerung — aktiviere _Mein Spa hat
  Massagedüsen_;
- Modelle mit eingebautem Salzwassersystem — aktiviere _Mein Spa hat eine
  Salzdesinfektion_.

Spas ohne WLAN werden nicht unterstützt.

## Bevor du beginnst

1. Verbinde das Spa mit der Intex-App mit deinem WLAN, wie in der Anleitung
   beschrieben.
2. Gib dem Spa in deinem Router eine **feste IP-Adresse**
   (DHCP-Reservierung). Die Integration findet das Spa über diese Adresse.
3. Gladys muss im selben Netzwerk wie das Spa sein (oder es über TCP-Port 8990
   erreichen). Gladys **5.3** oder neuer ist erforderlich.

## Konfiguration

In Gladys: **Integrationen → Intex PureSpa → Konfiguration**.

| Feld                               | Eingabe                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Adresse des Spas                   | Die IP-Adresse des Spas, z. B. `192.168.1.50`.                                      |
| TCP-Port                           | `8990` lassen.                                                                      |
| Mein Spa hat Massagedüsen          | Bei Jet-&-Bubble-Modellen aktivieren: fügt einen Schalter _Jets_ hinzu.             |
| Mein Spa hat eine Salzdesinfektion | Bei Modellen mit Salzsystem aktivieren: fügt einen Schalter _Salt sanitizer_ hinzu. |
| Aktualisierungsintervall (s)       | Wie oft das Spa gelesen wird. Standard 60 s, mindestens 30 s.                       |

Speichern und dann auf **Verbindung testen** klicken: Die Antwort zeigt die
Wassertemperatur, die Solltemperatur und den Zustand der Heizung.

Öffne danach den Tab **Entdecken** und füge das Gerät _Intex PureSpa_ hinzu.

## Das Gerät

| Funktion           | Typ                 | Hinweise                                                   |
| ------------------ | ------------------- | ---------------------------------------------------------- |
| Power              | Schalter            | Schaltet das ganze Spa ein oder aus.                       |
| Filtration         | Schalter            | Die Pumpe.                                                 |
| Heater (Heizung)   | Schalter            | Einschalten startet auch die Filterung.                    |
| Bubbles (Sprudel)  | Schalter            |                                                            |
| Jets (Düsen)       | Schalter            | Nur mit _Mein Spa hat Massagedüsen_.                       |
| Salt sanitizer     | Schalter            | Nur mit _Mein Spa hat eine Salzdesinfektion_.              |
| Water temperature  | Temperatursensor    | Nicht gesendet, solange das Bedienfeld einen Fehler zeigt. |
| Target temperature | Thermostat-Sollwert | 10–40 °C (oder 50–104 °F).                                 |
| Error code         | Text                | `OK` oder der Code des Bedienfelds (`E81`, `E90`...).      |

Wird eine Funktion **eingeschaltet**, während das Spa aus ist, wird zuerst
das Spa eingeschaltet — wie am Bedienfeld.

Das Spa arbeitet je nach Einstellung seines Bedienfelds in Celsius oder
Fahrenheit: Die Integration erkennt es, die Temperaturen folgen.

## Dashboard-Widget

Füge das Widget **Intex-Spa** zu einem Dashboard hinzu. Es zeigt:

- die Wasser- und Solltemperatur, live;
- den Zustand jeder Funktion, die Verbindung und den Fehlercode;
- Schaltflächen: Heizung, Sprudel, Filterung an/aus und **Temperatur
  setzen**, das ein kleines Formular öffnet.

## Szenen

### Auslöser

- **Spa-Fehler erkannt** — das Bedienfeld zeigt einen Fehlercode. Der Code
  steht in `{{triggerEvent.data.code}}`.
- **Wassertemperatur erreicht** — die Heizung hat das Wasser auf die
  Solltemperatur gebracht (`temperature`, `target`).
- **Spa antwortet nicht mehr** — das Spa hat geantwortet und dann aufgehört
  (Stromausfall, WLAN weg...).

Für einen Schwellwert (Wasser unter 30 °C...) nutze den Standard-Auslöser
„Gerätezustand“ auf der Funktion _Water temperature_.

### Aktionen

- **Spa aufheizen auf** — setzt die Solltemperatur und schaltet die Heizung
  ein (_Heizung einschalten_ abwählen, um nur den Sollwert zu ändern).
  Ausgaben: Wassertemperatur, Sollwert, Heizung, Fehlercode.
- **Spa-Status lesen** — liest das Spa sofort. Ausgaben: Temperaturen, Strom,
  Heizung, Filterung, Sprudel, Fehlercode.

Beispiel: „Jeden Freitag um 14 Uhr das Spa auf 38 °C aufheizen“, dann „Wenn
die Wassertemperatur erreicht ist, schick mir eine Nachricht“.

## Gut zu wissen

- Das WLAN-Modul des Spas ist langsam und bedient **nur einen Client
  gleichzeitig**. Die Integration hält eine einzige Verbindung offen und
  sendet eine Anfrage nach der anderen. Die Intex-App kann langsamer
  antworten, solange Gladys verbunden ist.
- Die Bedeutung eines Fehlercodes (E81, E90...) steht in der Anleitung deines
  Spas: Die Integration gibt den Code des Bedienfelds weiter.
- Die Integration speichert nichts auf der Festplatte.

## Fehlerbehebung

- **„Das Spa antwortet nicht“**: Prüfe, ob das Spa Strom hat, ob seine
  WLAN-Anzeige leuchtet und ob die Adresse stimmt (`ping` vom Gladys-Rechner).
  Hat sich die Adresse geändert, richte eine DHCP-Reservierung ein.
- **Das Geräte-Badge ist rot („nicht erreichbar“)**: dieselben Prüfungen. Das
  Badge wird wieder „lokal“, sobald das Spa antwortet.
- **Ein Schalter springt zurück**: Das Bedienfeld hat den Befehl abgelehnt
  (z. B. die Heizung während eines Fehlers). Sieh dir den Fehlercode an.
- **Detaillierte Logs**: In Gladys unter **Einstellungen → System** die Logs
  der Integration öffnen.
