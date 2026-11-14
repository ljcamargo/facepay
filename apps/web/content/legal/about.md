# Acerca de FacePay MX

**Versión:** 2026-11-14

## Qué es

Un punto de venta para tablet que permite cobrar con **CoDi®**, el sistema de pagos instantáneos del
Banco de México, sin que el cliente tenga que sacar su tarjeta.

El cliente puede pagar de tres maneras:

1. **Escaneando un código QR CoDi** que se muestra en la tablet.
2. **Recibiendo una solicitud de cobro** (notificación push CoDi) en su celular.
3. **Siendo reconocido por su rostro**, para que la tablet sepa a qué celular enviar esa solicitud.

## Lo que este sistema no hace

- **No autoriza pagos con el rostro.** El rostro solo identifica. El cobro lo aprueba el cliente en la
  aplicación de su banco, con la seguridad de su banco.
- **No guarda fotografías.** Guarda una plantilla matemática de 1024 números, no una imagen.
- **No custodia dinero.** Los pagos llegan directamente a la cuenta bancaria del comercio.
- **No usa tarjetas.** No hay datos de tarjeta en este sistema.

## Cómo funciona el reconocimiento

La cámara de la tablet calcula una plantilla del rostro y la compara con las plantillas registradas.
La comparación busca **una coincidencia**, no una autorización. Si no hay coincidencia —o si el cliente
prefiere no usar su rostro— el cobro continúa con el código QR CoDi.

## Privacidad

El cliente decide si registra su rostro. Puede borrarlo cuando quiera y puede pagar sin darlo. Los
detalles están en el [Aviso de Privacidad](/legal/privacy) y en el
[consentimiento biométrico](/legal/biometric-consent).

## Estado del proyecto

Demostrador en desarrollo. Esta versión funciona con **datos de ejemplo** y no procesa cobros reales.

## Contacto

{{LEGAL_NAME}} · {{PRIVACY_EMAIL}}
