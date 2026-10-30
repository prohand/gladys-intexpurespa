# Intex PureSpa — integración para Gladys

Controle su **spa Intex PureSpa** (modelos Wi-Fi) desde Gladys: encendido,
calefacción, filtración, burbujas, chorros, clorador salino, temperatura
objetivo, y lea la temperatura del agua y los códigos de error del panel de
control.

La integración se comunica **directamente** con el módulo Wi-Fi del spa en su
red local (puerto TCP 8990). Sin cuenta Intex, sin nube: funciona incluso sin
Internet.

## Spas compatibles

Los modelos Intex PureSpa con Wi-Fi integrado, controlados con la app
**Intex** (antes «Intex Spa»):

- modelos PureSpa Bubble con control Wi-Fi;
- modelos PureSpa Jet & Bubble con control Wi-Fi — marque _Mi spa tiene
  chorros de hidromasaje_;
- modelos con sistema de agua salada integrado — marque _Mi spa tiene
  clorador salino_.

Los spas sin Wi-Fi no son compatibles.

## Antes de empezar

1. Conecte el spa a su Wi-Fi con la app de Intex, como indica el manual.
2. En su router, asigne al spa una **dirección IP fija** (reserva DHCP). La
   integración encuentra el spa por esa dirección.
3. Gladys debe estar en la misma red que el spa (o poder alcanzarlo en el
   puerto TCP 8990). Se necesita Gladys **5.3** o posterior.

## Configuración

En Gladys: **Integraciones → Intex PureSpa → Configuración**.

| Campo                               | Qué escribir                                                            |
| ----------------------------------- | ----------------------------------------------------------------------- |
| Dirección del spa                   | La dirección IP del spa, p. ej. `192.168.1.50`.                         |
| Puerto TCP                          | Deje `8990`.                                                            |
| Mi spa tiene chorros de hidromasaje | Márquelo en los modelos Jet & Bubble: añade un interruptor _Jets_.      |
| Mi spa tiene clorador salino        | Márquelo en los modelos con sal: añade un interruptor _Salt sanitizer_. |
| Intervalo de actualización (s)      | Frecuencia de lectura del spa. 60 s por defecto, 30 s como mínimo.      |

Guarde y pulse **Probar la conexión**: la respuesta muestra la temperatura del
agua, la temperatura objetivo y el estado de la calefacción.

Luego abra la pestaña **Descubrir** y añada el dispositivo _Intex PureSpa_.

## El dispositivo

| Función            | Tipo                   | Notas                                             |
| ------------------ | ---------------------- | ------------------------------------------------- |
| Power              | Interruptor            | Enciende o apaga todo el spa.                     |
| Filtration         | Interruptor            | La bomba.                                         |
| Heater             | Interruptor            | Encenderla también arranca la filtración.         |
| Bubbles            | Interruptor            |                                                   |
| Jets               | Interruptor            | Solo con _Mi spa tiene chorros de hidromasaje_.   |
| Salt sanitizer     | Interruptor            | Solo con _Mi spa tiene clorador salino_.          |
| Water temperature  | Sensor de temperatura  | No se publica mientras el panel muestra un error. |
| Target temperature | Consigna de termostato | 10–40 °C (o 50–104 °F).                           |
| Error code         | Texto                  | `OK`, o el código del panel (`E81`, `E90`...).    |

Encender una función con el spa apagado enciende primero el spa, como hace el
panel de control.

El spa trabaja en Celsius o Fahrenheit según el ajuste de su panel: la
integración lo detecta y las temperaturas lo siguen.

## Widget del panel

Añada el widget **Spa Intex** a un panel. Muestra:

- la temperatura del agua y la objetivo, en directo;
- el estado de cada función, la conexión y el código de error;
- botones: calefacción, burbujas, filtración encendido/apagado y **Fijar
  temperatura**, que abre un pequeño formulario.

## Escenas

### Disparadores

- **Error del spa detectado** — el panel muestra un código de error. El código
  está en `{{triggerEvent.data.code}}`.
- **Temperatura del agua alcanzada** — la calefacción ha llevado el agua a la
  temperatura objetivo (`temperature`, `target`).
- **El spa ya no responde** — el spa respondía y dejó de hacerlo (corte de
  luz, Wi-Fi perdido...).

Para actuar según un umbral (agua por debajo de 30 °C...), use el disparador
estándar «estado de un dispositivo» sobre la función _Water temperature_.

### Acciones

- **Calentar el spa a** — fija la temperatura objetivo y enciende la
  calefacción (desmarque _Encender la calefacción_ para cambiar solo la
  consigna). Salidas: temperatura del agua, objetivo, calefacción, código de
  error.
- **Leer el estado del spa** — lee el spa ahora. Salidas: temperaturas,
  encendido, calefacción, filtración, burbujas, código de error.

Ejemplo: «Cada viernes a las 14 h, calentar el spa a 38 °C» y luego «Cuando se
alcance la temperatura del agua, enviarme un mensaje».

## Conviene saber

- El módulo Wi-Fi del spa es lento y solo atiende **a un cliente a la vez**.
  La integración mantiene una única conexión abierta y envía una petición
  tras otra. La app de Intex puede responder más despacio mientras Gladys está
  conectado.
- Para el significado de un código de error (E81, E90...), consulte el manual
  de su spa: la integración transmite el código que muestra el panel.
- La integración no guarda nada en disco.

## Solución de problemas

- **«El spa no responde»**: compruebe que el spa tiene corriente, que su luz
  Wi-Fi está encendida y que la dirección es correcta (pruebe un `ping` desde
  la máquina de Gladys). Si la dirección cambió, configure una reserva DHCP.
- **La insignia del dispositivo está en rojo («inaccesible»)**: las mismas
  comprobaciones. La insignia vuelve a «local» en cuanto el spa responde.
- **Un interruptor vuelve a su estado anterior**: el panel rechazó la orden
  (la calefacción durante un fallo, por ejemplo). Mire el código de error.
- **Registros detallados**: en Gladys, abra los registros de la integración en
  **Ajustes → Sistema**.
